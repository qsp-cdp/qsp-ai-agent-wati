// wati-classify v4 - clasificador de direcciones en texto libre.
//   POST /functions/v1/wati-classify   header x-wati-token
//   body { texto, waId?, texto_previo? }
//
// CAMBIO DE LA v4 (lo destapo la prueba "Condado del Rey, PH Rokas"): la v3
// consultaba PRIMERO el corregimiento inferido por el LLM y lo trataba como
// verdad. El cruce corregimiento->zona es determinista, pero el corregimiento
// de ENTRADA era una suposicion del modelo -> devolvio Z5 Norte $9 cuando la
// respuesta correcta es Z1 Centro $6.
// AHORA EL ORDEN ES: TEXTO PRIMERO (evidencia: barrios y landmarks reales del
// diccionario, cargados desde pines) y el corregimiento inferido SOLO como
// respaldo cuando el texto no resuelve.
//
// Escalones:
//   1) el LLM EXTRAE estructura del texto. NO decide zona ni tarifa.
//   2) escalon TEXTO: resolver_tarifa_v2 con lo que escribio el cliente.
//   3) escalon CORREGIMIENTO: solo si el texto no resolvio, y solo si el LLM
//      declaro confianza alta o media (con confianza baja no se usa).
//
// Codigos: 200 zona resuelta · 409 ambiguo sin desempate · 422 incompleto o
//          sin zona · 400 no se entendio

const MODELO = 'claude-sonnet-4-6';

const PROMPT = [
  'Sos un extractor de direcciones de Panama. Recibis como escribio su direccion un cliente por WhatsApp y devolves SOLO un objeto JSON.',
  '',
  'REGLAS (en orden de importancia):',
  '1. Extrae UNICAMENTE lo que esta escrito. Esta PROHIBIDO completar, corregir o adivinar datos que el cliente no dio. Si no menciona numero de casa, "numero" es null. Si no menciona edificio, "edificio" es null.',
  '2. Si el lugar que menciona existe en mas de una provincia de Panama (por ejemplo "San Francisco" esta en el distrito de Panama y tambien existe San Francisco de la Montana en Veraguas; "Santa Ana", "El Valle" y "La Chorrera" tienen casos parecidos), NO elijas: pone confianza "baja" y lista las alternativas en "ambiguo_con".',
  '3. En el interior del pais muchas direcciones NO tienen numeracion y eso es normal y valido ("casa de la familia Perez, entrando por la escuela"). Si hay una referencia util, la direccion cuenta como completa aunque no haya numero.',
  '4. El corregimiento es dificil y muchos barrios de Panama atraviesan mas de uno. Si no estas seguro, pone corregimiento null y confianza "baja" en vez de arriesgar.',
  '5. Responde SOLO el JSON, sin explicaciones, sin markdown, sin backticks.',
  '',
  'CAMPOS:',
  '- linea: la direccion ordenada en una sola linea, legible y natural, SIN recitar provincia/distrito/corregimiento.',
  '- detalle.via: calle, avenida, via o camino. null si no hay.',
  '- detalle.numero: numero de casa o lote. null si no hay.',
  '- detalle.edificio: nombre de edificio, torre, PH o plaza. null si no hay.',
  '- detalle.unidad: apartamento, oficina, local o piso. null si no hay.',
  '- detalle.barrio: barriada, urbanizacion o sector. null si no hay.',
  '- detalle.referencia: punto de referencia. null si no hay.',
  '- jerarquia_inferida.provincia / .distrito / .corregimiento: SOLO si se deducen con seguridad de lo escrito. null si no.',
  '- jerarquia_inferida.confianza: "alta" si el lugar es inequivoco, "media" si es probable, "baja" si estas adivinando o hay ambiguedad.',
  '- jerarquia_inferida.ambiguo_con: lista de otras interpretaciones posibles. [] si no hay.',
  '- completo: true si con esto un repartidor llegaria. Guia: edificio o plaza + unidad (local/apto/oficina) -> true; via+numero -> true; referencia clara en el interior -> true; solo un barrio o solo un corregimiento -> false.',
  '- falta: lista de campos que faltarian. [] si completo.',
  '- pregunta_sugerida: una sola pregunta corta y natural para pedir lo que falta. null si completo.',
  '',
  'FORMATO EXACTO:',
  '{"linea":"","detalle":{"via":null,"numero":null,"edificio":null,"unidad":null,"barrio":null,"referencia":null},"jerarquia_inferida":{"provincia":null,"distrito":null,"corregimiento":null,"confianza":"baja","ambiguo_con":[]},"completo":false,"falta":[],"pregunta_sugerida":null}',
].join('\n');

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
}
function rest(p: string) { return `${Deno.env.get('SUPABASE_URL')}/rest/v1${p}`; }
function svc() {
  const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
}
async function porTexto(texto: string) {
  const r = await fetch(rest('/rpc/resolver_tarifa_v2'), { method: 'POST', headers: svc(), body: JSON.stringify({ p_lugar: texto }) });
  return r.ok ? await r.json() : null;
}
async function porCorregimiento(correg: string | null) {
  const r = await fetch(rest('/rpc/zona_por_corregimiento'), { method: 'POST', headers: svc(), body: JSON.stringify({ p_correg: correg ?? '' }) });
  if (!r.ok) return null;
  const f = await r.json();
  return Array.isArray(f) ? f[0] ?? null : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405);
  const esperado = Deno.env.get('WATI_WEBHOOK_TOKEN');
  if (!esperado || req.headers.get('x-wati-token') !== esperado) return json({ error: 'Token invalido' }, 401);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ ok: false, error: 'Falta ANTHROPIC_API_KEY' }, 500);

  let p: any = {};
  try { p = await req.json(); } catch { /* */ }
  const texto = String(p?.texto ?? '').trim();
  const previo = String(p?.texto_previo ?? '').trim();
  if (!texto || texto.startsWith('@') || texto.includes('{{')) return json({ ok: false, motivo: 'texto_vacio_o_sin_resolver' }, 400);
  const entrada = previo ? `${previo}\n${texto}` : texto;

  // ---- paso 1: extraccion por LLM ----
  let datos: any = null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO, max_tokens: 700, system: PROMPT, messages: [{ role: 'user', content: entrada }] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return json({ ok: false, motivo: 'llm_error', http: r.status, detalle: (await r.text()).slice(0, 200) }, 400);
    const cuerpo = await r.json();
    const t = (cuerpo?.content ?? []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('');
    datos = JSON.parse(String(t).replace(/```json|```/g, '').trim());
  } catch (err) {
    return json({ ok: false, motivo: 'no_se_entendio', detalle: String(err).slice(0, 160) }, 400);
  }

  // ---- paso 2: TEXTO primero (evidencia real del diccionario) ----
  const b = await porTexto(entrada);
  let via = 'texto';
  let tarifa: any = b ?? { estado: 'sin_match' };
  let opciones: string[] | null = null;

  // ---- paso 3: corregimiento inferido SOLO como respaldo, y sin confianza baja ----
  if (String(tarifa?.estado) !== 'ok') {
    const conf = String(datos?.jerarquia_inferida?.confianza ?? 'baja').toLowerCase();
    const correg = datos?.jerarquia_inferida?.corregimiento ?? null;
    if (correg && conf !== 'baja') {
      const a = await porCorregimiento(correg);
      if (a?.estado === 'ok') {
        via = 'corregimiento_respaldo';
        tarifa = { ambito: 'metro', estado: 'ok', zona: a.zona, tarifa_usd: a.tarifa_usd, metodo: a.metodo };
      } else if (a?.estado === 'ambiguo' && String(tarifa?.estado) !== 'ambiguo') {
        via = 'corregimiento_ambiguo';
        opciones = a.opciones ?? null;
        tarifa = { ambito: 'metro', estado: 'ambiguo', opciones: a.opciones };
      }
    }
  }

  const est = String(tarifa?.estado ?? 'sin_match');
  const zonaResuelta = est === 'ok';
  const zonaAmbigua = est === 'ambiguo';

  const salida = {
    ok: true,
    linea: datos?.linea ?? '',
    detalle: datos?.detalle ?? {},
    jerarquia: datos?.jerarquia_inferida ?? {},
    via_resolucion: via,
    tarifa,
    opciones_zona: opciones,
    completo: Boolean(datos?.completo),
    zona_resuelta: zonaResuelta,
    falta: datos?.falta ?? [],
    pregunta_sugerida: datos?.pregunta_sugerida ?? null,
  };

  if (zonaAmbigua) return json({ ...salida, rama: 'ambiguo' }, 409);
  if (!salida.completo) return json({ ...salida, rama: 'incompleto' }, 422);
  if (!zonaResuelta) return json({ ...salida, rama: 'sin_zona' }, 422);
  return json({ ...salida, rama: 'ok' }, 200);
});
