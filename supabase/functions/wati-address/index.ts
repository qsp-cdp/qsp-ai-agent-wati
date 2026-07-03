// Captura/actualización de datos de envío desde el flujo de WATI.
//   POST https://<REF>.supabase.co/functions/v1/wati-address
//   Header: x-wati-token: <WATI_WEBHOOK_TOKEN>
//   Body: { waId | telefono, nombre?, direccion, referencia?, maps_url? }
//
// Guarda el contacto en la libreta (Supabase) y refleja los datos como
// ATRIBUTOS del contacto en WATI, para que el agente vea en el perfil si el
// cliente ya tiene datos de envío completos:
//   direccion_envio · referencia_envio · maps_envio · envio_datos · envio_fecha
import { HttpError, json, normalizePhone, parseMapsCoords } from '../_shared/shipday.ts';
import { upsertContactByPhone } from '../_shared/db.ts';
import { updateWatiAttributes } from '../_shared/watiapi.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const expected = Deno.env.get('WATI_WEBHOOK_TOKEN');
  if (!expected || req.headers.get('x-wati-token') !== expected) {
    return json({ error: 'Token inválido' }, 401);
  }
  try {
    const p = await req.json();
    const telefono = String(p.telefono ?? p.waId ?? p.wa_id ?? '').trim();
    const direccion = String(p.direccion ?? '').trim();
    if (!telefono) throw new HttpError(400, 'Falta el teléfono (telefono o waId)');
    if (!direccion) throw new HttpError(400, 'Falta la dirección');
    const referencia = String(p.referencia ?? '').trim();
    const maps = String(p.maps_url ?? p.maps ?? p.ubicacion ?? '').trim();
    const nombre = String(p.nombre ?? '').trim();
    const phone = normalizePhone(telefono);

    const coords = parseMapsCoords(maps);
    await upsertContactByPhone({
      name: nombre,
      phone,
      address: direccion,
      referencia: referencia || null,
      maps_url: maps || null,
      ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
      source: 'wati',
    });
    console.log(`Dirección guardada para ${phone}`);

    // Refleja en el perfil de WATI (best-effort: si falla, el dato ya quedó
    // en la libreta y el flujo no se rompe).
    let atributos = false;
    try {
      await updateWatiAttributes(telefono, {
        direccion_envio: direccion,
        referencia_envio: referencia,
        maps_envio: maps,
        envio_datos: 'completo',
        envio_fecha: new Date().toISOString().slice(0, 10),
      });
      atributos = true;
    } catch (err) {
      console.error('No se pudieron actualizar los atributos en WATI:', (err as Error).message);
    }
    return json({ ok: true, guardado: true, atributos_wati: atributos });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error('Error en wati-address:', (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, status);
  }
});
