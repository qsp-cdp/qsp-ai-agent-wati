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
  const cuerpo = (await res.text().catch(() => '')).slice(0, 200);
  if (!res.ok) throw new Error(`WATI respondió ${res.status}: ${cuerpo}`);
  // Lección v86 del copiloto: WATI contesta 200 con {"result":false,...} cuando el contacto no existe o
  // el atributo no está creado en su panel. Mirar solo el status daba "ok" con la ficha sin cambiar
  // (caso real 21-ago: dos espejos "200 ok" y ni un campo movido). El cuerpo manda.
  if (/"result"\s*:\s*false/i.test(cuerpo)) throw new Error(`WATI 200 pero result:false — ${cuerpo}`);
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
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` };
  const bcast = broadcastName || templateName;

  // WATI responde HTTP 200 con {result:false, info:"..."} en fallos de negocio (plantilla no aprobada,
  // número inválido…). Hay que tratarlo como error → NO se marca reengaged y se reintenta la próxima corrida.
  const okOrThrow = async (res: Response, quien: string) => {
    const data = await res.json().catch(() => ({}));
    if (data && data.result === false) {
      throw new Error(`WATI ${quien} result=false: ${data.info ?? JSON.stringify(data).slice(0, 200)}`);
    }
    return data;
  };

  // Endpoint 1 — plantilla ÚNICA: OJO, el número va como QUERY param `whatsappNumber`, NO en el path
  // (a diferencia de sendSessionMessage, que sí lo lleva en el path). Ponerlo en el path da 403 de gateway.
  const single = await fetch(
    `${cfg.base}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(number)}`,
    { method: 'POST', headers,
      body: JSON.stringify({ template_name: templateName, broadcast_name: bcast, parameters }),
      signal: AbortSignal.timeout(10000) },
  );
  if (single.ok) return await okOrThrow(single, 'sendTemplateMessage');

  // 403/404 → algunas cuentas exponen SOLO el endpoint BULK. Un 403/404 significa que WATI rechazó la ruta
  // ANTES de procesar (no envió nada), así que reintentar por bulk no puede duplicar el mensaje.
  if (single.status === 403 || single.status === 404) {
    const bulk = await fetch(`${cfg.base}/api/v1/sendTemplateMessages`, {
      method: 'POST', headers,
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: bcast,
        receivers: [{ whatsappNumber: number, customParams: parameters }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (bulk.ok) return await okOrThrow(bulk, 'sendTemplateMessages');
    throw new Error(`WATI sendTemplate ${single.status} + sendTemplates ${bulk.status}: ${(await bulk.text()).slice(0, 200)}`);
  }

  throw new Error(`WATI sendTemplate respondió ${single.status}: ${(await single.text()).slice(0, 200)}`);
}
