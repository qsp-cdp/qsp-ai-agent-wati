// Centinela de la base de conocimiento de impresoras.
//
// EL PROBLEMA QUE RESUELVE: durante meses la tabla tuvo velocidades de dos estándares distintos
// mezcladas, fichas con la descripción de otro modelo y campos vacíos — y nada lo dijo. Se descubrió
// a mano, producto por producto. Un catálogo que cambia (equipos nuevos, modelos que salen, títulos
// que alguien edita) vuelve a desalinearse solo; la única defensa que aguanta el paso del tiempo es
// algo que MIRE y AVISE sin que nadie se acuerde de mirar.
//
// Compara el catálogo vivo de Shopify contra `impresoras_specs` y reporta nueve cosas. OJO con el
// alcance de cada una: las de IMPRESORAS miran solo impresoras, y las de NÚMERO DE PARTE miran el
// catálogo entero, repuestos incluidos (Google Shopping los indexa igual).
//   1. nuevos           — impresora en la tienda que el bot NO conoce (no la va a recomendar jamás)
//   2. retirados        — fila cuya impresora ya no está activa en la tienda
//   3. titulo_vs_ficha  — el título anuncia una velocidad distinta a la de la ficha CON FUENTE.
//                         Es el chequeo estrella: es exactamente el caso de la L5590, cuyo título
//                         decía 33 ppm cuando Epson dice 30 (borrador) y 15 (ISO).
//   4. mpn_duplicado    — dos productos activos con el mismo número de parte
//   5. sin_mpn          — producto activo sin número de parte
//   6. mpn_vs_sku       — el metacampo `mpn` no coincide con el SKU de la variante. El SKU es el
//                         número que el equipo mantiene de verdad; el `mpn` es una copia que se
//                         desincroniza sola. Ver el comentario largo junto al cálculo.
//   7. mal_clasificados — consumibles y accesorios tipados como IMPRESORA en Shopify (no los que ya
//                         están tipados como repuesto: esos salen en `fuera_de_alcance`)
//   8. sin_fuente       — filas sin `fuente_url`: el dato existe pero nadie puede auditarlo
//   9. fuente_vieja     — fichas leídas hace más de 18 meses (los fabricantes las actualizan)
//
// No corrige nada por su cuenta: reporta. Corregir specs sin leer la fuente es como llegamos aquí.
import { logJob } from '../_shared/db.ts';

const VERSION = 'v4-specs-centinela-dos-alcances';
const KEY = 'centinela-8k4p1n6r';
const MESES_PARA_REVISAR_FUENTE = 18;

const SHOPIFY_TOKEN = (Deno.env.get('SHOPIFY_ADMIN_TOKEN') ?? '').trim();
const SHOPIFY_BASE = (Deno.env.get('SHOPIFY_ADMIN_API_BASE') ?? '').trim().replace(/\/$/, '');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

// Un repuesto TIPADO COMO IMPRESORA sí es un problema de catálogo: se cuela en los filtros de la
// tienda y el cliente lo ve entre las impresoras. Se detecta por el nombre y se separa en su propia
// lista — no se descarta, porque ocultarlo volvería a la costumbre de que los datos raros desaparezcan
// sin que nadie los vea, que es de donde venimos.
//
// Al 25-ago esta lista quedó en CERO, y eso vale explicarlo: las 35 entradas que traía eran repuestos
// tipados correctamente ("Partes de Impresora") que el comodín de la consulta arrastraba. O sea nunca
// hubo 35 productos mal clasificados; había un filtro demasiado ancho. Ver RE_TIPO_ACCESORIO.
const RE_ACCESORIO =
  /^(bandeja|pedestal|bater[ií]a|soporte|alimentador|kit|cable|tapa|rodillo|fusor|correa|caja de mantenimiento|cartucho de mantenimiento|tambor|colector|conjunto|interfaz|unidad de imagen|revelador)\b/i;

// El filtro de la consulta es `product_type:Impresora*`, y ese comodín casa con más de lo que dice:
// "Partes de Impresora" y "Accesorios para Impresoras" entran igual. Esos productos NO están mal
// clasificados — su tipo es el correcto — simplemente no son de este barrido.
//
// Sin esto pasaban dos cosas malas: una bandeja de papel titulada "Impresora  Bandeja alimentadora de
// 550 hojas (CF404A)" se reportaba como `nuevos`, o sea "una impresora que el bot no conoce" (y no es
// una impresora); y los que sí traían nombre de repuesto engordaban `mal_clasificados`, que debería
// listar SOLO lo que de verdad está mal tipado. Con 35 entradas, esa lista no se revisa.
//
// Va por coincidencia EXACTA y no por palabras sueltas. Los tipos reales de la tienda son
// "Impresoras de Tinta", "Impresoras Laser", "Impresoras Termicas", "Impresora de Matriz",
// "Impresora de Etiquetas", "Impresora fotográfica", "Impresora Sublimacion" y "Plotters"; un regex
// laxo con palabras como "cartucho" o "papel" podría tragarse un tipo nuevo de impresora sin avisar.
// Si aparece una categoría de accesorio nueva, cae en `nuevos` y se ve — que es lo que se quiere.
const RE_TIPO_ACCESORIO = /^(partes de impresoras?|accesorios? para impresoras?)$/i;

interface ProductoShopify {
  handle: string;
  title: string;
  productType: string;
  mpn?: { value: string } | null;
  variants?: { nodes: { sku: string | null }[] };
}

async function impresorasDeLaTienda(): Promise<ProductoShopify[]> {
  const out: ProductoShopify[] = [];
  let cursor: string | null = null;
  // Tope de 5 páginas (1.250 productos): el catálogo de impresoras es de ~90, así que si alguna vez
  // se topa es señal de que el filtro dejó de filtrar, no de que falten datos.
  for (let pagina = 0; pagina < 5; pagina++) {
    const query = `query($after:String){
      products(first:250, after:$after, query:"status:active AND (product_type:Impresora* OR product_type:Plotter*)"){
        edges{ node{ handle title productType variants(first:1){ nodes{ sku } } mpn: metafield(namespace:"mm-google-shopping", key:"mpn"){ value } } }
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

// Los títulos rematan con "| 33 ppm Negro / 20 ppm Color", "| 40 ppm" o "| 35/33 ppm". Se lee el
// primer número como negro y el segundo como color SOLO cuando el título los etiqueta; sin etiqueta no
// se adivina cuál es cuál, y el par se devuelve como par para que quien compara decida.
function ppmDelTitulo(titulo: string): { negro?: number; color?: number; par?: [number, number] } {
  const out: { negro?: number; color?: number; par?: [number, number] } = {};

  // PAR PEGADO — "35/33 ppm", "27/23 ppm". Es AMBIGUO y hay que tratarlo como tal, porque los
  // fabricantes usan el mismo formato para dos cosas distintas:
  //   · Brother lo usa como negro/color.
  //   · Lexmark lo usa como carta/A4 — las dos cifras son del negro. Su propia ficha dice
  //     "up to 35/33 ppm on letter/A4 paper".
  // Antes esto se leía mal dos veces: el regex de abajo solo alcanza el número pegado a "ppm", así que
  // de "35/33 ppm" sacaba 33 y lo reportaba como "33 negro" — el número más bajo, y con la etiqueta
  // equivocada. Eso levantó una falsa alarma en la CX532adwe, cuyo título en realidad está bien.
  const mPar = titulo.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*ppm/i);
  if (mPar) {
    out.par = [Number(mPar[1].replace(',', '.')), Number(mPar[2].replace(',', '.'))];
  }

  // El caso etiquetado ("30 ppm negro / 26 ppm color") NO cae en el par de arriba, porque lleva un
  // "ppm" entre los dos números. Ese sí se puede leer sin ambigüedad.
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
  // "| 40 ppm" a secas, en una monocromática, es la velocidad en negro. No aplica si hubo par: ahí ese
  // número suelto es la mitad derecha del par, no una cifra por su cuenta.
  if (!out.par && out.negro === undefined && sinEtiqueta !== undefined && out.color === undefined) {
    out.negro = sinEtiqueta;
  }
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

  // DOS ALCANCES DISTINTOS, y confundirlos cuesta chequeos:
  //
  //   `tienda`  — solo impresoras. Es contra lo que se comparan `impresoras_specs` y los títulos:
  //               un repuesto no tiene fila en la tabla ni velocidad que contradecir.
  //   `catalogo` — todo lo que devolvió la consulta, repuestos incluidos. Es el alcance de los
  //               chequeos de NÚMERO DE PARTE, porque Google Shopping y los catálogos sindicados
  //               indexan el catálogo entero: un MPN repetido en un tóner hace el mismo daño que en
  //               una impresora.
  //
  // Al separarlos por primera vez se me fue justo eso: filtré una sola lista y `mpn_vs_sku` cayó de 2
  // a 0 en la misma corrida — los dos hallazgos reales (los SKU con la marca pegada, `EPSON
  // B12B808441` y `HP RM1-3717-020`) están en productos tipo "Partes de Impresora".
  const catalogo = tienda;
  const fuera_de_alcance = catalogo.filter((p) => RE_TIPO_ACCESORIO.test(p.productType)).length;
  tienda = catalogo.filter((p) => !RE_TIPO_ACCESORIO.test(p.productType));

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

  // Solo se comparan las filas CON FUENTE (`fuente_url`), no las marcadas `verificado`. Es lo que hace
  // el código desde el principio, pero este comentario decía "verificadas" y confundía: son cosas
  // distintas. `verificado` significa que un humano que conoce el equipo lo repasó; `fuente_url`
  // significa que la cifra salió de un documento del fabricante que se puede volver a leer.
  //
  // Para ESTE chequeo manda la fuente. Si la ficha oficial dice una cosa y el título de la tienda dice
  // otra, el equivocado es el título — que un humano lo haya repasado o no, no cambia eso. Y gatillar
  // por `verificado` dejaba el chequeo casi ciego: al 25-ago cubre 85 filas en vez de las ~20 que
  // tenían el visto bueno humano.
  //
  // En una fila SIN fuente sí se calla, y ahí el razonamiento original se sostiene: no se sabe cuál de
  // los dos está mal, y avisar de eso sería ruido.
  const titulo_vs_ficha: unknown[] = [];
  for (const p of tienda) {
    const fila = porHandle.get(p.handle);
    if (!fila?.fuente_url) continue;
    const t = ppmDelTitulo(p.title);
    const n = num(fila.ppm_negro), c = num(fila.ppm_color);
    const cerca = (a: number, b: number) => Math.abs(a - b) <= 0.5;

    const choqueNegro = t.negro !== undefined && n !== undefined && !cerca(t.negro, n);
    const choqueColor = t.color !== undefined && c !== undefined && !cerca(t.color, c);

    // Par ambiguo ("35/33 ppm"): se avisa solo si NINGUNO de los dos números cuadra con el negro de la
    // ficha. Sea cual sea la convención del fabricante, uno de los dos ES la velocidad en negro — en
    // carta/A4 lo son las dos, y en negro/color lo es la primera. Si ninguno cuadra, el título anuncia
    // algo que la ficha no respalda, y ahí sí hay que mirarlo.
    const choquePar = t.par !== undefined && n !== undefined && !cerca(t.par[0], n) && !cerca(t.par[1], n);

    if (choqueNegro || choqueColor || choquePar) {
      titulo_vs_ficha.push({
        modelo: fila.modelo,
        handle: p.handle,
        titulo_anuncia: t.par
          ? `${t.par[0]}/${t.par[1]} (el título no dice si es negro/color o carta/A4)`
          : [t.negro !== undefined ? `${t.negro} negro` : null, t.color !== undefined ? `${t.color} color` : null].filter(Boolean).join(' / '),
        ficha_verificada: [n !== undefined ? `${n} negro` : null, c !== undefined ? `${c} color` : null].filter(Boolean).join(' / '),
        fuente: fila.fuente_url,
      });
    }
  }

  // NÚMERO DE PARTE (MPN) — la llave con la que indexa CUALQUIER catálogo sindicado (1WorldSync,
  // Icecat, Syndigo) y también Google Shopping. Un MPN repetido en dos productos distintos hace que el
  // feed le entregue a uno el contenido del otro: specs, fotos y todo. Caso encontrado el 22-ago: la
  // HP Smart Tank 530 y la 580 comparten `4SB24A#AKY`, y el número de parte real de la 580 es 1F3Y2A
  // (aparece en el nombre de su propia ficha técnica). Sin esto sano, sindicar contenido empeora el
  // catálogo en vez de arreglarlo.
  //
  // Van sobre `catalogo`, no sobre `tienda`: los repuestos también se sindican.
  const porMpn = new Map<string, string[]>();
  for (const p of catalogo) {
    const mpn = String(p.mpn?.value ?? '').trim().toUpperCase();
    if (!mpn) continue;
    porMpn.set(mpn, [...(porMpn.get(mpn) ?? []), p.handle]);
  }
  const mpn_duplicado = [...porMpn.entries()]
    .filter(([, handles]) => handles.length > 1)
    .map(([mpn, handles]) => ({ mpn, handles }));
  const sin_mpn = catalogo
    .filter((p) => !RE_ACCESORIO.test(p.title) && !String(p.mpn?.value ?? '').trim())
    .map((p) => p.handle);

  // EL MPN DEBE SER EL SKU, y esta es la comprobación que más trabajo ahorra de todo el centinela.
  //
  // El 24-ago-2026 aprendimos que el campo SKU ya tenía el número de parte correcto en casi todo el
  // catálogo, mientras el metacampo `mpn` —una copia que nadie mantenía— arrastraba números viejos,
  // vacíos y repetidos. Se pasaron horas buscando en folletos de fabricante números que estaban a un
  // campo de distancia: la OfficeJet Pro 9130 y la imageRUNNER 1643i son los dos ejemplos caros.
  //
  // El SKU es el que el equipo mantiene de verdad, porque con él compran, venden y van a parear el
  // inventario contra Sage 50. Así que el MPN se deriva de él, y aquí solo se vigila que no se
  // separen otra vez. Es una regla que una máquina puede revisar sola, a diferencia de "¿este número
  // es el que publica el fabricante?", que necesita leer una ficha.
  //
  // Se comparan en crudo, sin normalizar mayúsculas ni sufijos: si el SKU dice `6QN36A#BGJ`, el MPN
  // dice `6QN36A#BGJ`. Normalizar aquí sería volver a tener dos versiones del mismo número, que es
  // exactamente el problema del que venimos.
  const mpn_vs_sku = catalogo
    .map((p) => ({
      handle: p.handle,
      sku: String(p.variants?.nodes?.[0]?.sku ?? '').trim(),
      mpn: String(p.mpn?.value ?? '').trim(),
    }))
    .filter((r) => r.sku && r.mpn !== r.sku);

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
    mpn_duplicado: mpn_duplicado.length,
    sin_mpn: sin_mpn.length,
    mpn_vs_sku: mpn_vs_sku.length,
    sin_fuente: sin_fuente.length,
    fuente_vieja: fuente_vieja.length,
    mal_clasificados: mal_clasificados.length,
    impresoras_en_tienda: tienda.length,
    productos_en_catalogo: catalogo.length,
    fuera_de_alcance,
    filas_en_tabla: tabla.length,
  };
  // "Limpio" mira solo lo que rompe al bot. Un consumible mal tipado en Shopify o una fila sin fuente
  // son deuda a ordenar, no una alarma que valga la pena disparar cada semana.
  const limpio = nuevos.length === 0 && retirados.length === 0 && titulo_vs_ficha.length === 0 &&
    mpn_duplicado.length === 0 && mpn_vs_sku.length === 0;
  await logJob('specs-centinela', 'revision', limpio, resumen);

  return json({
    ok: true,
    version: VERSION,
    resumen,
    // Las listas van completas: el valor de esto es poder actuar sin tener que ir a buscar el detalle.
    detalle: { nuevos, retirados, titulo_vs_ficha, mpn_duplicado, mpn_vs_sku, sin_mpn, mal_clasificados, sin_fuente, fuente_vieja },
  });
});
