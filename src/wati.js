// Cliente mínimo del API de WATI para enviar mensajes de sesión.
// Config: WATI_API_ENDPOINT (ej. https://live-server-12345.wati.io) y
// WATI_API_TOKEN (WATI Dashboard → API Docs → token).
export async function sendWatiSessionMessage(phone, text, {
  endpoint = process.env.WATI_API_ENDPOINT,
  token = process.env.WATI_API_TOKEN,
  fetchFn = fetch,
} = {}) {
  if (!endpoint || !token) {
    throw new Error('Faltan WATI_API_ENDPOINT / WATI_API_TOKEN en el entorno');
  }
  const number = String(phone).replace(/\D/g, '');
  const url = `${endpoint.replace(/\/$/, '')}/api/v1/sendSessionMessage/${number}?messageText=${encodeURIComponent(text)}`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`WATI respondió ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
