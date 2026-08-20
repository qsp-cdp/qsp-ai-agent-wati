// Acceso a la tabla contacts vía el API REST de Supabase (PostgREST) con la
// service role key que Supabase inyecta automáticamente en las Edge Functions.
export interface Contact {
  tookan_customer_id?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  address: string;
  referencia?: string | null;
  maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string;
}

function restUrl(path: string): string {
  const base = Deno.env.get('SUPABASE_URL');
  if (!base) throw new Error('Falta SUPABASE_URL');
  return `${base}/rest/v1${path}`;
}

function serviceHeaders(): Record<string, string> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export function lastDigits(phone: string, n = 8): string {
  return String(phone ?? '').replace(/\D/g, '').slice(-n);
}

// --- Re-enganche de fin de semana (v51) ----------------------------------------------------------
// El cron (Edge Function reengage-expired) lee estos candidatos y, en modo live, les manda una plantilla.
export interface ReengageCandidate { wa_id: string; sender_name: string | null; last_inbound_at: string; }

// Llama al RPC reengage_candidates (toda la lógica de elegibilidad vive en SQL — ver la migración).
export async function fetchReengageCandidates(lookbackHours: number, windowHours: number, max: number): Promise<ReengageCandidate[]> {
  const res = await fetch(restUrl('/rpc/reengage_candidates'), {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ p_lookback_hours: lookbackHours, p_window_hours: windowHours, p_max: max }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`reengage_candidates falló: ${res.status} ${await res.text()}`);
  return await res.json();
}

// Marca que a este wa_id se le mandó la plantilla de re-enganche ahora (idempotencia: no re-enviar hasta
// que el cliente vuelva a escribir). Solo se llama en modo LIVE tras un envío exitoso.
export async function markReengaged(waId: string): Promise<void> {
  const res = await fetch(restUrl(`/conversations?wa_id=eq.${encodeURIComponent(waId)}`), {
    method: 'PATCH',
    headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ reengaged_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`markReengaged ${waId} falló: ${res.status} ${await res.text()}`);
}

// Logger a job_log vía PostgREST (mismo patrón que el copiloto, pero sin supabase-js). Nunca lanza.
export async function logJob(functionName: string, action: string, ok: boolean, detail: unknown): Promise<void> {
  try {
    await fetch(restUrl('/job_log'), {
      method: 'POST',
      headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ function_name: functionName, action, ok, detail }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* nunca romper */ }
}

export async function findContactByPhone(phone: string): Promise<Contact | null> {
  const digits = lastDigits(phone);
  if (!digits) return null;
  const res = await fetch(
    restUrl(`/contacts?phone_digits=eq.${digits}&order=updated_at.desc&limit=1`),
    { headers: serviceHeaders() },
  );
  if (!res.ok) throw new Error(`Error consultando contacts: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

export interface UpsertOptions {
  // El cliente YA tenía dirección guardada y pidió cambiarla. El pin y la
  // referencia viejos describen el domicilio anterior, así que si no llegan
  // nuevos se LIMPIAN en vez de sobrevivir junto a la dirección nueva: Shipday
  // prioriza el pin, y dejarlo mandaría al repartidor a la casa vieja.
  esCorreccion?: boolean;
}

// Inserta o actualiza el contacto por teléfono: así la libreta se mantiene
// fresca con cada captura o pedido que entra por WATI. En una captura normal
// solo se tocan los campos que vienen con valor (no borra datos previos); en
// una corrección (ver UpsertOptions) los campos de ubicación que no lleguen se
// limpian, para que no queden datos del domicilio anterior.
// (Supersede el fix v65 del 13-ago: la mitad "el PATCH actualiza lat/lng cuando
// vienen" se conserva; la limpieza de los viejos quedó acotada a esCorreccion —
// el flujo v2 de WATI manda la señal — en vez de dispararse con cualquier
// dirección sin pin, que borraba pines buenos en re-capturas.)
export async function upsertContactByPhone(
  contact: Contact,
  opts: UpsertOptions = {},
): Promise<void> {
  const existing = await findContactByPhone(contact.phone);
  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ((contact.name || '').trim()) patch.name = contact.name;
    if ((contact.address || '').trim()) patch.address = contact.address;

    if ((contact.referencia ?? '').toString().trim()) patch.referencia = contact.referencia;
    else if (opts.esCorreccion) patch.referencia = null;

    if ((contact.maps_url ?? '').toString().trim()) patch.maps_url = contact.maps_url;
    else if (opts.esCorreccion) patch.maps_url = null;

    if (contact.latitude != null && contact.longitude != null) {
      patch.latitude = contact.latitude;
      patch.longitude = contact.longitude;
    } else if (opts.esCorreccion) {
      // Sin pin nuevo: se borra el viejo. Shipday geocodifica desde la dirección
      // en vez de enrutar a las coordenadas del domicilio anterior.
      patch.latitude = null;
      patch.longitude = null;
    }

    const digits = lastDigits(contact.phone);
    const res = await fetch(restUrl(`/contacts?phone_digits=eq.${digits}`), {
      method: 'PATCH',
      headers: serviceHeaders(),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Error actualizando contacto: ${res.status} ${await res.text()}`);
  } else {
    const res = await fetch(restUrl('/contacts'), {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify(contact),
    });
    if (!res.ok) throw new Error(`Error insertando contacto: ${res.status} ${await res.text()}`);
  }
}

// --- Puente de conciencia de pedidos (v48) -------------------------------------------------------
// Las funciones de despacho escriben el estado del pedido en `pedidos`; el copiloto (tool estado_pedido)
// lo LEE para responder "¿dónde está mi pedido?" sin inventar. Contrato: docs/handoff-pedidos-conciencia.md.
export interface PedidoUpsert {
  wa_id: string;               // teléfono; se normaliza a dígitos (debe cruzar con el waId de WATI)
  fuente: 'shopify' | 'shipday' | 'wati' | 'manual';
  pedido_ref: string;          // NÚMERO de pedido = llave de convergencia (misma en shopify y shipday)
  estado?: string;             // normalizado: nuevo/asignado/en_camino/entregado/fallido/cancelado
  estado_raw?: string | null;
  metodo?: string | null;      // propia/servientrega/retiro_agente_verde/asesor
  tracking?: string | null;
  total_usd?: number | null;
  resumen?: string | null;
  shopify_order_id?: string | null;
  shipday_order_id?: string | null;
  zona?: string | null;            // F4 (v31): zona resuelta (metro) o "INT provincia · lugar"
  zona_estado?: string | null;     // ok / ambiguo / sin_match / sin_servicio
  zona_ambito?: string | null;     // metro / interior
  tarifa_zona_usd?: number | null; // solo metro ok
  envio_flag?: string | null;      // eligio_ciudad_siendo_interior · domicilio_imposible_z4a · ...
}

// Upsert por (fuente, pedido_ref) vía PostgREST (merge-duplicates). BEST-EFFORT y NULL-SAFE: nunca lanza —
// un fallo aquí no debe romper el despacho ni la notificación (la orden en Shipday ya salió). Solo incluye
// los campos con valor (así una fila 'shipday' no pisa el metodo/total que puso la fila 'shopify').
export async function upsertPedido(p: PedidoUpsert): Promise<void> {
  try {
    const wa = String(p.wa_id ?? '').replace(/\D/g, '');
    // Canónico: "#1001" y "1001" deben CONVERGER (la app nativa de Shipday devolvería "#1001" mientras
    // shopify-webhook graba "1001"). Se quita el '#' inicial para que la fila shopify y la shipday agrupen.
    const ref = String(p.pedido_ref ?? '').trim().replace(/^#+/, '');
    if (wa.length < 6 || !ref) return; // sin llave útil (teléfono/número) no escribimos
    const row: Record<string, unknown> = {
      wa_id: wa, fuente: p.fuente, pedido_ref: ref, updated_at: new Date().toISOString(),
    };
    for (const k of ['estado', 'estado_raw', 'metodo', 'tracking', 'total_usd', 'resumen', 'shopify_order_id', 'shipday_order_id', 'zona', 'zona_estado', 'zona_ambito', 'tarifa_zona_usd', 'envio_flag'] as const) {
      const v = p[k];
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      row[k] = v;
    }
    const res = await fetch(restUrl('/pedidos?on_conflict=fuente,pedido_ref'), {
      method: 'POST',
      headers: { ...serviceHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(8000), // no colgar la respuesta del webhook si la DB tarda
    });
    if (!res.ok) console.error(`upsertPedido ${p.fuente}/${ref} falló: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error('upsertPedido error:', (err as Error).message);
  }
}

// --- Conciencia de pedidos: lectura para la pierna de vuelta de Shipday (v66) ---------------------
// El webhook de Shipday a veces no trae teléfono del cliente y sus eventos pueden llegar fuera de orden.
// Esta lectura por `pedido_ref` (la llave que comparten las filas shopify/wati/shipday) devuelve:
//   - wa_id: el teléfono del cliente tomado de la fila shopify/wati (NO de una fila shipday), para poder
//            escribir/convergir la fila shipday aunque el webhook venga sin teléfono.
//   - estado: el estado MÁS AVANZADO ya guardado, para no degradarlo con un evento tardío.
// BEST-EFFORT: ante cualquier fallo devuelve nulls y el webhook sigue como podía.
export async function infoPedidoActual(pedidoRef: string): Promise<{ estado: string | null; wa_id: string | null }> {
  try {
    const ref = String(pedidoRef ?? '').trim().replace(/^#+/, '');
    if (!ref) return { estado: null, wa_id: null };
    const res = await fetch(
      restUrl(`/pedidos?pedido_ref=eq.${encodeURIComponent(ref)}&select=estado,wa_id,fuente`),
      { headers: serviceHeaders(), signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return { estado: null, wa_id: null };
    const rows = await res.json() as Array<{ estado?: string; wa_id?: string; fuente?: string }>;
    const RANK: Record<string, number> = { nuevo: 0, asignado: 1, en_camino: 2, entregado: 3, fallido: 3, cancelado: 3 };
    let estado: string | null = null, bestRank = -1;
    let waCliente: string | null = null, waCualquiera: string | null = null;
    for (const r of rows) {
      const e = String(r.estado ?? '');
      const rk = RANK[e] ?? -1;
      if (rk > bestRank) { bestRank = rk; estado = e || null; }
      if (r.wa_id) {
        if (!waCualquiera) waCualquiera = String(r.wa_id);
        if (!waCliente && r.fuente !== 'shipday') waCliente = String(r.wa_id); // el teléfono real del cliente
      }
    }
    return { estado, wa_id: waCliente ?? waCualquiera };
  } catch { return { estado: null, wa_id: null }; }
}

// --- Idempotencia de despacho Shopify→Shipday (v62) -----------------------------------------------
// Shopify entrega los webhooks AT-LEAST-ONCE (reintenta ante timeout o respuesta no-2xx), y un mismo
// pedido puede además disparar varios eventos (creación + preparación). Sin guarda, cada reintento crea
// una NUEVA orden en Shipday → doble asignación/entrega. La marca de "ya despachado" es
// `pedidos.shipday_order_id` (el id que devuelve Shipday al crear la orden), que se persiste tras un
// despacho exitoso. Este helper la lee para no recrear. BEST-EFFORT: ante fallo devuelve null (y el
// llamador, ante la duda, despacha — se favorece no perder el pedido).
export async function shipdayOrderIdDe(pedidoRef: string): Promise<string | null> {
  try {
    const ref = String(pedidoRef ?? '').trim().replace(/^#+/, '');
    if (!ref) return null;
    const res = await fetch(
      restUrl(`/pedidos?fuente=eq.shopify&pedido_ref=eq.${encodeURIComponent(ref)}&select=shipday_order_id&limit=1`),
      { headers: serviceHeaders(), signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const rows = await res.json() as Array<{ shipday_order_id?: string | null }>;
    const v = rows?.[0]?.shipday_order_id;
    return v != null && String(v).trim() ? String(v) : null;
  } catch { return null; }
}

// --- Idempotencia del despacho por WATI (v63) ------------------------------------------------------
// El asesor dispara la plantilla "Despachar a Shipday" desde el inbox. Si la dispara dos veces (doble
// clic, duda de si salió, o dos asesores sobre el mismo chat), hoy se crean DOS órdenes en Shipday →
// dos repartidores al mismo destino. A diferencia de Shopify, aquí no siempre hay número de pedido:
// watiCaptureToShipday genera `WATI-<timestamp>`, distinto en cada disparo, así que la llave no puede
// ser el pedido_ref. La guarda real es por CLIENTE + VENTANA DE TIEMPO: si a este wa_id ya se le creó
// una orden hace pocos minutos, es el mismo despacho repetido.
// BEST-EFFORT: ante cualquier fallo devuelve null y el llamador despacha (mejor repetir que perder).
export async function pedidoWatiReciente(waId: string, minutos = 15): Promise<{ pedido_ref: string; shipday_order_id: string | null } | null> {
  try {
    const wa = String(waId ?? '').replace(/\D/g, '');
    if (wa.length < 6) return null;
    const desde = new Date(Date.now() - minutos * 60 * 1000).toISOString();
    const res = await fetch(
      restUrl(`/pedidos?wa_id=eq.${encodeURIComponent(wa)}&fuente=eq.wati&created_at=gte.${encodeURIComponent(desde)}&select=pedido_ref,shipday_order_id&order=created_at.desc&limit=1`),
      { headers: serviceHeaders(), signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const rows = await res.json() as Array<{ pedido_ref?: string; shipday_order_id?: string | null }>;
    const r = rows?.[0];
    return r?.pedido_ref ? { pedido_ref: String(r.pedido_ref), shipday_order_id: r.shipday_order_id ?? null } : null;
  } catch { return null; }
}

// --- Watchdog de actividad (v69) -----------------------------------------------------------------
// El apagón del 15-ago (WATI desactivó el webhook y nadie se enteró en 8 h) dejó claro que falta una
// señal de "no está entrando NADA". `job_log` no sirve como latido —un turno normal exitoso no siempre
// escribe ahí—; la señal buena es la tabla `messages`: si no hay NINGÚN mensaje (cliente, bot o asesor)
// en horario hábil, algo está roto aguas arriba.

// Marca de tiempo del mensaje más reciente (cualquier rol). null = tabla vacía o error.
export async function ultimoMensajeAt(): Promise<string | null> {
  try {
    const res = await fetch(restUrl('/messages?select=created_at&order=created_at.desc&limit=1'), {
      headers: serviceHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const filas = await res.json();
    return filas?.[0]?.created_at ?? null;
  } catch { return null; }
}

// Resumen del día (RPC `resumen_diario`): volumen, incidencias, silencio máximo y —lo importante— las
// conversaciones que quedaron SIN RESPONDER (ni bot ni asesor). Alimenta el correo de cierre.
export interface ResumenDiario {
  desde: string;
  clientes: { escribieron: number; atendidos: number; sin_atencion: number };
  mensajes: { de_clientes: number; del_bot: number; de_asesores: number };
  incidencias: Record<string, number>;
  silencio_max_min: number;
  sin_responder: Array<{ wa_id: string; nombre: string | null; hora: string; espera_min: number; texto: string }>;
  sin_responder_n: number;
}

export async function resumenDiario(minEspera = 45): Promise<ResumenDiario | null> {
  try {
    const res = await fetch(restUrl('/rpc/resumen_diario'), {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ p_min_espera: minEspera }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json() as ResumenDiario;
  } catch { return null; }
}

// Filas recientes de job_log con esta `action` (el resumen las usa para marcar 💰 los casos que el
// copiloto NO puede atender — los escribe el barrido en copilot-webhook como `desatencion_avisada`; y
// las banderas de zona/envío `pedido_flag` que escribe shopify-webhook).
export async function jobLogRecientes(action: string, desdeIso: string, limite = 100): Promise<Array<{ created_at: string; detail: any }>> {
  try {
    const url = `/job_log?select=created_at,detail&action=eq.${encodeURIComponent(action)}&created_at=gte.${encodeURIComponent(desdeIso)}&order=created_at.desc&limit=${limite}`;
    const res = await fetch(restUrl(url), { headers: serviceHeaders(), signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Última fila de job_log con esta `action` (para el anti-spam de alertas y el aviso de recuperación).
export async function ultimoJobLog(action: string, desdeIso: string): Promise<{ created_at: string; detail: any } | null> {
  try {
    const url = `/job_log?select=created_at,detail&action=eq.${encodeURIComponent(action)}&created_at=gte.${encodeURIComponent(desdeIso)}&order=created_at.desc&limit=1`;
    const res = await fetch(restUrl(url), { headers: serviceHeaders(), signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const filas = await res.json();
    return filas?.[0] ?? null;
  } catch { return null; }
}

// --- Resolución de zona (v52) --------------------------------------------------------------------
// El diccionario + el RPC `resolver_tarifa_v2` (v31: metro E interior) saben la zona real de una dirección;
// Shipday solo geocodifica texto libre. Esto NO reemplaza el geocoding: enriquece la orden con la
// zona/tarifa/método de la tabla para quien despacha, y alimenta el campo `metodo` de `pedidos`.
// BEST-EFFORT: ante cualquier fallo devuelve null y el despacho sigue exactamente igual que antes.
export interface ZonaResuelta {
  estado: 'ok' | 'ambiguo' | 'sin_match' | 'sin_servicio';
  ambito?: 'metro' | 'interior';
  provincia?: string;
  lugar?: string;
  nota?: string;
  tarifa_con_itbms?: number;
  envio_gratis_umbral_usd?: number;
  zona?: string;
  tarifa_usd?: number;
  metodo?: string;
  plazo?: string;
  puntos_retiro?: string | null;
  confianza?: string;
  sectores?: string[];
  ubicacion?: { provincia?: string; distrito?: string | null; corregimiento?: string | null; barrio?: string | null };
  opciones?: Array<Record<string, unknown>>;
  motivo?: string;
}

export async function resolverTarifa(lugar: string): Promise<ZonaResuelta | null> {
  if (!String(lugar ?? '').trim()) return null;
  try {
    const res = await fetch(restUrl('/rpc/resolver_tarifa_v2'), {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ p_lugar: lugar }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`resolver_tarifa falló: ${res.status} ${await res.text()}`);
      return null;
    }
    return await res.json() as ZonaResuelta;
  } catch (err) {
    console.error('resolver_tarifa error:', (err as Error).message);
    return null;
  }
}
