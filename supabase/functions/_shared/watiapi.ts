// Cliente del API de WATI compartido por las funciones.
// Usa los mismos secretos que ya tiene el copiloto (WATI_API_BASE/WATI_API_TOKEN);
// WATI_API_ENDPOINT se acepta como alias por compatibilidad.
function watiConfig(): { base: string; token: string } | null {
  // .trim() defensivo (patrón v40 del copiloto): un espacio/salto de línea pegado al pegar el secreto
  // rompería el Bearer en silencio. También se quita la barra final de la base.
  const base = (Deno.env.get('WATI_API_BASE') ?? Deno.env.get('WATI_API_ENDPOINT') ?? '').trim().replace(/\/$/, '');
  const token = (Deno.env.get('WATI_API_TOKEN') ?? '').trim();
  if (!base || !token) return null;
  return { base, token };
}

export async function sendWatiSessionMessage(phone: string, text: string) {
  const cfg = watiConfig();
  if (!cfg) throw new Error('Faltan WATI_API_BASE / WATI_API_TOKEN');
  const number = String(phone).replace(/\D/g, '');
  const url = `${cfg.base}/api/v1/sendSessionMessage/${number}?messageText=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`WATI respondió ${res.status}: ${await res.text()}`);
  return res.json();
}

// Actualiza los atributos custom del contacto en WATI (mismo formato que usa
// el copiloto). Los atributos deben existir en WATI → Contactos → Atributos.
export async function updateWatiAttributes(waId: string, attrs: Record<string, string>) {
  const cfg = watiConfig();
  if (!cfg) throw new Error('Faltan WATI_API_BASE / WATI_API_TOKEN');
  const customParams = Object.entries(attrs)
    .filter(([, v]) => String(v ?? '').trim())
    .map(([name, value]) => ({ name, value: String(value).slice(0, 250) }));
  if (!customParams.length) return { ok: true, vacio: true };
  const number = String(waId).replace(/\D/g, '');
  const res = await fetch(`${cfg.base}/api/v1/updateContactAttributes/${encodeURIComponent(number)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ customParams }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`WATI respondió ${res.status}: ${await res.text()}`);
  return { ok: true, campos: customParams.map((p) => p.name) };
}

// Envía una PLANTILLA HSM aprobada (único envío válido FUERA de la ventana de 24h de WhatsApp — a
// diferencia de sendSessionMessage). Lo usa el cron de re-enganche (reengage-expired). El número se
// normaliza a solo dígitos (igual que el resto de _shared). `parameters` son las variables {{1}},{{2}}…
// de la plantilla ([] si la plantilla no tiene variables — lo recomendado para el re-enganche).
export async function sendWatiTemplateMessage(
  phone: string,
  templateName: string,
  broadcastName: string,
  parameters: { name: string; value: string }[] = [],
) {
  const cfg = watiConfig();
  if (!cfg) throw new Error('Faltan WATI_API_BASE / WATI_API_TOKEN');
  if (!templateName) throw new Error('Falta template_name');
  const number = String(phone).replace(/\D/g, '');
  const res = await fetch(`${cfg.base}/api/v1/sendTemplateMessage/${encodeURIComponent(number)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({
      template_name: templateName,
      broadcast_name: broadcastName || templateName,
      parameters,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`WATI sendTemplate respondió ${res.status}: ${await res.text()}`);
  return res.json();
}
