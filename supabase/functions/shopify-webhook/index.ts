// Shopify → Shipday. Registrar en Shopify (Configuración → Notificaciones →
// Webhooks) con evento "Creación de pedidos" o "Preparación de pedidos":
//   https://<PROJECT_REF>.supabase.co/functions/v1/shopify-webhook
// Desplegar con --no-verify-jwt (Shopify no envía JWT de Supabase).
import {
  createShipdayOrder,
  json,
  normalizePhone,
  shopifyOrderToShipday,
  shouldDispatchShopifyOrder,
} from '../_shared/shipday.ts';
import { logJob, resolverTarifa, upsertPedido, type ZonaResuelta } from '../_shared/db.ts';

// Detecta la tarifa de envío GRATIS (>$300 aplica en todo el país). Por NOMBRE de la tarifa (término
// configurable por env), NO por precio $0 — así "Recoger en tienda" (también $0) NO cuenta como envío gratis.
function esEnvioGratis(shopifyOrder: any): boolean {
  const terms = (Deno.env.get('SHOPIFY_FREE_SHIP_TERMS') ?? 'gratis,free').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const lines: string[] = (shopifyOrder?.shipping_lines || []).map((l: any) => `${l?.title ?? ''} ${l?.code ?? ''}`.toLowerCase());
  return terms.length > 0 && lines.some((m) => terms.some((t) => m.includes(t)));
}

// ¿La zona resuelta es entrega de FLOTA PROPIA (→ Shipday)? Solo entonces se despacha un envío gratis
// "rescatado". Cualquier otra cosa (sin_match=interior, servientrega, retiro, asesor, o RPC caído/null) → false:
// no es nuestra flota, va por Servientrega a la sucursal o lo ve el operador. `ambiguo` solo si TODAS las
// opciones son propias (ej. San Miguelito Z3/Z6, ambas $7 propia). Conservador: ante la duda, NO despacha.
function esFlotaPropia(zona: ZonaResuelta | null): boolean {
  if (!zona) return false;
  if (zona.estado === 'ok') return zona.metodo === 'propia';
  if (zona.estado === 'ambiguo') {
    const ops = zona.opciones ?? [];
    return ops.length > 0 && ops.every((o: any) => o?.metodo === 'propia');
  }
  return false;
}

async function verifyShopifyHmac(rawBody: string, hmacHeader: string): Promise<boolean> {
  const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET');
  if (!secret || !hmacHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const digest = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (digest.length !== hmacHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < digest.length; i++) diff |= digest.charCodeAt(i) ^ hmacHeader.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const rawBody = await req.text();
  const ok = await verifyShopifyHmac(rawBody, req.headers.get('X-Shopify-Hmac-Sha256') ?? '');
  if (!ok) return json({ error: 'Firma HMAC inválida' }, 401);

  try {
    const shopifyOrder = JSON.parse(rawBody);
    const order = shopifyOrderToShipday(shopifyOrder);
    // Decisión de despacho. Normalmente por el filtro de nombre de la tarifa (shouldDispatchShopifyOrder).
    // RESCATE de envío gratis (>$300, todo el país): esa tarifa no pasa el filtro por nombre, pero SÍ debe ir
    // a Shipday cuando es entrega de flota PROPIA (ciudad). En el interior el envío gratis es a la sucursal
    // Servientrega (retiro) → NO va a Shipday. La zona resuelta decide; se reutiliza para el enriquecimiento.
    let zona: ZonaResuelta | null = null;
    let despachar = shouldDispatchShopifyOrder(shopifyOrder);
    if (!despachar && esEnvioGratis(shopifyOrder)) {
      zona = await resolverTarifa(String(order.customerAddress ?? ''));
      despachar = esFlotaPropia(zona);
      await logJob('shopify-webhook', despachar ? 'envio_gratis_rescatado' : 'envio_gratis_omitido', true, {
        order: order.orderNumber, zona: zona?.zona ?? zona?.estado ?? 'n/d', total: shopifyOrder.total_price ?? null,
      });
    }
    if (!despachar) {
      console.log(`Pedido ${shopifyOrder.order_number ?? shopifyOrder.id} omitido (no es entrega local)`);
      return json({ ok: true, skipped: true });
    }
    // v52: enriquecimiento de despacho. NO altera la dirección que Shipday geocodifica;
    // agrega la zona resuelta a las instrucciones para quien despacha. Best-effort:
    // si el RPC falla o tarda, `zona` es null y el pedido sale igual que antes.
    if (zona === null) zona = await resolverTarifa(String(order.customerAddress ?? ''));
    const nota: string[] = [];
    if (zona?.estado === 'ok') {
      nota.push(`🗺️ ${zona.zona} · $${zona.tarifa_usd} · ${zona.metodo} · confianza ${zona.confianza}`);
      if (zona.sectores?.length) nota.push(`Sector: ${zona.sectores.join(' / ')}`);
      if (zona.metodo && zona.metodo !== 'propia') {
        nota.push(`⚠️ NO es flota propia (${zona.metodo}). ${zona.puntos_retiro ?? ''}`.trim());
      }
    } else if (zona?.estado === 'ambiguo') {
      const ops = (zona.opciones ?? [])
        .map((o: Record<string, unknown>) => `${o.zona} $${o.tarifa_usd}`)
        .join(' | ');
      nota.push(`⚠️ Zona ambigua — confirmar sector antes de despachar. Opciones: ${ops}`);
    } else if (zona?.estado === 'sin_match') {
      nota.push('⚠️ Dirección no reconocida en el diccionario de zonas — verificar antes de despachar.');
    }
    if (nota.length) {
      order.deliveryInstruction = [order.deliveryInstruction, ...nota].filter(Boolean).join('\n');
    }
    const result = await createShipdayOrder(order);
    console.log(`Pedido Shopify ${order.orderNumber} enviado a Shipday (zona: ${zona?.zona ?? zona?.estado ?? 'n/d'})`);
    // v48: conciencia de pedidos — deja el estado en `pedidos` para el copiloto (best-effort, no rompe).
    // `metodo` REAL (v52) — resuelto por la zona; cae a 'propia' si el resolver no dio 'ok'. estado 'nuevo'/'cancelado'.
    await upsertPedido({
      wa_id: normalizePhone(String(order.customerPhoneNumber ?? '')),
      fuente: 'shopify',
      pedido_ref: String(order.orderNumber),
      shopify_order_id: shopifyOrder.id != null ? String(shopifyOrder.id) : null,
      estado: shopifyOrder.cancelled_at ? 'cancelado' : 'nuevo',
      estado_raw: shopifyOrder.financial_status ?? null,
      metodo: zona?.estado === 'ok' ? (zona.metodo ?? 'propia') : 'propia',
      total_usd: Number(shopifyOrder.total_price) || null,
      resumen: (shopifyOrder.line_items || []).map((li: any) => `${li.quantity}x ${li.title}`).slice(0, 3).join(', ') || null,
    });
    return json({ ok: true, shipday: result });
  } catch (err) {
    console.error('Error Shopify→Shipday:', (err as Error).message);
    // 200 en errores de datos para que Shopify no reintente indefinidamente.
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
