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
    if (contact.latitude != null && contact.longitude != null) {
      patch.latitude = contact.latitude;
      patch.longitude = contact.longitude;
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

// --- Resolución de zona --------------------------------------------------------------------------
// El diccionario + el RPC `resolver_tarifa_v2` (metro E interior) saben la zona real de una
// dirección. BEST-EFFORT: ante cualquier fallo devuelve null y quien llama sigue sin zona.
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
      console.error(`resolver_tarifa_v2 falló: ${res.status} ${await res.text()}`);
      return null;
    }
    return await res.json() as ZonaResuelta;
  } catch (err) {
    console.error('resolver_tarifa_v2 error:', (err as Error).message);
    return null;
  }
}
