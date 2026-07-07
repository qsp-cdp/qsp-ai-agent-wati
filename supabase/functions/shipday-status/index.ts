// Shipday → estados de entrega. Registrar en Shipday (Integraciones → API →
// Configuración de Webhook):
//   https://<PROJECT_REF>.supabase.co/functions/v1/shipday-status?token=<SHIPDAY_WEBHOOK_TOKEN>
// Registra cada evento; si WATI_NOTIFY=true reenvía el aviso al cliente por
// WhatsApp vía WATI (apagado por defecto: Shipday ya notifica por WhatsApp).
import { json, normalizePhone } from '../_shared/shipday.ts';
import { estadoNormalizado, parseShipdayStatusEvent, sendWatiSessionMessage, statusMessageFor } from '../_shared/status.ts';
import { upsertPedido } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const expected = Deno.env.get('SHIPDAY_WEBHOOK_TOKEN');
  const token = new URL(req.url).searchParams.get('token') ?? req.headers.get('x-shipday-token');
  if (expected && token !== expected) return json({ error: 'Token inválido' }, 401);

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    // payload vacío o no-JSON: se registra igual
  }
  const event = parseShipdayStatusEvent(payload);
  console.log(`Shipday: pedido ${event.orderNumber || '?'} → ${event.status || 'evento sin estado'}`);

  // v48: conciencia de pedidos — actualiza el estado de entrega en `pedidos` para el copiloto (best-effort).
  // La fila 'shipday' converge con la 'shopify' por (fuente, pedido_ref); el RPC toma el estado más avanzado.
  // Un evento NO mapeado ('desconocido' — p.ej. edición/reasignación que Shipday manda tras 'en_camino') NO
  // debe DEGRADAR un estado bueno ya guardado: se OMITE `estado` en ese caso (se conserva el previo; el
  // tracking y el estado_raw sí se actualizan). El rank del RPC no basta aquí porque es una sola fila 'shipday'.
  const estadoEvt = estadoNormalizado(event.status);
  await upsertPedido({
    wa_id: normalizePhone(event.customerPhone),
    fuente: 'shipday',
    pedido_ref: event.orderNumber,
    estado: estadoEvt === 'desconocido' ? undefined : estadoEvt,
    estado_raw: event.status || null,
    tracking: event.trackingUrl || null,
    metodo: 'propia',
  });

  if (Deno.env.get('WATI_NOTIFY') === 'true' && event.customerPhone) {
    const message = statusMessageFor(event);
    if (message) {
      try {
        await sendWatiSessionMessage(event.customerPhone, message);
      } catch (err) {
        console.error('No se pudo notificar por WATI:', (err as Error).message);
      }
    }
  }
  return json({ ok: true });
});
