// Shipday → estados de entrega. Registrar en Shipday (Integraciones → API →
// Configuración de Webhook):
//   https://<PROJECT_REF>.supabase.co/functions/v1/shipday-status?token=<SHIPDAY_WEBHOOK_TOKEN>
// Registra cada evento; si WATI_NOTIFY=true reenvía el aviso al cliente por
// WhatsApp vía WATI (apagado por defecto: Shipday ya notifica por WhatsApp).
import { json, normalizePhone } from '../_shared/shipday.ts';
import { estadoNormalizado, parseShipdayStatusEvent, rankEstado, sendWatiSessionMessage, statusMessageFor } from '../_shared/status.ts';
import { findContactByPhone, infoPedidoActual, lastDigits, logJob, upsertPedido } from '../_shared/db.ts';
import { updateWatiAttributes } from '../_shared/watiapi.ts';

// --- PIERNA DE VUELTA DE DIRECCIONES: Shipday → Supabase → WATI --------------------------------
//
// Si un asesor corrige la dirección directamente en Shipday (pasa: el repartidor llama, el cliente
// aclara, el asesor lo arregla ahí mismo), ese cambio se quedaba SOLO en Shipday: la libreta y la
// ficha de WATI seguían con la dirección vieja y el siguiente pedido del mismo cliente volvía a
// salir mal. No hace falta registrar ningún webhook nuevo — los eventos de estado que YA recibimos
// traen `delivery_details.address` y `location` (confirmado en docs/shipday/webhook-payload-real.md),
// así que la versión corregida llega en el siguiente evento de esa orden.
//
// ANTI-LOOP por diseño: Supabase escribe hacia Shipday SOLO al crear la orden, nunca después;
// Shipday escribe hacia Supabase SOLO desde este webhook. No hay tercer camino, así que el ciclo no
// puede girar. La deduplicación sale de comparar el texto normalizado: un evento repetido con la
// misma dirección no toca nada.
const normDir = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// La auditoría nunca debe ROMPER el webhook, pero tampoco debe fallar EN SILENCIO: durante semanas el
// POST rebotó con 401 (faltaba el grant de INSERT a service_role) dentro de un `catch {}` mudo y la
// tabla quedó en cero sin que nada lo dijera — se descubrió a mano el 22-ago. Ahora el fallo se traga
// igual, pero deja rastro en job_log.
async function auditarDireccion(fila: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/direcciones_hist`, {
      method: 'POST',
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(fila),
    });
    if (!res.ok) {
      const cuerpo = (await res.text().catch(() => '')).slice(0, 200);
      await logJob('shipday-status', 'auditoria_direccion_fallo', false, { status: res.status, cuerpo });
    }
  } catch (err) {
    await logJob('shipday-status', 'auditoria_direccion_fallo', false, { error: String(err).slice(0, 200) });
  }
}

// Dónde queda el pin: jerarquía administrativa (de los polígonos oficiales) + zona comercial.
// Best-effort: si no resuelve, devuelve null y el llamador trata la ubicación como desconocida.
//
// OJO con `estado`: un pin del interior devuelve `sin_match` porque allá no hay zona de reparto propia
// (va por Servientrega), pero su provincia/distrito/corregimiento SÍ están resueltos. Descartar la
// jerarquía por un `estado != ok` borraría geografía buena de todo el interior del país. Solo la ZONA
// depende de ese estado.
interface UbicacionPin { provincia: string; distrito: string; corregimiento: string; zonaTxt: string }

async function ubicacionPorPin(lat: number, lng: number): Promise<UbicacionPin | null> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/ubicacion_por_coordenadas`, {
      method: 'POST',
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_lat: lat, p_lng: lng }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const z = await res.json();
    const corregimiento = String(z?.corregimiento ?? '').trim();
    if (!corregimiento) return null;
    // Formato de `zona_envio` copiado del copiloto: "Z1 Centro · $6 · Betania".
    const zonaTxt = z?.estado === 'ok'
      ? [z.zona, z.tarifa_usd != null ? `$${z.tarifa_usd}` : null, corregimiento].filter(Boolean).join(' · ')
      : '';
    return {
      provincia: String(z?.provincia ?? '').trim(),
      distrito: String(z?.distrito ?? '').trim(),
      corregimiento,
      zonaTxt,
    };
  } catch {
    return null;
  }
}

async function sincronizarDireccionDesdeShipday(payload: any, waId: string, pedidoRef: string): Promise<void> {
  const dd = payload?.delivery_details ?? {};
  const dirShipday = String(dd.address ?? '').trim();
  if (!dirShipday || !waId) return;
  const lat = Number(dd?.location?.lat ?? dd?.location?.latitude);
  const lng = Number(dd?.location?.lng ?? dd?.location?.longitude);
  const hayPin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  const c = await findContactByPhone(waId).catch(() => null);
  if (!c) return;
  if (normDir(c.address) === normDir(dirShipday)) return; // igual: nada que sincronizar (dedup)

  const base = {
    phone_digits: lastDigits(waId), wa_id: waId, origen: 'shipday_webhook', pedido_ref: pedidoRef || null,
    address_ant: c.address ?? null, address_nueva: dirShipday,
    lat_ant: c.latitude ?? null, lng_ant: c.longitude ?? null,
    lat_nueva: hayPin ? lat : null, lng_nueva: hayPin ? lng : null,
  };

  // El cliente (o el bot) tocó la libreta hace nada: puede ser MÁS nueva que lo que Shipday tiene de
  // esta orden, y los eventos llegan fuera de orden. Ante la duda no se pisa — queda auditado para
  // que un humano lo mire. Perder una corrección es recuperable; pisar la dirección buena, no.
  // `updated_at` no está en la interfaz Contact pero PostgREST sí lo devuelve (findContactByPhone
  // trae la fila completa); el cast lo deja explícito en vez de depender de un campo no declarado.
  const updAt = (c as unknown as { updated_at?: string | null }).updated_at;
  const tocadoHaceMin = updAt ? (Date.now() - new Date(updAt).getTime()) / 60000 : 1e9;
  if (tocadoHaceMin < 10) {
    await auditarDireccion({ ...base, aplicado: false, motivo: `libreta_actualizada_hace_${Math.round(tocadoHaceMin)}min` });
    await logJob('shipday-status', 'direccion_shipday_no_aplicada', false, { waId, pedidoRef, mins: Math.round(tocadoHaceMin) });
    return;
  }

  const patch: Record<string, unknown> = { address: dirShipday, updated_at: new Date().toISOString() };
  if (hayPin) {
    patch.latitude = lat; patch.longitude = lng;
    patch.maps_url = `https://maps.google.com/?q=${lat},${lng}`;
  } else {
    // Dirección nueva sin pin: el viejo apunta al domicilio anterior (misma lección que la captura).
    patch.latitude = null; patch.longitude = null; patch.maps_url = null;
  }

  // La jerarquía guardada (provincia › distrito › corregimiento) describe la dirección ANTERIOR, y de
  // ahí sale la tarifa que se le cotiza al cliente. Misma lección que el pin: dejarla puesta hace que la
  // ficha AFIRME un corregimiento que ya no aplica. Con pin se recalcula entera contra los polígonos
  // oficiales; sin pin se limpia — un nulo dice "no sé", que es cierto, y el dato viejo diría una
  // mentira. La siguiente captura del copiloto la vuelve a llenar.
  const ubic = hayPin ? await ubicacionPorPin(lat, lng) : null;
  patch.provincia = ubic?.provincia || null;
  patch.distrito = ubic?.distrito || null;
  patch.corregimiento = ubic?.corregimiento || null;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/contacts?phone_digits=eq.${lastDigits(waId)}`, {
    method: 'PATCH',
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  const ok = res.ok;
  await auditarDireccion({ ...base, aplicado: ok, motivo: ok ? null : `patch_${res.status}` });
  await logJob('shipday-status', 'direccion_shipday_sincronizada', ok, { waId, pedidoRef, con_pin: hayPin });

  // Espejo a la ficha del asesor. best-effort: si WATI falla, la libreta —que es la fuente de verdad
  // y la que alimenta el despacho— ya quedó corregida.
  //
  // Se escriben TODOS los campos que la corrección toca, y los vacíos van como "-" para PISAR el valor
  // anterior (lección v75.1 del copiloto: omitir un campo deja el pin y el corregimiento VIEJOS en la
  // ficha junto a la dirección nueva — el asesor ve dos ubicaciones y no sabe cuál vale). Y el
  // resultado se registra: antes iba en un `catch` mudo, así que un espejo fallido era indistinguible
  // de uno exitoso.
  if (ok) {
    const pinUrl = hayPin ? `https://maps.google.com/?q=${lat},${lng}` : '';
    const prov = ubic?.provincia ?? '';
    const dist = ubic?.distrito ?? '';
    const correg = ubic?.corregimiento ?? '';
    // La zona (y con ella la tarifa) sale del corregimiento: si la dirección se mudó, la zona vieja de
    // la ficha ya no describe a dónde va el pedido. Sin pin no hay cómo resolverla → "-" en vez de una
    // zona que cotizaría mal.
    const zonaTxt = ubic?.zonaTxt ?? '';
    const val = (s: string) => (s ? s.slice(0, 250) : '-');
    // Formato idéntico al del copiloto y wati-mirror: "dirección — referencia · Provincia › Distrito › Corregimiento".
    const referencia = String(c.referencia ?? '').trim();
    const jerarquia = [prov, dist, correg].filter(Boolean).join(' › ');
    const cuerpo = [dirShipday, referencia].filter(Boolean).join(' — ');
    const resumen = [cuerpo, jerarquia].filter(Boolean).join('  ·  ');
    try {
      const r = await updateWatiAttributes(waId, {
        direccion_envio: val(dirShipday),
        pin_envio: val(pinUrl),
        maps_envio: val(pinUrl),
        zona_envio: val(zonaTxt),
        provincia_envio: val(prov),
        distrito_envio: val(dist),
        corregimiento_envio: val(correg),
        envio_resumen: val(resumen),
        // Sin pin el asesor tiene que saberlo ANTES de despachar: la dirección nueva es solo texto y
        // el pin viejo (el del domicilio anterior) acaba de borrarse a propósito.
        envio_estado: hayPin
          ? '✏️ Dirección corregida en Shipday'
          : '✏️ Dirección corregida en Shipday — 📝 sin pin, confirmar ubicación',
        envio_fecha: new Date().toISOString().slice(0, 10),
      });
      const campos = (r as { campos?: string[] }).campos?.length ?? 0;
      await logJob('shipday-status', 'espejo_wati_direccion', true, { waId, pedidoRef, campos });
    } catch (err) {
      await logJob('shipday-status', 'espejo_wati_direccion', false, { waId, pedidoRef, error: String(err).slice(0, 200) });
    }
  }
}

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

    // Pierna de vuelta de direcciones (ver arriba). Best-effort y DESPUÉS del upsert: el estado del
    // pedido es lo crítico de este webhook y no puede quedar sin escribir por un fallo aquí.
    try {
      await sincronizarDireccionDesdeShipday(payload, waId, event.orderNumber);
    } catch (err) {
      console.error('sincronizarDireccionDesdeShipday:', (err as Error).message);
    }
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
