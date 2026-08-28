// Extractor de texto de fichas técnicas en PDF.
//
// POR QUÉ EXISTE: los datos duros de las impresoras (velocidad ISO, dúplex automático, rendimiento,
// códigos de consumible) no están en la ficha de la tienda, ni en los metacampos, ni en el HTML de la
// página oficial del fabricante — Epson y compañía cargan esa tabla por JS. Sí están en el PDF de la
// ficha técnica, y la tienda ya hospeda ~90 de esos PDF. Un PDF es binario, así que pg_net (que
// devuelve `content` como texto) no sirve para bajarlo: hace falta código. Esto es ese código.
//
// Deja el texto en `public.fichas_pdf` para consultarlo después con SQL sin volver a descargar, y para
// que cada dato que se escriba en los metacampos tenga su URL de origen — la trazabilidad es el punto:
// todo esto nació de no confiar en los datos que ya estaban.
//
//   POST /ficha-pdf?key=<KEY>   { "url": "https://…/algo.pdf", "modelo": "Epson EcoTank L5590" }
//   GET  /ficha-pdf?key=<KEY>   → healthcheck con la versión
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';

const VERSION = 'v2-ficha-pdf-texto-legible';

// La llave vive en un SECRETO de la función, nunca en el código: estuvo escrita aquí (y por tanto en
// git), y este endpoint ESCRIBE en `fichas_pdf` — la base de conocimiento de specs que el bot cita como
// fuente auditable. Con la llave versionada, cualquiera con acceso al repo podía sembrarle una ficha
// falsa a un modelo real, y toda la trazabilidad que esta tabla existe para dar valía cero.
// FAIL-CLOSED a propósito (el `!KEY` del guard): si el secreto falta, la función rechaza TODO en vez de
// quedar abierta. Sin ese chequeo, un secreto ausente dejaría KEY en '' y un `?key=` vacío pasaría —
// el guard se convertiría en puerta justo cuando peor está configurada la función.
const KEY = (Deno.env.get('FICHA_PDF_KEY') ?? '').trim();

// Solo fabricantes y el CDN de la propia tienda. Sin esto, cualquiera con la llave podría usar la
// función como proxy hacia adentro de la red (SSRF); el allowlist la deja siendo lo que dice ser.
// Incluye los dominios POR PAÍS de Latinoamérica a propósito: los fabricantes no publican la ficha en
// español desde el .com global, y el chequeo es por sufijo — 'canon.com' NO cubre a 'canon.com.mx'.
const DOMINIOS_PERMITIDOS = [
  'cdn.shopify.com',
  'epson.com', 'latin.epson.com', 'mediaserver.goepson.com', 'files.support.epson.com',
  'epson.com.mx', 'epson.com.co', 'epson.com.pe', 'epson.com.ar', 'epson.com.pa', 'epson.com.cl',
  'hp.com', 'h20195.www2.hp.com', 'ssl.www8.hp.com', 'hp.com.mx',
  'canon.com', 'downloads.canon.com', 'cla.canon.com', 'canonlatinamerica.com', 'canon.com.mx',
  'brother.com', 'download.brother.com', 'brother.com.mx', 'brother.com.pa',
  'lexmark.com',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function dominioPermitido(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return DOMINIOS_PERMITIDOS.some((d) => h === d || h.endsWith('.' + d));
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  if (!KEY || (params.get('key') ?? '').trim() !== KEY) return json({ error: 'Llave inválida' }, 401);
  if (req.method === 'GET') return json({ ok: true, version: VERSION });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  let body: { url?: string; modelo?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo no es JSON' }, 400);
  }

  let objetivo: URL;
  try {
    objetivo = new URL(String(body.url ?? ''));
  } catch {
    return json({ error: 'Falta o es inválida la url' }, 400);
  }
  if (objetivo.protocol !== 'https:') return json({ error: 'Solo https' }, 400);
  if (!dominioPermitido(objetivo)) return json({ error: `Dominio no permitido: ${objetivo.hostname}` }, 403);

  let bytes: Uint8Array;
  try {
    const res = await fetch(objetivo.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QSP-fichas/1.0)' },
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return json({ error: `El origen respondió ${res.status}` }, 502);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    return json({ error: `No se pudo descargar: ${String(err).slice(0, 200)}` }, 502);
  }

  // Un HTML de error servido con 200 se detecta aquí en vez de morir dentro del parser.
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    return json({ error: 'El archivo no es un PDF', bytes: bytes.length }, 415);
  }

  let texto = '';
  let paginas = 0;
  try {
    const pdf = await getDocumentProxy(bytes);
    const r = await extractText(pdf, { mergePages: true });
    paginas = r.totalPages;
    texto = String(r.text ?? '').replace(/[ \t]+/g, ' ').trim();
  } catch (err) {
    return json({ error: `No se pudo extraer el texto: ${String(err).slice(0, 200)}` }, 422);
  }
  if (!texto) return json({ error: 'PDF sin texto (¿escaneado?), haría falta OCR', paginas }, 422);

  // TEXTO ILEGIBLE — más peligroso que un PDF escaneado, porque este SÍ pasa el filtro de arriba.
  //
  // Caso real: la ficha de la Epson DFX-9000 usa una codificación no estándar (fuente incrustada con
  // cmap propio), y unpdf devuelve los bytes tal cual: 'Beneficios Principales' sale bien pero la tabla
  // de velocidad sale como ")VYYHKVY\u0003\S[YH]LSVJPKHK" — un cifrado por desplazamiento. El chequeo
  // de `!texto` no lo atrapa: hay texto, solo que no significa nada.
  //
  // Por qué importa más de lo que parece: esta tabla existe para que cada dato de `impresoras_specs`
  // tenga una fuente AUDITABLE. Una ficha ilegible guardada como fuente es peor que no tener fuente —
  // la fila queda con su `fuente_url` puesto, aparenta estar respaldada, y nadie puede comprobar nada.
  //
  // Se mide por caracteres de control (los \u0003 que separan cada glifo mal mapeado): un PDF sano trae
  // cero o alguno suelto; el de la DFX-9000 trae 991 en 6.639 caracteres (14,9%). El umbral de 2% deja
  // pasar el ruido normal y corta la basura sin ambigüedad.
  const control = (texto.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) ?? []).length;
  const pctControl = (control / texto.length) * 100;
  if (pctControl > 2) {
    return json({
      error: 'El texto extraído está ilegible (codificación no estándar en el PDF): no sirve como fuente auditable',
      paginas, caracteres: texto.length, pct_control: Math.round(pctControl * 10) / 10,
      muestra: texto.slice(0, 160),
    }, 422);
  }

  const guardado = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/fichas_pdf?on_conflict=url`, {
    method: 'POST',
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      url: objetivo.toString(),
      modelo: body.modelo ?? null,
      paginas,
      bytes: bytes.length,
      texto,
      extraido_en: new Date().toISOString(),
    }),
  });

  return json({
    ok: true,
    version: VERSION,
    url: objetivo.toString(),
    paginas,
    bytes: bytes.length,
    caracteres: texto.length,
    guardado: guardado.ok ? true : `fallo ${guardado.status}: ${(await guardado.text()).slice(0, 200)}`,
    // El texto completo vive en `fichas_pdf`; aquí solo va una muestra para confirmar de un vistazo.
    muestra: texto.slice(0, 500),
  });
});
