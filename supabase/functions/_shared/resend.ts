// Envío de correo vía Resend. Se usa para ALERTAS OPERATIVAS (watchdog), no para hablarle a clientes.
//
// Por qué correo y no WhatsApp: la alerta no debe viajar por el canal que puede estar roto. El apagón del
// 15-ago fue precisamente WATI dejando de llamar al webhook — avisar POR WATI habría sido apostar a que el
// sistema caído funcione. Resend es un camino independiente (y no necesita plantilla aprobada por Meta).
//
// Nunca lanza: una alerta que falla no debe romper la corrida del watchdog (se registra el fallo y ya).

export interface ResultadoCorreo { ok: boolean; id?: string; error?: string; }

export async function enviarCorreo(asunto: string, cuerpoHtml: string, destinatarios: string[]): Promise<ResultadoCorreo> {
  const key = (Deno.env.get('RESEND_API_KEY') ?? '').trim();
  if (!key) return { ok: false, error: 'falta_resend_api_key' };
  const from = (Deno.env.get('ALERTA_FROM') ?? 'alertas@quickservicepanama.com').trim();
  const to = destinatarios.map((d) => d.trim()).filter(Boolean);
  if (!to.length) return { ok: false, error: 'sin_destinatarios' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: asunto, html: cuerpoHtml }),
      signal: AbortSignal.timeout(15000),
    });
    const cuerpo = await res.text();
    if (!res.ok) {
      // Se enmascara la key por si Resend la echoara en el error (lección del 401 de OpenAI, 13-ago).
      return { ok: false, error: `http_${res.status}:${cuerpo.replaceAll(key, '***').slice(0, 200)}` };
    }
    let id: string | undefined;
    try { id = JSON.parse(cuerpo)?.id; } catch { /* respuesta sin JSON: no importa */ }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: `excepcion:${String(e).slice(0, 200)}` };
  }
}
