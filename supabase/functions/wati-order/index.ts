// WATI → Shipday. El flujo de captura de dirección de WATI llama aquí:
//   POST https://<PROJECT_REF>.supabase.co/functions/v1/wati-order
//   Header: x-wati-token: <WATI_WEBHOOK_TOKEN>
// Además de crear la orden, guarda/actualiza el contacto en la libreta.
import { createShipdayOrder, HttpError, json, watiCaptureToShipday } from '../_shared/shipday.ts';
import { upsertContactByPhone } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const expected = Deno.env.get('WATI_WEBHOOK_TOKEN');
  if (!expected || req.headers.get('x-wati-token') !== expected) {
    return json({ error: 'Token inválido' }, 401);
  }
  try {
    const capture = await req.json();
    const order = watiCaptureToShipday(capture);
    const result = await createShipdayOrder(order);
    console.log(`Pedido WATI ${order.orderNumber} enviado a Shipday`);
    try {
      await upsertContactByPhone({
        name: order.customerName as string,
        phone: order.customerPhoneNumber as string,
        address: order.customerAddress as string,
        source: 'wati',
      });
    } catch (err) {
      // La orden ya salió; un fallo en la libreta no debe romper el flujo.
      console.error('No se pudo guardar el contacto:', (err as Error).message);
    }
    return json({ ok: true, orderNumber: order.orderNumber, shipday: result });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error('Error WATI→Shipday:', (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, status);
  }
});
