// === cotizador v2 — F2 frente tarifario (2026-08-06) ===
// Cotizador interno de ENVÍOS para agentes humanos. La página oculta de la tienda
// (quickservicepanama.com/pages/cotizador) llama aquí; esta función consulta
// resolver_tarifa_v2 (la MISMA fuente de verdad que usa el bot) con service role.
// Solo lectura de tarifas + telemetría propia en job_log:
//   cotizador_consulta {lugar, estado, ambito, zona} · cotizador_reporte {lugar}
// Nota: v2 llama a resolver_tarifa_core directo, así que estas consultas NO se
// mezclan con la telemetría tarifa_consulta del bot/webhook (streams separados).
// Acceso: clave simple en store_facts.cotizador_key (anti-bots; rotable por SQL).
// CORS: solo los dominios de la tienda. Desplegar con verify_jwt=false.

const ALLOWED = [
  'https://quickservicepanama.com',
  'https://www.quickservicepanama.com',
];

function cors(origin: string | null): Record<string, string> {
  const o = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Content-Type': 'application/json',
  };
}

function restUrl(path: string): string {
  const base = Deno.env.get('SUPABASE_URL');
  if (!base) throw new Error('Falta SUPABASE_URL');
  return `${base}/rest/v1${path}`;
}

function svcHeaders(): Record<string, string> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

// Logger a job_log (mismo patrón best-effort del resto de funciones: nunca lanza).
async function logJob(action: string, ok: boolean, detail: unknown): Promise<void> {
  try {
    await fetch(restUrl('/job_log'), {
      method: 'POST',
      headers: { ...svcHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ function_name: 'cotizador', action, ok, detail }),
      signal: AbortSignal.timeout(4000),
    });
  } catch { /* nunca romper */ }
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'metodo' }), { status: 405, headers: h });
  try {
    const body = await req.json().catch(() => ({}));
    const lugar = String(body?.lugar ?? '').trim().slice(0, 200);
    const k = String(body?.k ?? '');

    // clave en datos (store_facts.cotizador_key): rotable por SQL sin redeploy
    const r0 = await fetch(restUrl('/store_facts?key=eq.cotizador_key&select=value'), {
      headers: svcHeaders(), signal: AbortSignal.timeout(5000),
    });
    const rows = r0.ok ? await r0.json() : [];
    if (!rows?.[0]?.value || k !== rows[0].value) {
      return new Response(JSON.stringify({ error: 'clave' }), { status: 401, headers: h });
    }
    if (!lugar) return new Response(JSON.stringify({ error: 'lugar' }), { status: 400, headers: h });

    // botón "reportar lugar": deja el registro (+ nota del agente) para el bucle de alias, no cotiza
    if (body?.reporte === true) {
      const nota = String(body?.nota ?? '').trim().slice(0, 200);
      await logJob('cotizador_reporte', true, nota ? { lugar: lugar.slice(0, 120), nota } : { lugar: lugar.slice(0, 120) });
      return new Response(JSON.stringify({ ok: true, reportado: true }), { headers: h });
    }

    const r = await fetch(restUrl('/rpc/resolver_tarifa_v2'), {
      method: 'POST', headers: svcHeaders(),
      body: JSON.stringify({ p_lugar: lugar }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`rpc ${r.status}: ${(await r.text()).slice(0, 150)}`);
    const v = await r.json();
    await logJob('cotizador_consulta', true, {
      lugar: lugar.slice(0, 120),
      estado: v?.estado ?? null,
      ambito: v?.ambito ?? null,
      zona: v?.zona ?? v?.lugar ?? null,
    });
    return new Response(JSON.stringify(v), { headers: h });
  } catch (e) {
    await logJob('cotizador_consulta', false, { error: String(e).slice(0, 200) });
    return new Response(JSON.stringify({ error: 'interno' }), { status: 500, headers: h });
  }
});
