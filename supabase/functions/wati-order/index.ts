// WATI → Shipday: despacho de un pedido.
//   POST https://<REF>.supabase.co/functions/v1/wati-order
//   Header: x-wati-token: <WATI_WEBHOOK_TOKEN>
//   Body: { telefono | waId, nombre?, pedido?, total?,
//           direccion?, referencia?, maps_url?,   ← opcionales: si faltan se
//           notificar? }                            leen de la libreta
//
// Si la dirección no viene en el body, se busca en la libreta (capturada
// antes por wati-address). Crea la orden en Shipday y, salvo notificar=false,
// anuncia al cliente por WhatsApp que su pedido va a preparación para envío.
import { createShipdayOrder, HttpError, json, resolveMapsCoords, watiCaptureToShipday } from '../_shared/shipday.ts';
import { findContactByPhone, upsertContactByPhone } from '../_shared/db.ts';
import { sendWatiSessionMessage } from '../_shared/watiapi.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const expected = Deno.env.get('WATI_WEBHOOK_TOKEN');
  if (!expected || req.headers.get('x-wati-token') !== expected) {
    return json({ error: 'Token inválido' }, 401);
  }
  try {
    const capture = await req.json();
    capture.telefono = String(capture.telefono ?? capture.waId ?? capture.wa_id ?? '').trim();
    if (!capture.telefono) throw new HttpError(400, 'Falta el teléfono (telefono o waId)');

    // Completa desde la libreta lo que no venga en el body.
    if (!String(capture.direccion ?? '').trim() || !String(capture.nombre ?? '').trim()) {
      const contacto = await findContactByPhone(capture.telefono);
      if (contacto) {
        if (!String(capture.direccion ?? '').trim()) {
          capture.direccion = contacto.address;
          if (!capture.referencia && contacto.referencia) capture.referencia = contacto.referencia;
          if (!capture.maps_url && contacto.maps_url) capture.maps_url = contacto.maps_url;
          // La libreta ya guardó las coordenadas resueltas al capturar: úsalas.
          if (capture.lat == null && contacto.latitude != null) capture.lat = contacto.latitude;
          if (capture.lng == null && contacto.longitude != null) capture.lng = contacto.longitude;
        }
        if (!String(capture.nombre ?? '').trim()) capture.nombre = contacto.name;
      }
      if (!String(capture.direccion ?? '').trim()) {
        throw new HttpError(400, 'El cliente no tiene dirección registrada: captura la dirección primero (flujo wati-address)');
      }
    }

    // Si el pedido trae un link de mapa pero aún no tenemos coordenadas
    // (p.ej. link corto pegado directo en el despacho), resuélvelas.
    if ((capture.lat == null || capture.lng == null) && capture.maps_url) {
      const coords = await resolveMapsCoords(capture.maps_url);
      if (coords) { capture.lat = coords.lat; capture.lng = coords.lng; }
    }

    const order = watiCaptureToShipday(capture);
    const result = await createShipdayOrder(order);
    console.log(`Pedido WATI ${order.orderNumber} enviado a Shipday`);

    try {
      await upsertContactByPhone({
        name: order.customerName as string,
        phone: order.customerPhoneNumber as string,
        address: capture.direccion,
        referencia: capture.referencia || null,
        maps_url: capture.maps_url || null,
        source: 'wati',
      });
    } catch (err) {
      // La orden ya salió; un fallo en la libreta no debe romper el flujo.
      console.error('No se pudo guardar el contacto:', (err as Error).message);
    }

    // Anuncio al cliente (best-effort). Shipday enviará su propio tracking
    // cuando el repartidor tome la orden; este mensaje cubre el "va a
    // preparación", que Shipday no comunica.
    let notificado = false;
    if (capture.notificar !== false) {
      try {
        const nombre = String(capture.nombre || '').split(' ')[0] || '';
        await sendWatiSessionMessage(
          capture.telefono,
          `🛠️ ${nombre ? nombre + ', tu' : 'Tu'} pedido ya está en preparación para envío 📦\n` +
          `Entregaremos en: ${capture.direccion}\n` +
          `Te avisaremos por aquí cuando salga en camino. 🚚`
        );
        notificado = true;
      } catch (err) {
        console.error('No se pudo enviar el anuncio por WATI:', (err as Error).message);
      }
    }

    return json({ ok: true, orderNumber: order.orderNumber, notificado, shipday: result });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error('Error WATI→Shipday:', (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, status);
  }
});
