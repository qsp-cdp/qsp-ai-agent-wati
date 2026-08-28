// === catalogo-sync v1 — la sincronía de la RÉPLICA DEL CATÁLOGO (fase 1 del "mapa abierto") ===
//
// Mantiene la tabla `catalogo` como espejo del catálogo de Shopify — incluidos AGOTADOS y borradores,
// que es justo lo que el motor de búsqueda de Shopify no muestra (caso C9344, 28-ago: una caja de
// mantenimiento agotada se volvió "no lo tenemos" para un cliente que esperaba reposición).
//
// Dos caminos, tres patas (el diseño exige las tres — la lección número uno del proyecto es la deriva):
//   1. POST  ← webhooks products/create|update|delete de Shopify, firmados con HMAC (mismo secreto y
//      mismo patrón fail-closed de shopify-webhook; el rechazo se REGISTRA — un rechazo sin huella es
//      un producto que desaparece, la lección del pedido 8888).
//   2. GET ?reconciliar=1&key=  ← pg_cron nocturno: recorrido COMPLETO por Admin GraphQL. Los webhooks
//      se pierden (lección vivida); la reconciliación convierte "casi sincronizado" en "sincronizado".
//      Lo no visto en el recorrido pasa a status 'archivado_local' por watermark de `sincronizado_at`.
//   3. La telemetría (`catalogo_sync` / `catalogo_reconciliado` en job_log) — la pata 3 (frescura en el
//      resumen del watchdog) se cablea en el siguiente commit, leyendo estas mismas filas.
//
// LÍNEA ROJA (del diseño): el precio que se guarda aquí FILTRA y ORIENTA; jamás cotiza. La cotización
// y el stock salen en vivo de buscar_producto. Por eso esta tabla NO guarda inventario: un número de
// stock replicado envejece en minutos y un bot "no inventar" no puede citarlo.

import { logJob } from '../_shared/db.ts';

const SB_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SB_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
// Guard del disparo de reconciliación (cron/manual). Fail-closed, patrón watchdog: sin secreto no se
// atiende — un guard que "se abre solo" cuando falta la config fue el hallazgo P2-c de la auditoría.
const SYNC_KEY = (Deno.env.get('CATALOGO_SYNC_KEY') ?? '').trim();
const ADMIN_TOKEN = (Deno.env.get('SHOPIFY_ADMIN_TOKEN') ?? '').trim();
const ADMIN_BASE = (Deno.env.get('SHOPIFY_ADMIN_API_BASE') ?? '').trim();
const VERSION = 'catalogo-sync-v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function rest(path: string): string { return `${SB_URL}/rest/v1${path}`; }
function svc(): Record<string, string> {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
}

// Mismo verificador de shopify-webhook (v68): devuelve POR QUÉ falló, porque los tres motivos piden
// acciones distintas — sin secreto es catástrofe de config, sin cabecera es ruido de internet, y
// firma que no cuadra es un secreto desincronizado que hay que arreglar en minutos… si uno se entera.
type MotivoHmac = 'ok' | 'sin_secreto' | 'sin_cabecera' | 'no_cuadra';
async function verifyShopifyHmac(rawBody: string, hmacHeader: string): Promise<MotivoHmac> {
  const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET');
  if (!secret) return 'sin_secreto';
  if (!hmacHeader) return 'sin_cabecera';
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const digest = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (digest.length !== hmacHeader.length) return 'no_cuadra';
  let diff = 0;
  for (let i = 0; i < digest.length; i++) diff |= digest.charCodeAt(i) ^ hmacHeader.charCodeAt(i);
  return diff === 0 ? 'ok' : 'no_cuadra';
}

// Body HTML → texto plano recortado. Suficiente para el FTS; el copiloto tiene su limpiarHtml más
// fino, pero esta función no puede importarlo (copilot-webhook no exporta y no importa _shared a
// propósito) y para indexar alcanza con quitar tags y colapsar espacios.
function sinHtml(html: unknown): string {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g, (m) =>
      ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' }[m] ?? ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// Payload del webhook REST de Shopify → fila de `catalogo`. Pura: se extrae y se prueba en la suite
// (tests/test_catalogo_sync.mjs). Los tags del webhook llegan como UN string separado por comas.
function normalizarProducto(p: any): Record<string, unknown> | null {
  const id = Number(p?.id);
  const handle = String(p?.handle ?? '').trim();
  const titulo = String(p?.title ?? '').trim();
  if (!Number.isFinite(id) || id <= 0 || !handle || !titulo) return null;
  const variantes = Array.isArray(p?.variants) ? p.variants : [];
  const precios = variantes.map((v: any) => parseFloat(String(v?.price ?? ''))).filter((n: number) => isFinite(n) && n > 0);
  const comparados = variantes.map((v: any) => parseFloat(String(v?.compare_at_price ?? ''))).filter((n: number) => isFinite(n) && n > 0);
  const tags = String(p?.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean);
  return {
    id,
    handle,
    sku: String(variantes[0]?.sku ?? '').trim() || null,
    titulo,
    marca: String(p?.vendor ?? '').trim() || null,
    tipo: String(p?.product_type ?? '').trim() || null,
    tags,
    status: String(p?.status ?? 'active').trim().toLowerCase(),
    precio_usd: precios.length ? Math.min(...precios) : null,
    precio_comparado_usd: comparados.length ? Math.min(...comparados) : null,
    descripcion: sinHtml(p?.body_html).slice(0, 3000) || null,
    variantes: variantes.slice(0, 25).map((v: any) => ({
      variant_id: Number(v?.id) || null,
      sku: String(v?.sku ?? '').trim() || null,
      precio: parseFloat(String(v?.price ?? '')) || null,
    })),
    imagen_url: String(p?.image?.src ?? '').trim() || null,
    shopify_updated_at: p?.updated_at ?? null,
    sincronizado_at: new Date().toISOString(),
  };
}

async function upsertFilas(filas: Array<Record<string, unknown>>): Promise<void> {
  if (!filas.length) return;
  const res = await fetch(rest('/catalogo?on_conflict=id'), {
    method: 'POST',
    headers: { ...svc(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filas),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`upsert_catalogo ${res.status}: ${(await res.text()).slice(0, 150)}`);
}

// === Reconciliación nocturna: el catálogo COMPLETO por Admin GraphQL, paginado. ===
// `inicio` es el watermark: todo lo upserteado en esta pasada lleva sincronizado_at >= inicio; al
// final, lo que quedó por debajo es un producto que Shopify YA NO devuelve → 'archivado_local'
// (soft: auditable y reversible, nunca delete).
async function reconciliar(): Promise<Record<string, unknown>> {
  if (!ADMIN_TOKEN || !ADMIN_BASE) return { error: 'faltan_secretos_admin' };
  const t0 = Date.now();
  const inicio = new Date().toISOString();
  const deadline = t0 + 110_000; // margen contra el wall-clock del runtime; si no alcanza, se registra parcial
  let cursor: string | null = null;
  let paginas = 0, productos = 0, parcial = false;

  do {
    if (Date.now() > deadline) { parcial = true; break; }
    const q = `query($after: String) {
      products(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          legacyResourceId title handle vendor productType tags status updatedAt
          description(truncateAt: 3000)
          featuredImage { url }
          variants(first: 25) { nodes { legacyResourceId sku price compareAtPrice } }
        }
      }
    }`;
    const res = await fetch(`${ADMIN_BASE}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, variables: { after: cursor } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`graphql_http_${res.status}`);
    const j = await res.json();
    if (j.errors?.length) throw new Error(`graphql: ${JSON.stringify(j.errors).slice(0, 150)}`);
    const page = j?.data?.products;
    const filas = (page?.nodes ?? []).map((n: any) => normalizarProducto({
      id: n.legacyResourceId, title: n.title, handle: n.handle, vendor: n.vendor,
      product_type: n.productType,
      // GraphQL da los tags como ARRAY; normalizarProducto espera el string del webhook → se re-une.
      tags: (n.tags ?? []).join(', '),
      status: String(n.status ?? '').toLowerCase(),
      updated_at: n.updatedAt,
      body_html: n.description,           // ya viene sin HTML desde GraphQL; sinHtml es no-op inocuo
      image: { src: n.featuredImage?.url },
      variants: (n.variants?.nodes ?? []).map((v: any) => ({
        id: v.legacyResourceId, sku: v.sku, price: v.price, compare_at_price: v.compareAtPrice,
      })),
    })).filter(Boolean) as Array<Record<string, unknown>>;
    await upsertFilas(filas);
    productos += filas.length;
    paginas++;
    cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  // Archivado por watermark — SOLO si el recorrido fue completo: archivar con una pasada parcial
  // marcaría como desaparecido medio catálogo que simplemente no se alcanzó a visitar.
  let archivados = 0;
  if (!parcial) {
    const res = await fetch(
      rest(`/catalogo?sincronizado_at=lt.${encodeURIComponent(inicio)}&status=neq.archivado_local&select=id`),
      {
        method: 'PATCH',
        headers: { ...svc(), Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'archivado_local' }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (res.ok) archivados = ((await res.json()) as unknown[]).length;
  }

  const resumen = { productos, paginas, archivados, parcial, ms: Date.now() - t0 };
  await logJob('catalogo-sync', 'catalogo_reconciliado', !parcial, resumen);
  return resumen;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    // Reconciliación manual/cron — gated por CATALOGO_SYNC_KEY (fail-closed).
    if (url.searchParams.get('reconciliar') === '1') {
      if (!SYNC_KEY || url.searchParams.get('key') !== SYNC_KEY) return json({ error: 'no autorizado' }, 401);
      try {
        return json(await reconciliar());
      } catch (e) {
        await logJob('catalogo-sync', 'catalogo_reconciliado', false, { error: String(e).slice(0, 200) });
        return json({ error: String(e).slice(0, 200) }, 500);
      }
    }
    // Healthcheck (sin key, como el resto de la casa: config sí, secretos no).
    return json({
      status: 'ok', function: 'catalogo-sync', version: VERSION,
      hmac_configurado: !!Deno.env.get('SHOPIFY_WEBHOOK_SECRET'),
      sync_key_configurada: !!SYNC_KEY,
      admin_configurado: !!(ADMIN_TOKEN && ADMIN_BASE),
      ts: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const rawBody = await req.text();
  const motivo = await verifyShopifyHmac(rawBody, req.headers.get('X-Shopify-Hmac-Sha256') ?? '');
  if (motivo !== 'ok') {
    // El mismo principio de v68: un rechazo sin huella es un producto que desaparece de la réplica
    // sin que nadie sepa por qué. Nada de cuerpo completo en el log.
    let idProducto: string | null = null;
    try { const p = JSON.parse(rawBody); idProducto = String(p?.id ?? '') || null; } catch { /* no era JSON */ }
    await logJob('catalogo-sync', 'hmac_rechazado', false, {
      motivo, producto: idProducto, tema: req.headers.get('X-Shopify-Topic'), bytes: rawBody.length,
    });
    return json({ error: 'Firma HMAC inválida' }, 401);
  }

  const tema = String(req.headers.get('X-Shopify-Topic') ?? '');
  try {
    const p = JSON.parse(rawBody);

    if (tema === 'products/delete') {
      // El payload del delete trae SOLO {id}: no hay handle ni título que upsertear. Soft-archive.
      const id = Number(p?.id);
      if (Number.isFinite(id) && id > 0) {
        await fetch(rest(`/catalogo?id=eq.${id}`), {
          method: 'PATCH', headers: { ...svc(), Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'archivado_local', sincronizado_at: new Date().toISOString() }),
          signal: AbortSignal.timeout(10000),
        });
      }
      await logJob('catalogo-sync', 'catalogo_sync', true, { tema, id: p?.id ?? null });
      return json({ ok: true });
    }

    // products/create y products/update — y cualquier tema products/* futuro: upsert es idempotente.
    const fila = normalizarProducto(p);
    if (!fila) {
      await logJob('catalogo-sync', 'catalogo_sync', false, { tema, error: 'payload_incompleto', id: p?.id ?? null });
      return json({ ok: false, error: 'payload_incompleto' }, 200); // 200: que Shopify no reintente un payload que nunca va a validar
    }
    await upsertFilas([fila]);
    await logJob('catalogo-sync', 'catalogo_sync', true, { tema, id: fila.id, titulo: String(fila.titulo).slice(0, 60) });
    return json({ ok: true });
  } catch (e) {
    await logJob('catalogo-sync', 'catalogo_sync', false, { tema, error: String(e).slice(0, 200) });
    // 500: esto SÍ debe reintentarlo Shopify (fallo nuestro transitorio, no del payload).
    return json({ error: 'interno' }, 500);
  }
});
