// Centinela de la base de conocimiento de impresoras.
//
// EL PROBLEMA QUE RESUELVE: durante meses la tabla tuvo velocidades de dos estándares distintos
// mezcladas, fichas con la descripción de otro modelo y campos vacíos — y nada lo dijo. Se descubrió
// a mano, producto por producto. Un catálogo que cambia (equipos nuevos, modelos que salen, títulos
// que alguien edita) vuelve a desalinearse solo; la única defensa que aguanta el paso del tiempo es
// algo que MIRE y AVISE sin que nadie se acuerde de mirar.
//
// Compara el catálogo vivo de Shopify contra `impresoras_specs` y reporta cinco cosas:
//   1. nuevos          — impresora en la tienda que el bot NO conoce (no la va a recomendar jamás)
//   2. retirados       — fila cuya impresora ya no está activa en la tienda
//   3. titulo_vs_ficha — el título anuncia una velocidad distinta a la de la ficha VERIFICADA.
//                        Es el chequeo estrella: es exactamente el caso de la L5590, cuyo título
//                        decía 33 ppm cuando Epson dice 30 (borrador) y 15 (ISO).
//   4. sin_fuente      — filas sin `fuente_url`: el dato existe pero nadie puede auditarlo
//   5. fuente_vieja    — fichas leídas hace más de 18 meses (los fabricantes las actualizan)
//
// No corrige nada por su cuenta: reporta. Corregir specs sin leer la fuente es como llegamos aquí.
import { logJob } from '../_shared/db.ts';

const VERSION = 'v1-specs-centinela';
const KEY = 'centinela-8k4p1n6r';
const MESES_PARA_REVISAR_FUENTE = 18;

const SHOPIFY_TOKEN = (Deno.env.get('SHOPIFY_ADMIN_TOKEN') ?? '').trim();
const SHOPIFY_BASE = (Deno.env.get('SHOPIFY_ADMIN_API_BASE') ?? '').trim().replace(/\/$/, '');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

// El tipo de producto de una impresora en esta tienda empieza por "Impresora"/"Plotter", pero hay
// CONSUMIBLES Y ACCESORIOS con ese mismo tipo: la primera corrida encontró 24 (cajas de mantenimiento
// Epson, cartuchos de mantenimiento Canon, tambores Brother, colectores de tinta, bandejas, interfaces
// de red). No es un problema del centinela sino de la clasificación en Shopify, y también afecta a los
// filtros de la tienda.
//
// No se DESCARTAN: se separan en su propia lista. Ocultarlos volvería a la costumbre de que los datos
// raros desaparezcan sin que nadie los vea — que es de donde venimos.
const RE_ACCESORIO =
  /^(bandeja|pedestal|bater[ií]a|soporte|alimentador|kit|cable|tapa|rodillo|fusor|correa|caja de mantenimiento|cartucho de mantenimiento|tambor|colector|conjunto|interfaz|unidad de imagen|revelador)\b/i;

interface ProductoShopify { handle: string; title: string; productType: string }

async function impresorasDeLaTienda(): Promise<ProductoShopify[]> {
  const out: ProductoShopify[] = [];
  let cursor: string | null = null;
  // Tope de 5 páginas (1.250 productos): el catálogo de impresoras es de ~90, así que si alguna vez
  // se topa es señal de que el filtro dejó de filtrar, no de que falten datos.
  for (let pagina = 0; pagina < 5; pagina++) {
    const query = `query($after:String){
      products(first:250, after:$after, query:"status:active AND (product_type:Impresora* OR product_type:Plotter*)"){
        edges{ node{ handle title productType } }
        pageInfo{ hasNextPage endCursor }
      }
    }`;
    const r: Response = await fetch(`${SHOPIFY_BASE}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
      body: JSON.stringify({ query, variables: { after: cursor } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`Shopify respondió ${r.status}`);
    // Anotado a mano: sin el tipo explícito, `cursor` se reasigna desde esta respuesta y TypeScript
    // entra en una inferencia circular con la propia petición que lo usa.
    const j: any = await r.json();
    if (j?.errors?.length) throw new Error(`GraphQL: ${String(j.errors[0]?.message).slice(0, 150)}`);
    const p: any = j?.data?.products;
    for (const e of (p?.edges ?? [])) out.push(e.node as ProductoShopify);
    if (!p?.pageInfo?.hasNextPage) break;
    cursor = String(p.pageInfo.endCursor);
  }
  return out;
}

interface FilaSpec {
  handle: string | null; modelo: string;
  ppm_negro: string | null; ppm_color: string | null;
  fuente_url: string | null; fuente_fecha: string | null;
}

async function filasDeLaTabla(): Promise<FilaSpec[]> {
  const r = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/rest/v1/impresoras_specs?select=handle,modelo,ppm_negro,ppm_color,fuente_url,fuente_fecha`,
    {
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
      },
    },
  );
  if (!r.ok) throw new Error(`impresoras_specs respondió ${r.status}`);
  return await r.json();
}

// Los títulos rematan con "| 33 ppm Negro / 20 ppm Color" o "| 40 ppm". Se lee el primer número como
// negro y el segundo como color solo cuando el título los ETIQUETA; sin etiqueta no se adivina cuál es.
function ppmDelTitulo(titulo: string): { negro?: number; color?: number } {
  const out: { negro?: number; color?: number } = {};
  const re = /(\d+(?:[.,]\d+)?)\s*ppm(?:\s*(negro|color|b\/n|monocrom\w*))?/gi;
  let m: RegExpExecArray | null;
  let sinEtiqueta: number | undefined;
  while ((m = re.exec(titulo)) !== null) {
    const valor = Number(m[1].replace(',', '.'));
    const etiqueta = (m[2] ?? '').toLowerCase();
    if (/negro|b\/n|monocrom/.test(etiqueta)) out.negro ??= valor;
    else if (etiqueta === 'color') out.color ??= valor;
    else sinEtiqueta ??= valor;
  }
  // "| 40 ppm" a secas, en una monocromática, es la velocidad en negro.
  if (out.negro === undefined && sinEtiqueta !== undefined && out.color === undefined) out.negro = sinEtiqueta;
  return out;
}

const num = (s: string | null): number | undefined => {
  if (s == null) return undefined;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  if ((params.get('key') ?? '').trim() !== KEY) return json({ error: 'Llave inválida' }, 401);
  if (req.method === 'HEAD') return new Response(null, { status: 200 });
  if (!SHOPIFY_TOKEN || !SHOPIFY_BASE) {
    return json({ error: 'Faltan SHOPIFY_ADMIN_TOKEN / SHOPIFY_ADMIN_API_BASE' }, 500);
  }

  let tienda: ProductoShopify[];
  let tabla: FilaSpec[];
  try {
    [tienda, tabla] = await Promise.all([impresorasDeLaTienda(), filasDeLaTabla()]);
  } catch (err) {
    await logJob('specs-centinela', 'revision', false, { error: String(err).slice(0, 200) });
    return json({ error: String(err).slice(0, 300) }, 502);
  }

  const porHandle = new Map(tabla.filter((f) => f.handle).map((f) => [f.handle as string, f]));
  const handlesTienda = new Set(tienda.map((p) => p.handle));

  const faltantes = tienda.filter((p) => !porHandle.has(p.handle));
  const nuevos = faltantes
    .filter((p) => !RE_ACCESORIO.test(p.title))
    .map((p) => ({ handle: p.handle, titulo: p.title.slice(0, 120), tipo: p.productType }));
  // Consumibles y accesorios que en Shopify están tipados como impresora. No son trabajo para la tabla
  // del bot, pero sí para el catálogo: con ese tipo se cuelan en los filtros de la tienda.
  const mal_clasificados = faltantes
    .filter((p) => RE_ACCESORIO.test(p.title))
    .map((p) => ({ handle: p.handle, titulo: p.title.slice(0, 120), tipo: p.productType }));

  const retirados = tabla
    .filter((f) => f.handle && !handlesTienda.has(f.handle))
    .map((f) => ({ modelo: f.modelo, handle: f.handle }));

  // Solo se comparan las filas VERIFICADAS: ahí la ficha manda y un título que no cuadra es un error
  // del título. En una fila sin fuente no se sabe cuál de los dos está mal, y avisar de eso sería ruido.
  const titulo_vs_ficha: unknown[] = [];
  for (const p of tienda) {
    const fila = porHandle.get(p.handle);
    if (!fila?.fuente_url) continue;
    const t = ppmDelTitulo(p.title);
    const n = num(fila.ppm_negro), c = num(fila.ppm_color);
    const choqueNegro = t.negro !== undefined && n !== undefined && Math.abs(t.negro - n) > 0.5;
    const choqueColor = t.color !== undefined && c !== undefined && Math.abs(t.color - c) > 0.5;
    if (choqueNegro || choqueColor) {
      titulo_vs_ficha.push({
        modelo: fila.modelo,
        handle: p.handle,
        titulo_anuncia: [t.negro !== undefined ? `${t.negro} negro` : null, t.color !== undefined ? `${t.color} color` : null].filter(Boolean).join(' / '),
        ficha_verificada: [n !== undefined ? `${n} negro` : null, c !== undefined ? `${c} color` : null].filter(Boolean).join(' / '),
        fuente: fila.fuente_url,
      });
    }
  }

  const sin_fuente = tabla.filter((f) => !f.fuente_url).map((f) => f.modelo);

  const limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_PARA_REVISAR_FUENTE);
  const fuente_vieja = tabla
    .filter((f) => f.fuente_fecha && new Date(f.fuente_fecha) < limite)
    .map((f) => ({ modelo: f.modelo, leida: f.fuente_fecha }));

  const resumen = {
    nuevos: nuevos.length,
    retirados: retirados.length,
    titulo_vs_ficha: titulo_vs_ficha.length,
    sin_fuente: sin_fuente.length,
    fuente_vieja: fuente_vieja.length,
    mal_clasificados: mal_clasificados.length,
    impresoras_en_tienda: tienda.length,
    filas_en_tabla: tabla.length,
  };
  // "Limpio" mira solo lo que rompe al bot. Un consumible mal tipado en Shopify o una fila sin fuente
  // son deuda a ordenar, no una alarma que valga la pena disparar cada semana.
  const limpio = nuevos.length === 0 && retirados.length === 0 && titulo_vs_ficha.length === 0;
  await logJob('specs-centinela', 'revision', limpio, resumen);

  return json({
    ok: true,
    version: VERSION,
    resumen,
    // Las listas van completas: el valor de esto es poder actuar sin tener que ir a buscar el detalle.
    detalle: { nuevos, retirados, titulo_vs_ficha, mal_clasificados, sin_fuente, fuente_vieja },
  });
});
