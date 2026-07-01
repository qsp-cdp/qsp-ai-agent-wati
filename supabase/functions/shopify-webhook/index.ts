// Shopify → Shipday. Registrar en Shopify (Configuración → Notificaciones →
// Webhooks) con evento "Creación de pedidos" o "Preparación de pedidos":
//   https://<PROJECT_REF>.supabase.co/functions/v1/shopify-webhook
// Desplegar con --no-verify-jwt (Shopify no envía JWT de Supabase).
import {
  createShipdayOrder,
  json,
  shopifyOrderToShipday,
  shouldDispatchShopifyOrder,
} from '../_shared/shipday.ts';

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
    if (!shouldDispatchShopifyOrder(shopifyOrder)) {
      console.log(`Pedido ${shopifyOrder.order_number ?? shopifyOrder.id} omitido (no es entrega local)`);
      return json({ ok: true, skipped: true });
    }
    const order = shopifyOrderToShipday(shopifyOrder);
    const result = await createShipdayOrder(order);
    console.log(`Pedido Shopify ${order.orderNumber} enviado a Shipday`);
    return json({ ok: true, shipday: result });
  } catch (err) {
    console.error('Error Shopify→Shipday:', (err as Error).message);
    // 200 en errores de datos para que Shopify no reintente indefinidamente.
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
