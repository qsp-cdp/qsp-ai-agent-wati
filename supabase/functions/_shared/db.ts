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

// Inserta o actualiza el contacto por teléfono: así la libreta se mantiene
// fresca con cada captura o pedido que entra por WATI. En la actualización
// solo se tocan los campos que vienen con valor (no borra datos previos).
export async function upsertContactByPhone(contact: Contact): Promise<void> {
  const existing = await findContactByPhone(contact.phone);
  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ((contact.name || '').trim()) patch.name = contact.name;
    if ((contact.address || '').trim()) patch.address = contact.address;
    if ((contact.referencia ?? '').toString().trim()) patch.referencia = contact.referencia;
    if ((contact.maps_url ?? '').toString().trim()) patch.maps_url = contact.maps_url;
    // v65 — las coordenadas SOLO se escribían en el INSERT: un cliente recurrente que cambiaba de dirección
    // quedaba con el pin VIEJO y el driver de Shipday navegaba a la dirección anterior. Ahora el PATCH las
    // actualiza cuando vienen resueltas; si llega dirección nueva SIN coordenadas, se limpian las viejas
    // (mejor sin pin que con el pin equivocado — Shipday geocodifica el texto).
    if (contact.latitude != null && contact.longitude != null) {
      patch.latitude = contact.latitude;
      patch.longitude = contact.longitude;
    } else if ((contact.address || '').trim()) {
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
    for (const k of ['estado', 'estado_raw', 'metodo', 'tracking', 'total_usd', 'resumen', 'shopify_order_id', 'shipday_order_id'] as const) {
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

// --- Resolución de zona (v52) --------------------------------------------------------------------
// El diccionario `sectores_entrega` + el RPC `resolver_tarifa` saben la zona real de una dirección;
// Shipday solo geocodifica texto libre. Esto NO reemplaza el geocoding: enriquece la orden con la
// zona/tarifa/método de la tabla para quien despacha, y alimenta el campo `metodo` de `pedidos`.
// BEST-EFFORT: ante cualquier fallo devuelve null y el despacho sigue exactamente igual que antes.
export interface ZonaResuelta {
  estado: 'ok' | 'ambiguo' | 'sin_match';
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
    const res = await fetch(restUrl('/rpc/resolver_tarifa'), {
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
