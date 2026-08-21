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

async function auditarDireccion(fila: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/direcciones_hist`, {
      method: 'POST',
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(fila),
    });
  } catch { /* la auditoría nunca debe romper el webhook */ }
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
  if (ok) {
    try {
      await updateWatiAttributes(waId, {
        direccion_envio: dirShipday.slice(0, 250),
        ...(hayPin
          ? { pin_envio: `https://maps.google.com/?q=${lat},${lng}`, maps_envio: `https://maps.google.com/?q=${lat},${lng}` }
          : {}),
        envio_estado: '✏️ Dirección corregida en Shipday',
      });
    } catch { /* best-effort */ }
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
