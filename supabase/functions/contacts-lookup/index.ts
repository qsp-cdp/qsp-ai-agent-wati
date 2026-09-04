// Libreta de direcciones para el bot de WATI — v2: validación PREVIA a la captura.
//   GET  https://<REF>.supabase.co/functions/v1/contacts-lookup?phone=61112233
//   POST https://<REF>.supabase.co/functions/v1/contacts-lookup   {"telefono":"..."}
//   Header: x-wati-token: <WATI_WEBHOOK_TOKEN>
//
// Contrato pensado para el nodo Webhook de WATI (enrutamiento por código de estado):
//   200 → el cliente YA tiene dirección guardada. Campos PLANOS y en texto para
//         mapear a variables, más `resumen` y `envio_texto` listos para enviar.
//   404 → no hay dirección: el flujo debe pedirla con las preguntas de siempre.
//   400 → la variable de WATI no resolvió · 500 → falló la consulta (NO es "sin dirección").
// La libreta arrastra ~5.2k direcciones históricas de Tookan, así que esta consulta
// cubre mucho más que el atributo `envio_datos` del perfil de WATI.
import { json } from '../_shared/shipday.ts';
import { findContactByPhone, logJob, resolverTarifa, type ZonaResuelta } from '../_shared/db.ts';

// Respuestas del cliente que significan "no tengo pin" y que hoy quedaron guardadas
// literales en maps_url (ej. "No lo tengo"). No son un link: se tratan como vacío.
const SIN_PIN = new Set([
  'no', 'n', 'ninguna', 'ninguno', 'nada', 'no tengo', 'no lo tengo', 'no la tengo',
  'no se', 'no sé', 'no aplica', 'na', 'luego', 'despues', 'después', 'x', '-',
]);

function linkMapaUtil(valor?: string | null): string {
  const s = String(valor ?? '').trim();
  if (!s) return '';
  if (SIN_PIN.has(s.toLowerCase().replace(/[.,!¡?¿]/g, '').trim())) return '';
  if (/^https?:\/\//i.test(s) || /^geo:/i.test(s)) return s;
  if (/^-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}$/.test(s)) return s; // coordenadas pegadas
  return '';
}

function fmt(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? `B/.${v.toFixed(2)}` : '';
}

// Frase de envío lista para pegar en WhatsApp, con el mismo criterio del cotizador.
function envioTexto(z: ZonaResuelta | null): string {
  if (!z || z.estado !== 'ok') return '';
  if (z.ambito === 'interior') {
    const suc = (z.opciones ?? [])[0] as Record<string, unknown> | undefined;
    const dom = (z.opciones ?? [])[1] as Record<string, unknown> | undefined;
    if (!suc || !dom) return '';
    return `A ${z.lugar ?? z.provincia} enviamos vía Servientrega: retiro en sucursal por ${fmt(suc.tarifa_con_itbms)} o entrega a domicilio por ${fmt(dom.tarifa_con_itbms)}. ${z.plazo ?? ''}`.trim();
  }
  const base = Number(z.tarifa_usd);
  const total = Number(z.tarifa_con_itbms ?? base * 1.07);
  if (z.metodo === 'retiro_agente_verde') {
    return `En su zona no hacemos entrega a domicilio, pero puede retirar su pedido en un punto Servientrega (${z.puntos_retiro ?? 'un asesor le indica cuál'}). El costo es ${fmt(base)} + ITBMS (7%) = ${fmt(total)}.`;
  }
  if (z.metodo === 'asesor') return 'Para su zona, un asesor coordina la entrega y el costo según la dirección exacta.';
  if (z.metodo === 'servientrega') return `A su zona entregamos a domicilio por ${fmt(base)} + ITBMS (7%) = ${fmt(total)}, al día hábil siguiente (vía Servientrega).`;
  return `El envío a su zona es ${fmt(base)} + ITBMS (7%) = ${fmt(total)} (${z.plazo ?? ''}).`;
}

Deno.serve(async (req) => {
  const expected = Deno.env.get('WATI_WEBHOOK_TOKEN');
  if (!expected || req.headers.get('x-wati-token') !== expected) {
    return json({ error: 'Token inválido' }, 401);
  }
  let telefono = new URL(req.url).searchParams.get('phone') ?? '';
  if (!telefono && req.method === 'POST') {
    try {
      const b = await req.json();
      telefono = String(b?.phone ?? b?.telefono ?? b?.waId ?? b?.wa_id ?? '');
    } catch { /* body vacío o no-JSON */ }
  }
  telefono = telefono.trim();
  // Variable de WATI sin resolver (@x / {{x}}): 400, nunca 404 — un 404 haría que el
  // flujo concluyera "no tiene dirección" cuando en realidad falló el mapeo del body.
  if (telefono.startsWith('@') || telefono.includes('{{') || telefono.includes('}}')) {
    return json({ error: 'WATI envió una variable sin resolver (revisa el body del webhook)' }, 400);
  }
  if (!telefono) return json({ error: 'Falta el teléfono (phone / telefono / waId)' }, 400);

  const digits = telefono.replace(/\D/g, '').slice(-8);
  try {
    const contact = await findContactByPhone(telefono);
    const direccion = String(contact?.address ?? '').trim();
    if (!contact || !direccion) {
      await logJob('contacts-lookup', 'direccion_lookup', true, { telefono: digits, found: false });
      return json({ found: false, tiene_direccion: 'no' }, 404);
    }

    const referencia = String(contact.referencia ?? '').trim();
    const mapa = linkMapaUtil(contact.maps_url);
    const tienePin = Boolean(mapa) || (contact.latitude != null && contact.longitude != null);
    // Zona y tarifa de la dirección guardada (best-effort: si el RPC falla, igual respondemos 200).
    const zona = await resolverTarifa(direccion);

    const resumen = [
      `📍 ${direccion}`,
      referencia ? `🏠 ${referencia}` : '',
      mapa ? `🗺️ ${mapa}` : '',
    ].filter(Boolean).join('\n');

    await logJob('contacts-lookup', 'direccion_lookup', true, {
      telefono: digits, found: true, zona_estado: zona?.estado ?? 'n/d',
      ambito: zona?.ambito ?? null, zona: zona?.zona ?? null,
    });

    return json({
      found: true,
      tiene_direccion: 'si',
      nombre: String(contact.name ?? '').trim(),
      direccion,
      referencia,
      maps_url: mapa,
      tiene_pin: tienePin ? 'si' : 'no',
      // Zona resuelta (vacío si el diccionario no reconoce la dirección).
      zona_estado: zona?.estado ?? '',
      zona: zona?.estado === 'ok' ? (zona.ambito === 'interior' ? `INT ${zona.provincia ?? ''}`.trim() : (zona.zona ?? '')) : '',
      ambito: zona?.estado === 'ok' ? (zona.ambito ?? 'metro') : '',
      metodo: zona?.estado === 'ok' ? (zona.metodo ?? '') : '',
      tarifa_usd: zona?.estado === 'ok' && zona.ambito !== 'interior' ? fmt(zona.tarifa_usd) : '',
      plazo: zona?.plazo ?? '',
      // Textos listos para enviar desde el flujo. `envio_texto` NUNCA viene vacío: el mensaje
      // de cierre del bot lo pega tal cual, y una variable vacía dejaría el mensaje cortado.
      // Cuando el diccionario no resuelve la zona, sale la frase de "un asesor confirma".
      resumen,
      envio_texto: envioTexto(zona) || 'En un momento te confirmamos el costo del envío para tu zona. 📦',
    });
  } catch (err) {
    console.error('Error en lookup:', (err as Error).message);
    // 500 (no 404): el flujo debe distinguir "no tiene dirección" de "no pudimos consultar".
    return json({ found: false, error: (err as Error).message }, 500);
  }
});
