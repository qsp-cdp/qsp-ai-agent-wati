// P4 — CAPA 3 del resolvedor de direcciones: geocodificación externa (Google), SOLO como último recurso.
//
// El orden de resolución es, de gratis a pago:
//   1. Diccionario léxico (sectores_entrega, 2053 entradas incl. 1522 PH) — resolver_tarifa_v2.
//   2. Pin del cliente → polígonos oficiales de corregimientos — zona_por_coordenadas (v80).
//   3. ESTA función: el texto no matcheó y no hay pin → se le pregunta a Google dónde queda, y la
//      ZONA la sigue decidiendo NUESTRO polígono a partir de las coordenadas. Google traduce
//      "Local de Emtop, Vía Brasil" → lat/lng; nunca decide la tarifa.
//
// Controles de costo (el volumen real es ~6 direcciones sin resolver / 30 días, sobre 10.000 gratis/mes):
//   · CACHÉ: la misma dirección normalizada no se vuelve a pagar nunca (tabla geocache, campo hits).
//   · TOPE DIARIO: MAX_LLAMADAS_24H consultas nuevas por día; superado, responde sin llamar a Google.
//   · Se cachean TAMBIÉN los fallos, para no reintentar en bucle una dirección imposible.
// Llave propia, en un SECRETO y no en el código (estuvo escrita aquí, o sea en git). Quien la tenga
// gasta la cuota de Google de la cuenta —el único paso PAGO de la cadena— y además siembra el
// diccionario permanente de direcciones vía el aprendizaje de abajo. FAIL-CLOSED (el `!KEY` del guard):
// sin el secreto no se atiende ninguna llamada; una función abierta hace más daño que una caída, porque
// la capa 3 ausente solo degrada la resolución, mientras que la abierta la envenena y la factura.
// ⚠️ El copiloto llama a esta función con esta misma llave: si se rota, hay que rotarla también allá.
const KEY = (Deno.env.get('GEO_FALLBACK_KEY') ?? '').trim();
const GOOGLE = (Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '').trim();
const MAX_LLAMADAS_24H = Number(Deno.env.get('GEO_MAX_24H') ?? '200');
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } }); }

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${fn}: ${r.status}`);
  return await r.json();
}

// Google Places Text Search (New). Se sesga a Panamá con locationBias para que "Vía Brasil" no
// caiga en Brasil, y se pide SOLO el campo de ubicación (menos datos, menos SKU).
async function buscarEnGoogle(direccion: string): Promise<{ lat: number; lng: number; nombre?: string } | null> {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE,
      'X-Goog-FieldMask': 'places.location,places.formattedAddress,places.displayName',
    },
    body: JSON.stringify({
      textQuery: direccion,
      languageCode: 'es',
      regionCode: 'PA',
      maxResultCount: 1,
      // Caja aproximada de la Ciudad de Panamá y alrededores: acota el resultado al área de interés.
      locationBias: { rectangle: { low: { latitude: 8.75, longitude: -79.85 }, high: { latitude: 9.25, longitude: -79.30 } } },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`google_${r.status}:${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  const p = d?.places?.[0];
  const lat = p?.location?.latitude, lng = p?.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng, nombre: p?.displayName?.text ?? p?.formattedAddress };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!KEY || url.searchParams.get('key') !== KEY) return json({ error: 'forbidden' }, 403);

  // Autodiagnóstico: confirma que el secreto existe y que Google responde, sin tocar la caché.
  if (url.searchParams.get('selftest') === '1') {
    if (!GOOGLE) return json({ ok: false, error: 'falta_GOOGLE_MAPS_API_KEY' });
    try {
      const g = await buscarEnGoogle('Plaza Aventura, Panama');
      return json({ ok: !!g, clave_configurada: true, prueba: g ? 'google_responde' : 'sin_resultado', muestra: g?.nombre ?? null });
    } catch (e) { return json({ ok: false, clave_configurada: true, error: String(e).slice(0, 200) }); }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const raw = String(body?.direccion ?? '').trim().slice(0, 300);
    if (raw.length < 4) return json({ estado: 'sin_dato' });
    const norm = (await rpc('norm_lugar', { t: raw })) as unknown as string;
    const clave = String(norm ?? raw.toLowerCase()).slice(0, 300);

    // 1) CACHÉ — respuesta gratis e instantánea si ya la vimos.
    const cq = await fetch(`${SB_URL}/rest/v1/geocache?consulta_norm=eq.${encodeURIComponent(clave)}&select=*`, { headers: H, signal: AbortSignal.timeout(5000) });
    const cached = cq.ok ? (await cq.json())[0] : null;
    if (cached) {
      await fetch(`${SB_URL}/rest/v1/geocache?consulta_norm=eq.${encodeURIComponent(clave)}`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ hits: (cached.hits ?? 1) + 1, updated_at: new Date().toISOString() }),
      }).catch(() => {});
      return json({ estado: cached.estado, zona: cached.zona, corregimiento: cached.corregimiento, lat: cached.lat, lng: cached.lng, origen: 'cache' });
    }

    if (!GOOGLE) return json({ estado: 'no_configurado' });

    // 2) TOPE DE GASTO — nunca más de N consultas nuevas en 24h, pase lo que pase.
    const usadas = Number(await rpc('geocache_llamadas_hoy', {}));
    if (usadas >= MAX_LLAMADAS_24H) return json({ estado: 'tope_diario', usadas });

    // 3) Google traduce la dirección a coordenadas; NUESTRO polígono decide la zona.
    let fila: Record<string, unknown>;
    try {
      const g = await buscarEnGoogle(raw);
      if (!g) {
        fila = { consulta_norm: clave, consulta_raw: raw, estado: 'sin_resultado' };
      } else {
        const z = await rpc('zona_por_coordenadas', { p_lat: g.lat, p_lng: g.lng }) as any;
        fila = {
          consulta_norm: clave, consulta_raw: raw, lat: g.lat, lng: g.lng,
          // v2: el NOMBRE CANÓNICO del lugar según Google (ej. "EMTOP"). Es lo que se indexa en el
          // diccionario al aprender: se repite entre clientes, a diferencia de la frase suelta que
          // escribió este cliente en particular.
          nombre_lugar: g.nombre ?? null,
          zona: z?.zona ?? null, corregimiento: z?.corregimiento ?? null,
          estado: z?.estado === 'ok' ? 'ok' : 'fuera_area',
        };
      }
    } catch (e) {
      fila = { consulta_norm: clave, consulta_raw: raw, estado: 'error' };
      await fetch(`${SB_URL}/rest/v1/job_log`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ function_name: 'geo-fallback', action: 'google_error', ok: false, detail: { error: String(e).slice(0, 200) } }) }).catch(() => {});
    }

    // Se cachea SIEMPRE (incluidos los fallos): una dirección imposible no se reintenta en bucle.
    await fetch(`${SB_URL}/rest/v1/geocache`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(fila) }).catch(() => {});
    await fetch(`${SB_URL}/rest/v1/job_log`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ function_name: 'geo-fallback', action: 'geocode', ok: fila.estado === 'ok', detail: { estado: fila.estado, zona: fila.zona ?? null, usadas: usadas + 1 } }) }).catch(() => {});

    // APRENDIZAJE: si Google ubicó el lugar y el polígono dio zona, el nombre canónico pasa a ser una
    // entrada permanente del diccionario — la próxima vez (y cualquier variante de la frase) resuelve
    // GRATIS por texto, sin llamar a Google. La función aplica sus propios guardarraíles (el nombre
    // debe aparecer en lo que escribió el cliente, no puede pisar entradas existentes, etc.).
    if (fila.estado === 'ok') {
      try {
        const aprendidos = await rpc('promover_geocache_al_diccionario', {}) as any[];
        if (Array.isArray(aprendidos) && aprendidos.length) {
          await fetch(`${SB_URL}/rest/v1/job_log`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
            body: JSON.stringify({ function_name: 'geo-fallback', action: 'diccionario_aprendio', ok: true,
              detail: { nuevos: aprendidos.length, nombres: aprendidos.map((a) => a.nombre).slice(0, 5) } }) }).catch(() => {});
        }
      } catch { /* aprender es un extra: si falla, la respuesta al cliente no cambia */ }
    }

    return json({ estado: fila.estado, zona: fila.zona ?? null, corregimiento: fila.corregimiento ?? null, lat: fila.lat ?? null, lng: fila.lng ?? null, origen: 'google' });
  } catch (e) {
    return json({ estado: 'error', error: String(e).slice(0, 200) }, 500);
  }
});
