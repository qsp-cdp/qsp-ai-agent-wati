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
