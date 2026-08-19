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
import { logJob, resolverTarifa, shipdayOrderIdDe, upsertPedido, type ZonaResuelta } from '../_shared/db.ts';

// Detecta la tarifa de envío GRATIS (>$300 aplica en todo el país). Por NOMBRE de la tarifa (término
// configurable por env), NO por precio $0 — así "Recoger en tienda" (también $0) NO cuenta como envío gratis.
function esEnvioGratis(shopifyOrder: any): boolean {
  const terms = (Deno.env.get('SHOPIFY_FREE_SHIP_TERMS') ?? 'gratis,free').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const lines: string[] = (shopifyOrder?.shipping_lines || []).map((l: any) => `${l?.title ?? ''} ${l?.code ?? ''}`.toLowerCase());
  return terms.length > 0 && lines.some((m) => terms.some((t) => m.includes(t)));
}

// ¿La zona resuelta es entrega de FLOTA PROPIA (→ Shipday)? Solo entonces se despacha un envío gratis
// "rescatado". Cualquier otra cosa (interior/sin_servicio de v2, servientrega, retiro, asesor, o RPC caído/null) → false:
// no es nuestra flota, va por Servientrega a la sucursal o lo ve el operador. `ambiguo` solo si TODAS las
// opciones son propias (ej. San Miguelito Z3/Z6, ambas $7 propia). Conservador: ante la duda, NO despacha.
function esFlotaPropia(zona: ZonaResuelta | null): boolean {
  if (!zona) return false;
  if (zona.estado === 'ok') return zona.ambito !== 'interior' && zona.metodo === 'propia';
  if (zona.estado === 'ambiguo') {
    const ops = zona.opciones ?? [];
    return ops.length > 0 && ops.every((o: any) => o?.metodo === 'propia');
  }
  return false;
}

// v32: RETIRO EN TIENDA. Señal fuerte = el pedido NO trae `shipping_address` (Shopify no pide dirección
// cuando el cliente elige recoger). El nombre de la tarifa NO sirve solo: en esta tienda es literalmente
// la dirección del local ("Via Ricardo J Alfaro, Plaza Aventura...") y no contiene la palabra retiro.
// Sin esta guardia el resolver clasificaría la dirección de FACTURACIÓN y marcaría flags de puro ruido.
function esRetiroEnTienda(shopifyOrder: any): boolean {
  const env = shopifyOrder?.shipping_address;
  const sinDireccion = !env || !String(env.address1 ?? '').trim();
  if (sinDireccion) return true;
  const lineas: string = (shopifyOrder?.shipping_lines || []).map((l: any) => `${l?.title ?? ''} ${l?.code ?? ''}`).join(' ').toLowerCase();
  return lineas.includes('recoger') || lineas.includes('retiro en tienda') || lineas.includes('pickup');
}

// F4 (v31): detecta ventas imposibles o mal ruteadas comparando la LÍNEA de envío elegida en el
// checkout con la zona real resuelta. NO bloquea nada — el agente humano maneja y asigna todos los
// pedidos; esto produce `envio_flag` (pedidos) + job_log `pedido_flag` + nota 🚨 en Shipday.
function calcularFlag(shopifyOrder: any, zona: ZonaResuelta | null, esLineaCiudad: boolean, gratis: boolean): string | null {
  if (!zona) return null;
  const lineas: string = (shopifyOrder?.shipping_lines || []).map((l: any) => `${l?.title ?? ''} ${l?.code ?? ''}`).join(' ').toLowerCase();
  const esLineaInterior = lineas.includes('servientrega') || lineas.includes('sucursal');
  if (zona.estado === 'sin_match') return 'direccion_no_reconocida';
  if (zona.estado === 'sin_servicio') return 'sin_servicio_comarca';
  if (zona.estado !== 'ok') return null; // ambiguo ya lleva su nota ⚠️; no es un imposible
  if (zona.ambito === 'interior' && esLineaCiudad) return 'eligio_ciudad_siendo_interior';
  if (zona.ambito !== 'interior' && esLineaInterior) return 'eligio_interior_siendo_ciudad';
  if (zona.ambito !== 'interior' && zona.metodo === 'retiro_agente_verde' && (esLineaCiudad || gratis)) return 'domicilio_imposible_z4a';
  return null;
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
    // F4 (v31): la zona se resuelve SIEMPRE con resolver_tarifa_v2 (metro+interior) y se persiste en
    // `pedidos` junto con `envio_flag`. NADA se bloquea: el agente humano maneja y asigna todos los
    // pedidos; los casos imposibles solo llevan nota 🚨 en Shipday + flag consultable.
    const esLineaCiudad = shouldDispatchShopifyOrder(shopifyOrder);
    const gratis = esEnvioGratis(shopifyOrder);
    // v32: en retiro no hay dirección de entrega que clasificar — el pedido se registra sin zona ni flag.
    const retiro = esRetiroEnTienda(shopifyOrder);
    const zona = retiro ? null : await resolverTarifa(String(order.customerAddress ?? ''));
    let despachar = esLineaCiudad;
    if (!despachar && gratis) {
      despachar = esFlotaPropia(zona);
      await logJob('shopify-webhook', despachar ? 'envio_gratis_rescatado' : 'envio_gratis_omitido', true, {
        order: order.orderNumber, zona: zona?.zona ?? zona?.estado ?? 'n/d', total: shopifyOrder.total_price ?? null,
      });
    }
    const flag = calcularFlag(shopifyOrder, zona, esLineaCiudad, gratis);
    if (flag) {
      await logJob('shopify-webhook', 'pedido_flag', true, {
        order: order.orderNumber, flag, zona: zona?.zona ?? zona?.estado ?? 'n/d',
        ambito: zona?.ambito ?? null, lugar: zona?.lugar ?? null, total: shopifyOrder.total_price ?? null,
      });
    }
    // v48/v52/v31: conciencia de pedidos — ahora se escribe para TODO pedido (antes solo los
    // despachados): el copiloto gana visibilidad de interior/retiro y la zona+flag quedan consultables.
    await upsertPedido({
      wa_id: normalizePhone(String(order.customerPhoneNumber ?? '')),
      fuente: 'shopify',
      pedido_ref: String(order.orderNumber),
      shopify_order_id: shopifyOrder.id != null ? String(shopifyOrder.id) : null,
      estado: shopifyOrder.cancelled_at ? 'cancelado' : 'nuevo',
      estado_raw: shopifyOrder.financial_status ?? null,
      metodo: zona?.estado === 'ok' ? (zona.ambito === 'interior' ? 'servientrega' : (zona.metodo ?? 'propia')) : (despachar ? 'propia' : undefined),
      total_usd: Number(shopifyOrder.total_price) || null,
      resumen: (shopifyOrder.line_items || []).map((li: any) => `${li.quantity}x ${li.title}`).slice(0, 3).join(', ') || null,
      zona: zona?.estado === 'ok' ? (zona.ambito === 'interior' ? `INT ${[zona.provincia, zona.lugar && zona.lugar !== zona.provincia ? zona.lugar : null].filter(Boolean).join(' · ')}` : (zona.zona ?? null)) : null,
      zona_estado: zona?.estado ?? null,
      zona_ambito: zona?.estado === 'ok' ? (zona.ambito ?? 'metro') : null,
      tarifa_zona_usd: zona?.estado === 'ok' && zona.ambito !== 'interior' && zona.tarifa_usd != null ? Number(zona.tarifa_usd) : null,
      envio_flag: flag,
    });
    if (!despachar) {
      console.log(`Pedido ${shopifyOrder.order_number ?? shopifyOrder.id} omitido (${retiro ? 'retiro en tienda' : 'no es entrega local'})${flag ? ` · flag ${flag}` : ''}`);
      return json({ ok: true, skipped: true });
    }
    // v62: IDEMPOTENCIA. Shopify entrega at-least-once (reintenta ante timeout/no-2xx) y un pedido puede
    // disparar varios eventos (creación + preparación). Si este pedido YA tiene una orden en Shipday
    // registrada (pedidos.shipday_order_id, persistido tras el despacho de abajo), NO se recrea: evita la
    // doble asignación de repartidor. La lectura corre DESPUÉS del upsert de arriba, así que ve el estado
    // más reciente. (No atómica contra dos webhooks EXACTAMENTE simultáneos, escenario que Shopify no
    // produce: sus reintentos son secuenciales con backoff, y para entonces la marca ya está escrita.)
    const yaShipday = await shipdayOrderIdDe(String(order.orderNumber));
    if (yaShipday) {
      console.log(`Pedido Shopify ${order.orderNumber} ya despachado (shipday_order_id=${yaShipday}); no se recrea.`);
      return json({ ok: true, ya_despachado: yaShipday });
    }
    // v52: enriquecimiento de despacho. NO altera la dirección que Shipday geocodifica;
    // agrega la zona resuelta a las instrucciones para quien despacha. Best-effort:
    // si el RPC falla o tarda, `zona` es null y el pedido sale igual que antes.
    const nota: string[] = [];
    if (zona?.estado === 'ok' && zona.ambito === 'interior') {
      nota.push(`🚨 PEDIDO DEL INTERIOR (${[zona.provincia, zona.lugar && zona.lugar !== zona.provincia ? zona.lugar : null].filter(Boolean).join(' · ')}) con tarifa de ciudad — NO entregar con flota propia. Coordinar envío Servientrega con el cliente.`);
    } else if (zona?.estado === 'ok') {
      nota.push(`🗺️ ${zona.zona} · $${zona.tarifa_usd} · ${zona.metodo} · confianza ${zona.confianza}`);
      if (zona.sectores?.length) nota.push(`Sector: ${zona.sectores.join(' / ')}`);
      if (zona.metodo === 'retiro_agente_verde') {
        nota.push(`🚨 Z4a — aquí NO hay entrega a DOMICILIO: solo retiro en punto. ${zona.puntos_retiro ?? ''}`.trim());
      } else if (zona.metodo && zona.metodo !== 'propia') {
        nota.push(`⚠️ NO es flota propia (${zona.metodo}). ${zona.puntos_retiro ?? ''}`.trim());
      }
    } else if (zona?.estado === 'ambiguo') {
      const ops = (zona.opciones ?? [])
        .map((o: Record<string, unknown>) => `${o.zona} $${o.tarifa_usd}`)
        .join(' | ');
      nota.push(`⚠️ Zona ambigua — confirmar sector antes de despachar. Opciones: ${ops}`);
    } else if (zona?.estado === 'sin_match') {
      nota.push('⚠️ Dirección no reconocida en el diccionario de zonas — verificar antes de despachar.');
    } else if (zona?.estado === 'sin_servicio') {
      nota.push('🚨 Zona SIN SERVICIO de entrega (comarca) — coordinar con el cliente antes de despachar.');
    }
    if (nota.length) {
      order.deliveryInstruction = [order.deliveryInstruction, ...nota].filter(Boolean).join('\n');
    }
    const result = await createShipdayOrder(order);
    // v62: persistir la marca de despacho (idempotencia + trazabilidad). Shipday devuelve el id interno
    // de la orden creada como `orderId` (o `id`). Sin esto, el reintento de Shopify no tendría cómo saber
    // que el pedido ya se despachó y crearía un duplicado.
    const shipdayId = (result && (result as any).orderId != null) ? String((result as any).orderId)
      : (result && (result as any).id != null) ? String((result as any).id)
      : null;
    if (shipdayId) {
      await upsertPedido({
        wa_id: normalizePhone(String(order.customerPhoneNumber ?? '')),
        fuente: 'shopify',
        pedido_ref: String(order.orderNumber),
        shipday_order_id: shipdayId,
      });
    }
    console.log(`Pedido Shopify ${order.orderNumber} enviado a Shipday (zona: ${zona?.zona ?? zona?.estado ?? 'n/d'}${flag ? ` · flag ${flag}` : ''}${shipdayId ? ` · shipday ${shipdayId}` : ''})`);
    return json({ ok: true, shipday: result });
  } catch (err) {
    const e = err as Error;
    console.error('Error Shopify→Shipday:', e.message);
    await logJob('shopify-webhook', 'error', false, { error: (e.message ?? String(e)).slice(0, 300) });
    // v62: error de DATOS (payload malformado → JSON.parse lanza SyntaxError) → 200: es no-reintentable,
    // reintentarlo nunca funcionaría y las repeticiones terminarían DESACTIVANDO el webhook en Shopify.
    // Fallo TRANSITORIO (Shipday caído, red) → 5xx para que Shopify reintente; el reintento es idempotente
    // por shipday_order_id, así que no duplica la orden.
    const esErrorDeDatos = e instanceof SyntaxError;
    return json({ ok: false, error: e.message }, esErrorDeDatos ? 200 : 500);
  }
});
