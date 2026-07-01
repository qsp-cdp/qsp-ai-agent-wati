// Shipday → estados de entrega. Registrar en Shipday (Integraciones → API →
// Configuración de Webhook):
//   https://<PROJECT_REF>.supabase.co/functions/v1/shipday-status?token=<SHIPDAY_WEBHOOK_TOKEN>
// Registra cada evento; si WATI_NOTIFY=true reenvía el aviso al cliente por
// WhatsApp vía WATI (apagado por defecto: Shipday ya notifica por WhatsApp).
import { json } from '../_shared/shipday.ts';
import { parseShipdayStatusEvent, sendWatiSessionMessage, statusMessageFor } from '../_shared/status.ts';

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
