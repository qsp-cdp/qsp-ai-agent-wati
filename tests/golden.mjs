// tests/golden.mjs — golden tests del copilot-webhook (v46).
// Extrae los REGEX y helpers puros del index.ts REAL (no copias que se desactualicen) y corre casos
// dorados. Así el deploy sigue siendo de UN solo archivo (el dashboard/Browse pega index.ts tal cual)
// y aun así hay una suite que corre antes de cada deploy:  node tests/golden.mjs
// Si la extracción falla (se renombró una const), el test truena fuerte — eso también es una señal.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "copilot-webhook", "index.ts"), "utf8");

// --- extracción ---------------------------------------------------------------------------------
function extraerConst(nombre) {
  // Caso 1: literal de una línea  →  const X = /.../i;
  const lit = src.match(new RegExp(`const ${nombre} = (\\/(?:[^\\/\\\\\\n]|\\\\.)+\\/[a-z]*);`));
  if (lit) return eval(lit[1]);
  // Caso 2: new RegExp([ ... ].join("|"), "i");  (multilínea)
  const ini = src.indexOf(`const ${nombre} = new RegExp([`);
  if (ini < 0) throw new Error(`no encontré la const ${nombre}`);
  const fin = src.indexOf(`].join("|"), "i");`, ini);
  if (fin < 0) throw new Error(`no encontré el cierre de ${nombre}`);
  const expr = src.slice(ini + `const ${nombre} = `.length, fin + `].join("|"), "i")`.length);
  return eval(expr);
}
function extraerFuncion(nombre) {
  const ini = src.indexOf(`function ${nombre}(`);
  if (ini < 0) throw new Error(`no encontré function ${nombre}`);
  let cuerpo = src.slice(ini);
  cuerpo = cuerpo.replace(/\)\s*:\s*\{[^{}]*\}\s*\{/, ") {"); // tipo de retorno OBJETO (ej. `): {a:string} {`)
  const iBody = cuerpo.indexOf("{");
  let depth = 0, j = iBody;
  for (; j < cuerpo.length; j++) {
    if (cuerpo[j] === "{") depth++;
    else if (cuerpo[j] === "}") { depth--; if (depth === 0) break; }
  }
  // Separar FIRMA y CUERPO. El strip de tipos de parámetro se aplica SOLO a la firma; si se aplicara al
  // cuerpo, rompería los object literals (`{ metodo: met }` -> `{ metodo }`, ReferenceError).
  let sig = cuerpo.slice(0, iBody);
  let body = cuerpo.slice(iBody, j + 1);
  sig = sig
    .replace(/\)\s*:\s*[A-Za-z0-9_$\[\]<>|., ]+\s*$/, ")")                 // tipo de retorno (Record<string, unknown>, string[], …)
    .replace(/([(,]\s*[A-Za-z_$][\w$]*)\s*:\s*[^,)]+?(?=\s*[,)])/g, "$1"); // tipos de parámetros
  // En el CUERPO solo neutralizamos TS que de verdad aparece ahí: genéricos de `new Set<>` y el `: any` de
  // arrows internas (frasearTarifa). NUNCA tocamos `key: value` de los object literals.
  body = body.replace(/new Set<[^>]+>/g, "new Set").replace(/:\s*any\b/g, "");
  return eval(`(${sig}${body})`);
}

function extraerSystemPrompt() {
  const ini = src.indexOf("const SYSTEM_PROMPT = `");
  if (ini < 0) throw new Error("no encontré la const SYSTEM_PROMPT");
  const fin = src.indexOf("`;", ini);
  if (fin < 0) throw new Error("no encontré el cierre de SYSTEM_PROMPT");
  return src.slice(ini + "const SYSTEM_PROMPT = `".length, fin);
}

const NEEDS_TOOL_RE = extraerConst("NEEDS_TOOL_RE");
const HANDOFF_RE = extraerConst("HANDOFF_RE");
const INTERRUPT_RE = extraerConst("INTERRUPT_RE");
const BASIC_INFO_RE = extraerConst("BASIC_INFO_RE");
const modelosEn = extraerFuncion("modelosEn");
const variantesModelo = extraerFuncion("variantesModelo");
const conItbms = extraerFuncion("conItbms");
const stockTexto = extraerFuncion("stockTexto");
const pareceFuncionEnTexto = extraerFuncion("pareceFuncionEnTexto");
const limpiarWhatsApp = extraerFuncion("limpiarWhatsApp");
const frasearTarifa = extraerFuncion("frasearTarifa");
const SYSTEM_PROMPT = extraerSystemPrompt();

// --- harness -------------------------------------------------------------------------------------
let ok = 0, mal = 0;
function caso(desc, cond) {
  if (cond) { ok++; } else { mal++; console.error(`  ✗ FALLA: ${desc}`); }
}

// --- NEEDS_TOOL_RE: fuerza tool ------------------------------------------------------------------
console.log("NEEDS_TOOL_RE");
// v45: códigos/SKU sueltos (sin palabra de catálogo) → DEBEN forzar tool
for (const t of ["W1105A", "CF258A", "7MD68A", "BA1U5LA#ABM", "B96RJUA#ABA", "FDC-BT15KR-6B",
  "tn730", "GI-190", "PT-H110", "L220", "me interesa el TSB966DI", "mg2410"]) {
  caso(`SKU "${t}" fuerza tool`, NEEDS_TOOL_RE.test(t));
}
// Trade-off aceptado (paridad pre-v45): código PURO dígitos+sufijo, solo, no fuerza (con palabra de
// catálogo sí: "tinta 954xl"). Documentado para que un cambio futuro lo haga a propósito.
for (const t of ["954xl", "3253ci"]) {
  caso(`"${t}" solo NO fuerza (paridad pre-v45)`, !NEEDS_TOOL_RE.test(t));
  caso(`"tinta ${t}" SÍ fuerza`, NEEDS_TOOL_RE.test(`tinta ${t}`));
}
// v45: garantía/devolución GENERAL → tool (info_tienda)
for (const t of ["¿qué garantía tienen?", "política de devolución", "¿hacen devoluciones?", "¿hacen cambios?"]) {
  caso(`política "${t}" fuerza tool`, NEEDS_TOOL_RE.test(t));
}
// regresión: lo de siempre sigue matcheando
for (const t of ["precio del toner tn-730", "¿venden monitores?", "impresora epson", "¿hay sucursal en David?", "cuánto cuesta"]) {
  caso(`"${t}" fuerza tool (regresión)`, NEEDS_TOOL_RE.test(t));
}
// NO deben forzar: saludos, acks, NÚMEROS PUROS (teléfonos, RUC, cantidades) y — de la revisión
// adversarial pre-deploy — cédulas con letra, horas, plazos y montos con sufijo.
for (const t of ["hola buenos días", "gracias", "ok listo", "6282-1798", "155743728-2-2023",
  "necesito 5", "mañana paso", "RUC 155743728-2-2023",
  "E-8-104720", "PE-12-3456", "N-19-1234", "paso a las 9:00am", "llego 10am", "estoy libre 12pm",
  "respondo en 24hrs", "el 1ero de agosto", "son 20usd"]) {
  caso(`"${t}" NO fuerza tool`, !NEEDS_TOOL_RE.test(t));
}

// --- HANDOFF_RE: reclamo concreto SÍ / política general NO ---------------------------------------
console.log("HANDOFF_RE");
for (const t of ["quiero devolver el toner", "lo quiero devolver", "necesito devolver esta impresora",
  "me llegó dañado", "el equipo vino roto", "salió defectuoso", "está defectuoso", "quiero aplicar la garantía",
  "la impresora está en garantía", "tengo un reclamo", "quiero hablar con un asesor", "necesito un humano", "una queja",
  // de la revisión adversarial pre-deploy — frases reales que la 1ª versión de v45 dejaba pasar:
  "necesito una devolución", "¿me pueden hacer la devolución?", "quiero hacer la devolución de la impresora que compré",
  "compré un tóner la semana pasada, me salió dañado, necesito una devolución",
  "quiero aplicar mi garantía", "hacer efectiva la garantía", "se me dañó, tiene garantía",
  "puedo devolver esto", "que me devuelvan el dinero", "quiero cambiarlo, salió malo"]) {
  caso(`reclamo "${t}" → handoff`, HANDOFF_RE.test(t));
}
for (const t of ["¿qué garantía tienen los toners?", "¿cuál es la política de devolución?", "¿hacen devoluciones?",
  "¿los productos vienen con garantía?", "¿aceptan devoluciones?", "¿tienen garantía los equipos?",
  "precio del toner tn-730"]) {
  caso(`general "${t}" NO → handoff`, !HANDOFF_RE.test(t));
}

// --- INTERRUPT_RE: regresión (pago/fiscal EN CURSO sí; métodos no) --------------------------------
console.log("INTERRUPT_RE");
for (const t of ["le adjunto el comprobante", "ya le hice la transferencia", "RUC 155743728-2-2023",
  "factura a nombre de ACME", "¿a qué cuenta le transfiero?", "puedo pagar ya",
  "E-8-104720", "mi cédula PE-12-3456"]) { // v45: cédula PA con letra también abstiene
  caso(`"${t}" → abstención`, INTERRUPT_RE.test(t));
}
caso(`"GI-190" NO → abstención (SKU, no cédula)`, !INTERRUPT_RE.test("GI-190"));
caso(`"FDC-BT15KR-6B" NO → abstención`, !INTERRUPT_RE.test("FDC-BT15KR-6B"));
for (const t of ["¿aceptan yappy?", "¿cómo pago?", "¿qué formas de pago tienen?", "precio del toner"]) {
  caso(`"${t}" NO → abstención`, !INTERRUPT_RE.test(t));
}

// --- BASIC_INFO_RE: asistencia -------------------------------------------------------------------
console.log("BASIC_INFO_RE");
for (const t of ["¿cuál es el horario?", "¿dónde quedan?", "¿aceptan tarjeta?", "¿hacen envíos?", "política de devolución"]) {
  caso(`"${t}" es info básica`, BASIC_INFO_RE.test(t));
}
caso(`"precio del toner" NO es info básica`, !BASIC_INFO_RE.test("precio del toner"));

// --- helpers deterministas ------------------------------------------------------------------------
console.log("helpers");
caso("modelosEn extrae PG-145XL", modelosEn("tinta canon PG-145XL").includes("PG-145XL"));
caso("modelosEn extrae 140XL y 3253ci", modelosEn("140XL para la 3253ci").join(",").includes("140XL"));
caso("variantesModelo TN830XL → TN-830XL", variantesModelo("TN830XL").includes("TN-830XL"));
caso("variantesModelo PT-H110 → PTH110", variantesModelo("PT-H110").includes("PTH110"));
caso("conItbms 70 → 74.90", conItbms("70").total_con_itbms === "74.90");
caso("conItbms 199 → 212.93", conItbms(199).total_con_itbms === "212.93");
caso("conItbms basura → vacío", conItbms("abc").total_con_itbms === "");
caso("stockTexto 87 → cantidad", stockTexto(true, 87) === "87 unidades disponibles");
caso("stockTexto 2 → stock bajo", stockTexto(true, 2).includes("stock bajo"));
caso("stockTexto undefined+disponible → asesor", stockTexto(true, undefined).includes("asesor"));
caso("stockTexto no disponible → sin stock", stockTexto(false, 0).includes("sin stock"));
caso("pareceFuncionEnTexto detecta <invoke>", pareceFuncionEnTexto('<invoke name="buscar_producto">x</invoke>'));
caso("pareceFuncionEnTexto detecta name=tool", pareceFuncionEnTexto('llamo a name="info_tienda" ahora'));
caso("pareceFuncionEnTexto ignora texto normal", !pareceFuncionEnTexto("Sí, tenemos el TN-730 a $70.00 + ITBMS."));
caso("limpiarWhatsApp link md → URL", limpiarWhatsApp("[ver](https://x.com/a)") === "https://x.com/a");
caso("limpiarWhatsApp ** → *", limpiarWhatsApp("**hola**") === "*hola*");

// --- SYSTEM_PROMPT: guards de contenido (v46) ------------------------------------------------------
console.log("SYSTEM_PROMPT");
// v46: bug real — el bot decía "tenemos el punto/sucursal en [ciudad]" (suena a tienda propia de QSP)
// en vez de explicar que el pedido se ENVÍA por Servientrega. Guard de regresión: la frase prohibida no
// debe reaparecer, y la instrucción del proceso sí debe estar.
// (la frase SÍ aparece una vez, dentro de la instrucción "NUNCA digas..." — eso es lo que se verifica)
caso('SYSTEM_PROMPT prohíbe explícitamente "tenemos el punto/sucursal"', /NUNCA digas "tenemos el punto/i.test(SYSTEM_PROMPT));
caso('SYSTEM_PROMPT explica el proceso de envío (Servientrega)', /red de Servientrega/i.test(SYSTEM_PROMPT));
caso('SYSTEM_PROMPT dice trato de usted (no tutea)', /TRATO DE USTED/i.test(SYSTEM_PROMPT));
caso('SYSTEM_PROMPT NO tiene el tuteo viejo de v41 ("te la mandamos")', !/te la mandamos/i.test(SYSTEM_PROMPT));

// --- frasearTarifa (v47): el fraseo del envío por sector, según el método real ---------------------
console.log("frasearTarifa");
// veredictos mock = shapes EXACTOS que devuelve resolver_tarifa (validados contra Postgres real).
const V_TOC = { estado:"ok", metodo:"retiro_agente_verde", tarifa_usd:6.00, confianza:"Alta",
  plazo:"Listo para retirar al día hábil siguiente. En esta zona NO se hace entrega a domicilio.",
  puntos_retiro:"AV Shop Box Don Bosco (detrás de Plaza Tocumen) o AV Nuevo Tocumen Shopline (Plaza Nuevo Tocumen)" };
const V_PAC = { estado:"ok", metodo:"servientrega", tarifa_usd:9.00, confianza:"Media",
  plazo:"Al día hábil siguiente a domicilio (vía Servientrega).", puntos_retiro:null };
const V_CA  = { estado:"ok", metodo:"asesor", tarifa_usd:null, confianza:"Alta",
  plazo:"Un asesor coordina la entrega y el costo según la dirección exacta.", puntos_retiro:null };
const V_ED  = { estado:"ok", metodo:"propia", tarifa_usd:6.00, confianza:"Media",
  plazo:"Mismo día si el pedido entra antes de las 3:00 p.m.; después, al día hábil siguiente.", puntos_retiro:null };
const V_SJ  = { estado:"ambiguo", opciones:[
  { corregimiento:"Betania", metodo:"propia", tarifa_usd:6.00 },
  { corregimiento:"Las Mañanitas", metodo:"retiro_agente_verde", tarifa_usd:6.00 } ] };
const V_COR = { estado:"sin_match", consulta:"coronado" };

const rToc = frasearTarifa(V_TOC);
caso("retiro: estado ok", rToc.estado === "ok");
// LA CLAVE de v47: zona de retiro NUNCA ofrece domicilio
caso("retiro: dice retirar y 'no ... domicilio'", /retirar/i.test(rToc.respuesta_sugerida) && /no hacemos entrega a domicilio/i.test(rToc.respuesta_sugerida));
caso("retiro: incluye $6.00 y los puntos", rToc.respuesta_sugerida.includes("6.00") && rToc.respuesta_sugerida.includes("Don Bosco"));

const rPac = frasearTarifa(V_PAC);
caso("servientrega: domicilio $9.00", /a domicilio/i.test(rPac.respuesta_sugerida) && rPac.respuesta_sugerida.includes("9.00"));
caso("confianza Media añade 'asesor confirma'", /asesor confirma/i.test(rPac.respuesta_sugerida));

const rCa = frasearTarifa(V_CA);
caso("asesor: coordina y SIN precio B/.", /asesor/i.test(rCa.respuesta_sugerida) && !/B\/\./.test(rCa.respuesta_sugerida));

const rEd = frasearTarifa(V_ED);
caso("propia: $6.00 mismo día", rEd.respuesta_sugerida.includes("6.00") && /mismo d[ií]a/i.test(rEd.respuesta_sugerida));

const rSj = frasearTarifa(V_SJ);
caso("ambiguo: pide corregimiento y nombra ambas zonas", rSj.estado === "ambiguo" && /corregimiento/i.test(rSj.respuesta_sugerida) && /Betania/.test(rSj.respuesta_sugerida) && /Mañanitas/.test(rSj.respuesta_sugerida));

const rCor = frasearTarifa(V_COR);
caso("sin_match: nota con interior/asesor", rCor.estado === "sin_match" && /interior|asesor/i.test(rCor.nota));

// --- resumen --------------------------------------------------------------------------------------
console.log(`\n${ok} OK, ${mal} FALLA${mal === 1 ? "" : "S"}`);
if (mal > 0) process.exit(1);
console.log("✅ golden tests: todo verde");
