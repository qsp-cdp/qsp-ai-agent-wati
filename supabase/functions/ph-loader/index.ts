// P3-c: CARGADOR del directorio de PH de eldeph.com → tabla ph_directorio.
// El listado público (https://eldeph.com/ph/tipo/propiedad-horizontal, 207 páginas /pN de 12 ítems)
// trae en cada tarjeta el nombre (h4.ph-list__title), la ubicación "Ciudad, Corregimiento."
// (span.ph-list__ubicacion) y el slug (/listado-de-ph/<slug>) — no hace falta abrir las 2,477 fichas.
//
// Corre desde una Edge Function porque el entorno de desarrollo remoto tiene eldeph.com bloqueado
// por proxy de egreso; aquí la salida es libre. Se invoca por RANGOS (?desde=1&hasta=30) vía
// net.http_post para caber en el tiempo de ejecución; ~400ms de pausa entre páginas para no
// castigar al sitio. Upsert por slug: re-correr un rango es idempotente. Borrar (o dejar para
// re-cargas periódicas) una vez cargado.
const KEY = 'phloader-x9t4k2w7q1';
const BASE = 'https://eldeph.com/ph/tipo/propiedad-horizontal';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function limpiar(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface FilaPH { slug: string; nombre: string; ubicacion_raw: string | null; ciudad: string | null; corregimiento: string | null; pagina: number; }

function parsearPagina(html: string, pagina: number): FilaPH[] {
  const filas: FilaPH[] = [];
  // Cada tarjeta empieza en ph-list-item; el primer segmento (antes de la primera tarjeta) se descarta.
  const trozos = html.split('<div class="ph-list-item">').slice(1);
  for (const t of trozos) {
    const slug = t.match(/listado-de-ph\/([^"]{1,180})"/)?.[1];
    const nombre = t.match(/ph-list__title"[^>]*>([\s\S]{1,220}?)<\/h4>/)?.[1];
    if (!slug || !nombre) continue;
    const ubic = t.match(/ph-list__ubicacion[\s\S]{0,400}?<\/i>([\s\S]{1,400}?)<\/span>/)?.[1];
    const ubicLimpia = ubic ? limpiar(ubic).replace(/\.\s*$/, '') : null;
    // "Ciudad de Panamá, San Francisco" → ciudad + corregimiento (best-effort; el crudo se conserva)
    let ciudad: string | null = null, correg: string | null = null;
    if (ubicLimpia) {
      const partes = ubicLimpia.split(',').map((p) => p.trim()).filter(Boolean);
      ciudad = partes[0] ?? null;
      correg = partes.length > 1 ? partes.slice(1).join(', ') : null;
    }
    filas.push({ slug, nombre: limpiar(nombre), ubicacion_raw: ubicLimpia, ciudad, corregimiento: correg, pagina });
  }
  return filas;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('key') !== KEY) return json({ error: 'Token inválido' }, 401);
  const desde = Math.max(1, Number(url.searchParams.get('desde')) || 1);
  const hasta = Math.min(207, Number(url.searchParams.get('hasta')) || desde + 29);

  const base = Deno.env.get('SUPABASE_URL');
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return json({ ok: false, error: 'faltan SUPABASE_URL / SERVICE_ROLE_KEY' }, 500);
  const hdrs = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };

  let paginasOk = 0, filasTotal = 0;
  const errores: string[] = [];
  for (let p = desde; p <= hasta; p++) {
    try {
      const objetivo = p === 1 ? BASE : `${BASE}/p${p}`;
      const res = await fetch(objetivo, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-PA,es;q=0.9',
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) { errores.push(`p${p}: http ${res.status}`); continue; }
      const filas = parsearPagina(await res.text(), p);
      if (!filas.length) { errores.push(`p${p}: 0 tarjetas parseadas`); continue; }
      const ins = await fetch(`${base}/rest/v1/ph_directorio?on_conflict=slug`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify(filas.map((f) => ({ ...f, updated_at: new Date().toISOString() }))),
        signal: AbortSignal.timeout(15000),
      });
      if (!ins.ok) { errores.push(`p${p}: upsert ${ins.status} ${(await ins.text()).slice(0, 120)}`); continue; }
      paginasOk++; filasTotal += filas.length;
    } catch (e) {
      errores.push(`p${p}: ${String(e).slice(0, 120)}`);
    }
    // Pausa corta entre páginas: 207 GETs a ritmo humano, no ráfaga.
    if (p < hasta) await new Promise((r) => setTimeout(r, 400));
  }
  return json({ ok: errores.length === 0, rango: `${desde}-${hasta}`, paginas_ok: paginasOk, filas: filasTotal, errores: errores.slice(0, 10) });
});
