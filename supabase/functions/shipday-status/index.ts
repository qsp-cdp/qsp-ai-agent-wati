// Shipday → estados de entrega. Registrar en Shipday (Integraciones → API →
// Configuración de Webhook):
//   https://<PROJECT_REF>.supabase.co/functions/v1/shipday-status?token=<SHIPDAY_WEBHOOK_TOKEN>
// Registra cada evento; si WATI_NOTIFY=true reenvía el aviso al cliente por
// WhatsApp vía WATI (apagado por defecto: Shipday ya notifica por WhatsApp).
import { json, normalizePhone } from '../_shared/shipday.ts';
import { estadoNormalizado, parseShipdayStatusEvent, rankEstado, sendWatiSessionMessage, statusMessageFor } from '../_shared/status.ts';
import { infoPedidoActual, upsertPedido } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  // v65 — FAIL-CLOSED: sin SHIPDAY_WEBHOOK_TOKEN configurado, este webhook quedaba ABIERTO (cualquiera podía
  // inyectar estados/tracking falsos que el copiloto relaya al cliente — vector de phishing). Igual que
  // wati-*: sin token configurado, se rechaza todo. (.trim() defensivo, patrón v40.)
  const expected = (Deno.env.get('SHIPDAY_WEBHOOK_TOKEN') ?? '').trim();
  const token = new URL(req.url).searchParams.get('token') ?? req.headers.get('x-shipday-token');
  if (!expected || token !== expected) return json({ error: 'Token inválido' }, 401);

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    // payload vacío o no-JSON: se registra igual
  }
  const event = parseShipdayStatusEvent(payload);
  console.log(`Shipday: pedido ${event.orderNumber || '?'} → ${event.status || 'evento sin estado'}`);

  // v48/v66: conciencia de pedidos — actualiza el estado de entrega en `pedidos` para el copiloto (best-effort).
  // El payload REAL del webhook trae el teléfono en `delivery_details.phone` y el número en `order.order_number`
  // (ver docs/shipday/webhook-payload-real.md). Dos refuerzos que destapó la captura del payload real:
  //   1) RESPALDO POR pedido_ref: si el evento no trae teléfono, se recupera el wa_id de la fila shopify/wati
  //      existente, para que la fila 'shipday' converja igual (antes se descartaba entera → 0 filas 'shipday').
  //   2) NO DEGRADAR: los webhooks de Shipday pueden llegar fuera de orden; solo se escribe `estado` si AVANZA
  //      sobre el más avanzado ya guardado (rank). Un evento 'desconocido' (p.ej. ORDER_UNASSIGNED) tampoco
  //      toca el estado. En ambos casos el tracking y el estado_raw sí se refrescan.
  if (event.orderNumber) {
    const info = await infoPedidoActual(event.orderNumber);
    let waId = normalizePhone(event.customerPhone);
    if (!/^\+\d{8,15}$/.test(waId) && info.wa_id) waId = info.wa_id;

    const estadoEvt = estadoNormalizado(event.status);
    const estado = (estadoEvt !== 'desconocido' && rankEstado(estadoEvt) > rankEstado(info.estado))
      ? estadoEvt
      : undefined;

    await upsertPedido({
      wa_id: waId,
      fuente: 'shipday',
      pedido_ref: event.orderNumber,
      estado,
      estado_raw: event.status || null,
      tracking: event.trackingUrl || null,
      metodo: 'propia',
    });
  }

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
