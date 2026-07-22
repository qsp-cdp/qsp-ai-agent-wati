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
const frasearPedido = extraerFuncion("frasearPedido");
const limpiarHtml = extraerFuncion("limpiarHtml");
const normalizarConsulta = extraerFuncion("normalizarConsulta");
const MOTIVO_TRIVIAL_RE = extraerConst("MOTIVO_TRIVIAL_RE");
const motivoTicket = extraerFuncion("motivoTicket");
const juntarModelosEspaciados = extraerFuncion("juntarModelosEspaciados");
const algunTituloConCodigo = extraerFuncion("algunTituloConCodigo");
const RESPUESTA_NO_RESUELTA_RE = extraerConst("RESPUESTA_NO_RESUELTA_RE");
const PROMESA_ASESOR_RE = extraerConst("PROMESA_ASESOR_RE");
const prometeSeguimientoSinResolver = extraerFuncion("prometeSeguimientoSinResolver");
const calcularCotizacion = extraerFuncion("calcularCotizacion");
const parseCatalogoMCP = extraerFuncion("parseCatalogoMCP");
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
  "E-8-104720", "mi cédula PE-12-3456", // v45: cédula PA con letra también abstiene
  // v50 (revisión adversarial): pago COMPLETADO sin "ya" — cruzaban NEEDS_TOOL_RE pero no INTERRUPT.
  "ya realicé el pago", "hice el pago", "acabo de pagar", "te mandé el pago", "aquí está mi pago", "ya te pasé el pago"]) {
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
// v59.1 — el ambiguo se CONDENSÓ: costo (rango o valor) + pide corregimiento, SIN enumerar cada zona.
caso("ambiguo (v59.1): condensado — costo + pide corregimiento, sin enumerar zonas", rSj.estado === "ambiguo" && /corregimiento/i.test(rSj.respuesta_sugerida) && /6\.42/.test(rSj.respuesta_sugerida) && !/Mañanitas/.test(rSj.respuesta_sugerida));
caso("ambiguo: método mixto (retiro) agrega la nota de método/plazo", /m[eé]todo|tramo/i.test(rSj.respuesta_sugerida));
// corredor real (Transístmica, 5 tramos, $6/$7/$9, uno servientrega): rango, no un muro de 5 líneas.
const V_COR5 = { estado: "ambiguo", opciones: [
  { corregimiento: "Betania", metodo: "propia", tarifa_usd: 6 },
  { corregimiento: "Amelia Denis de Icaza", metodo: "propia", tarifa_usd: 7 },
  { corregimiento: "Las Cumbres", metodo: "servientrega", tarifa_usd: 9 },
  { corregimiento: "Mateo Iturralde", metodo: "propia", tarifa_usd: 7 },
  { corregimiento: "Victoriano Lorenzo", metodo: "propia", tarifa_usd: 7 } ] };
const rCor5 = frasearTarifa(V_COR5);
caso("v59.1: corredor 5 tramos → rango B/.6.42–B/.9.63", /6\.42/.test(rCor5.respuesta_sugerida) && /9\.63/.test(rCor5.respuesta_sugerida) && /desde/.test(rCor5.respuesta_sugerida));
caso("v59.1: corredor NO enumera los 5 corregimientos (condensado)", !/Victoriano Lorenzo/.test(rCor5.respuesta_sugerida) && !/Mateo Iturralde/.test(rCor5.respuesta_sugerida));
caso("v59.1: corredor mixto (servientrega) agrega la nota de método", /m[eé]todo|tramo/i.test(rCor5.respuesta_sugerida));
// todas propias, mismo precio → sin nota de método, costo directo (no rango).
const rSoloProp = frasearTarifa({ estado: "ambiguo", opciones: [
  { corregimiento: "A", metodo: "propia", tarifa_usd: 7 }, { corregimiento: "B", metodo: "propia", tarifa_usd: 7 } ] });
caso("v59.1: ambiguo todo-propia mismo precio → 'es B/.7.49', sin nota de método", /es B\/\.7\.00 \+ ITBMS \(7%\) = B\/\.7\.49/.test(rSoloProp.respuesta_sugerida) && !/dependen del tramo/.test(rSoloProp.respuesta_sugerida));

const rCor = frasearTarifa(V_COR);
caso("sin_match: nota con interior/asesor", rCor.estado === "sin_match" && /interior|asesor/i.test(rCor.nota));

// --- v47 revisión adversarial pre-deploy: locks de los 2 hallazgos + pulidos ----------------------
console.log("v47 revisión");
// F1: tarifa_entrega NO en el whitelist de MODO ASISTENCIA (cotizar compromete un pedido; en asistencia
// el humano lleva la venta). Chequeo sobre el source real.
const assistFilter = (src.match(/modoAsistencia \? TOOLS\.filter\(\(t\) =>[^;]*/) || [""])[0];
caso("asistencia incluye info_tienda + sucursales_interior", /info_tienda/.test(assistFilter) && /sucursales_interior/.test(assistFilter));
caso("asistencia NO incluye tarifa_entrega (cotizar envío compromete una entrega)", assistFilter.length > 0 && !/tarifa_entrega/.test(assistFilter));
caso("asistencia NO incluye guardar_lead (no captura datos con el humano a cargo)", assistFilter.length > 0 && !/guardar_lead/.test(assistFilter));
// pulido: "domicilio" fuerza tool (para enrutar a tarifa_entrega en la ciudad).
caso('"¿lo llevan a domicilio?" fuerza tool', NEEDS_TOOL_RE.test("¿lo llevan a domicilio?"));
// pulido: retiro con puntos_retiro null -> fallback, nunca "(null)" al cliente.
const rNoPts = frasearTarifa({ estado:"ok", metodo:"retiro_agente_verde", tarifa_usd:6.00, confianza:"Alta", plazo:"x", puntos_retiro:null });
caso("retiro sin puntos: fallback, no '(null)'", !/\(null\)/.test(rNoPts.respuesta_sugerida) && /punto Servientrega/i.test(rNoPts.respuesta_sugerida));

// --- v48: CONCIENCIA DE PEDIDOS ------------------------------------------------------------------
console.log("v48 NEEDS_TOOL_RE (estado de pedido)");
// Preguntas de ESTADO de un pedido ya hecho → DEBEN forzar tool (estado_pedido).
for (const t of ["¿dónde está mi pedido?", "ya salió mi orden", "¿cuándo me llega?", "me das el número de guía",
  "seguimiento de mi pedido", "cómo rastreo mi paquete", "estado de mi pedido", "mi compra ya salió", "cuándo entregan",
  "mis pedidos", "mis órdenes", "mis paquetes"]) { // plural parity (finding 5)
  caso(`estado-pedido "${t}" fuerza tool`, NEEDS_TOOL_RE.test(t));
}
// Targeted (findings 4/5): "pedido/orden" a secas (intención de COMPRAR) NO fuerzan; y las FALSAS positivas
// que la 1ª versión dejaba pasar ("arrastre" vía "rastre"; "guía/seguimiento" sueltos) ya NO fuerzan.
for (const t of ["quiero hacer un pedido", "gracias por la compra",
  "seguimiento médico", "hay mucho arrastre en la fila", "¿tienen una guía de instalación?", "guía de usuario"]) {
  caso(`"${t}" NO fuerza tool (v48 targeted)`, !NEEDS_TOOL_RE.test(t));
}

console.log("frasearPedido");
// veredictos mock = shape EXACTO del RPC estado_pedido (validado contra Postgres local).
const P_PROP = { estado:"ok", wa_id:"50761234567", pedidos:[
  { pedido_ref:"#1001", estado:"en_camino", estado_raw:"ONTHEWAY", metodo:"propia", tracking:"https://track.shipday.com/ZZ9", total_usd:127, resumen:"1x Epson L3250" } ] };
const P_SERV = { estado:"ok", wa_id:"50761234567", pedidos:[
  { pedido_ref:"#1002", estado:"asignado", metodo:"servientrega", tracking:"GUIA-778899" } ] };
const P_ENTREGADO = { estado:"ok", pedidos:[ { pedido_ref:"#1003", estado:"entregado", metodo:"propia", tracking:"TRACK-NO-MOSTRAR" } ] };
const P_MULTI = { estado:"ok", pedidos:[ { pedido_ref:"#1001", estado:"entregado" }, { pedido_ref:"#1002", estado:"en_camino" } ] };
const P_RARO = { estado:"ok", pedidos:[ { pedido_ref:"#9", estado:"loquesea_desconocido" } ] };

const rProp = frasearPedido(P_PROP);
caso("propia en_camino: ok + '#1001' + 'va en camino'", rProp.estado === "ok" && /#1001/.test(rProp.respuesta_sugerida) && /va en camino/i.test(rProp.respuesta_sugerida));
caso("propia: link de seguimiento (no 'guía')", /seguirlo aqu[ií]/i.test(rProp.respuesta_sugerida) && rProp.respuesta_sugerida.includes("ZZ9") && !/gu[ií]a/i.test(rProp.respuesta_sugerida));
// F1 (revisión adversarial): frasearPedido NO debe devolver el array crudo de pedidos — solo el string
// fraseado en código. Si volviera estado_raw/total_usd/resumen, el modelo podría emitir una FECHA o un
// PRECIO fuera de buscar_producto. Lock: el objeto no trae 'pedidos' ni valores crudos.
const leakProp = JSON.stringify(rProp);
caso("F1: no filtra el array crudo ni estado_raw/total_usd/resumen", !("pedidos" in rProp) && !/estado_raw|total_usd|resumen|ONTHEWAY|Epson|127/.test(leakProp));

const rServ = frasearPedido(P_SERV);
caso("servientrega asignado: rastrea con GUÍA", /gu[ií]a GUIA-778899/i.test(rServ.respuesta_sugerida));

const rEnt = frasearPedido(P_ENTREGADO);
caso("entregado: 'figura como entregado' y NO muestra tracking", /figura como entregado/i.test(rEnt.respuesta_sugerida) && !/TRACK-NO-MOSTRAR/.test(rEnt.respuesta_sugerida));

const rMulti = frasearPedido(P_MULTI);
caso("multi: lista #1001 y #1002", /#1001/.test(rMulti.respuesta_sugerida) && /#1002/.test(rMulti.respuesta_sugerida));

const rRaro = frasearPedido(P_RARO);
caso("estado desconocido: cae a 'en proceso', no inventa fecha", /en proceso/i.test(rRaro.respuesta_sugerida) && /#9/.test(rRaro.respuesta_sugerida) && !/\d{1,2}\s*(de|\/)/.test(rRaro.respuesta_sugerida));

// finding 7 (defensa): elementos no-objeto NO deben tumbar frasearPedido.
for (const bad of [{ estado:"ok", pedidos:[null] }, { estado:"ok", pedidos:[42, null] }, { estado:"ok", pedidos:[{}] }]) {
  let threw = false, r;
  try { r = frasearPedido(bad); } catch { threw = true; }
  caso(`frasearPedido no truena con ${JSON.stringify(bad)}`, !threw && r && typeof r.respuesta_sugerida === "string");
}
// finding 6/1 (defensa): un pedido con ref nulo se muestra como "un pedido", nunca "s/n" ni un id interno.
const rNullRef = frasearPedido({ estado:"ok", pedidos:[ { pedido_ref:null, estado:"en_camino" }, { pedido_ref:"#7", estado:"nuevo" } ] });
caso("multi con ref nulo: 'un pedido', no 's/n'", /un pedido/.test(rNullRef.respuesta_sugerida) && !/s\/n/.test(rNullRef.respuesta_sugerida) && /#7/.test(rNullRef.respuesta_sugerida));

// sin_pedidos / entradas basura → NUNCA afirma que el cliente no tiene pedidos; deriva a un asesor.
for (const v of [{ estado:"sin_pedidos", wa_id:"5076" }, {}, null, { estado:"ok", pedidos:[] }, { estado:"error" }]) {
  const r = frasearPedido(v);
  caso(`sin_pedidos(${JSON.stringify(v)}): estado sin_pedidos + asesor`, r.estado === "sin_pedidos" && /asesor/i.test(r.respuesta_sugerida));
  caso(`sin_pedidos(${JSON.stringify(v)}): NO afirma "no tiene pedidos"`, !/no tiene (ning[uú]n )?pedido/i.test(r.respuesta_sugerida) && !/no aparece/i.test(r.respuesta_sugerida));
}

console.log("v48 SYSTEM_PROMPT + wiring");
caso('SYSTEM_PROMPT tiene sección CONCIENCIA DE PEDIDOS', /CONCIENCIA DE PEDIDOS/.test(SYSTEM_PROMPT));
caso('SYSTEM_PROMPT nombra la tool estado_pedido', /estado_pedido/.test(SYSTEM_PROMPT));
caso('SYSTEM_PROMPT: vista PARCIAL, no negar pedidos', /vista es PARCIAL/i.test(SYSTEM_PROMPT) && /NO afirmes que el cliente/i.test(SYSTEM_PROMPT));
caso('SYSTEM_PROMPT: estado de pedido despachado NO es interrupción', /NO es una interrupci[oó]n/i.test(SYSTEM_PROMPT));
// wiring en el source real:
caso("index.ts define la tool estado_pedido", /name: "estado_pedido"/.test(src));
caso("index.ts cablea estadoPedido(waId) en el dispatch", /await estadoPedido\(waId\)/.test(src));
caso("estadoPedido llama al RPC estado_pedido", /sb\.rpc\("estado_pedido"/.test(src));
// v50: estado_pedido SÍ va ahora en MODO ASISTENCIA (preventa grounded; el estado es read-only y no
// compromete nada), junto con buscar_producto. Esto CAMBIA el lock v48 que lo excluía.
caso("asistencia SÍ incluye estado_pedido (v50)", /estado_pedido/.test(assistFilter));
caso("asistencia SÍ incluye buscar_producto (v50)", /buscar_producto/.test(assistFilter));

// --- v49: DEBOUNCE de ráfagas + visión multi-imagen (locks sobre el source real) -------------------
console.log("v49 debounce + visión de ráfaga");
caso("DEBOUNCE_MS configurable vía COPILOT_DEBOUNCE_MS", /COPILOT_DEBOUNCE_MS/.test(src));
// el sleep del debounce ocurre ANTES del chequeo pre-LLM (si no, no coalesce nada)
const iSleep = src.indexOf("setTimeout(res, DEBOUNCE_MS)");
const iPreLlm = src.indexOf('fase: "pre-llm"');
caso("sleep de debounce presente y antes del chequeo pre-LLM", iSleep > -1 && iPreLlm > -1 && iSleep < iPreLlm);
caso("anti-carrera temprano post-debounce", /post-debounce/.test(src));
caso("se persiste media_url del mensaje del cliente", /media_url: esImagenCliente/.test(src));
caso("el historial trae media_url", /select\("role,content,model,created_at,media_url"\)/.test(src));
caso("visión multi-imagen (adjunta el array completo)", /\.\.\.imagenes\.map\(\(im\)/.test(src));
caso("ráfaga acotada: máx 3 imágenes", /urlsRafaga\.slice\(-3\)/.test(src));
caso("healthcheck expone debounce_ms", /debounce_ms: DEBOUNCE_MS/.test(src));
caso("asistencia también debounce-a", /v49: misma espera de r[aá]faga/.test(src));

// --- v50: MODO ASISTENCIA ampliado a PREVENTA (locks sobre el source real) ------------------------
console.log("v50 asistencia → preventa");
// trigger: puedeAsistir ahora admite catálogo/precio/pedido (NEEDS_TOOL_RE), no solo info básica.
caso("v50: trigger de asistencia ampliado a NEEDS_TOOL_RE", /\(BASIC_INFO_RE\.test\(texto\) \|\| NEEDS_TOOL_RE\.test\(texto\)\)/.test(src));
// INTERRUPT_RE + HANDOFF_RE gatean la asistencia ANTES del OR (revisión adversarial v50): pago/fiscal/
// coordinar entrega Y reclamo/devolución/garantía → el humano lleva el caso, el bot calla.
caso("v50: INTERRUPT_RE + HANDOFF_RE gatean la asistencia antes del OR", /!interrumpe && !HANDOFF_RE\.test\(texto\)\s*&&\s*\(BASIC_INFO_RE\.test\(texto\) \|\| NEEDS_TOOL_RE\.test\(texto\)\)/.test(src));
// una pregunta de PRECIO habilita la asistencia (matchea NEEDS_TOOL_RE) — antes se callaba.
caso('v50: "¿cuánto cuesta el tóner 105A?" habilitaría asistencia', NEEDS_TOOL_RE.test("¿cuánto cuesta el tóner 105A?"));
// pero un PAGO EN CURSO que menciona un producto sigue bloqueado por INTERRUPT_RE (interrumpe=true).
caso('v50: "a qué cuenta te transfiero por el tóner" NO asiste (INTERRUPT gana)', INTERRUPT_RE.test("a qué cuenta te transfiero por el tóner"));
// finding 2: un reclamo/devolución/garantía (HANDOFF_RE) NO activa la asistencia (→ humano).
caso('v50: reclamo "el toner que compré salió dañado" es HANDOFF_RE (excluido de asistencia)', HANDOFF_RE.test("el toner que compré salió dañado"));
// findings 3/4: la asistencia NO fuerza tool → el modelo puede CALLARSE ante pago/descuento/cotización.
caso("v50: asistencia NO fuerza tool (forceTool=false, deja elegir silencio)", /const r = await responderLLM\(history as any, false, null, false, waId, \{\}, linksTracked, true\)/.test(src));
// la asistencia repone el tracking de links de buscar_producto (v29) — igual que el flujo normal.
caso("v50: asistencia reaplica tracking (linksTracked) en ambos flujos", (src.match(/reaplicarTracking\(limpiarWhatsApp\(r\.text\), linksTracked\)/g) || []).length >= 2);

// ASSIST_SUFFIX: habilita preventa grounded pero mantiene los guardrails duros.
const ASSIST_SUFFIX = (() => {
  const ini = src.indexOf("const ASSIST_SUFFIX = `");
  if (ini < 0) throw new Error("no encontré la const ASSIST_SUFFIX");
  const fin = src.indexOf("`;", ini);
  return src.slice(ini + "const ASSIST_SUFFIX = `".length, fin);
})();
caso("v50: ASSIST_SUFFIX habilita buscar_producto + precio", /buscar_producto/.test(ASSIST_SUFFIX) && /precio/i.test(ASSIST_SUFFIX));
caso("v50: ASSIST_SUFFIX prohíbe cerrar/confirmar la venta", /NO cierres/i.test(ASSIST_SUFFIX));
caso("v50: ASSIST_SUFFIX prohíbe coordinar pago/pedido/entrega", /NO confirmes ni coordines/i.test(ASSIST_SUFFIX));
caso("v50: ASSIST_SUFFIX prohíbe datos fiscales (RUC/factura)", /fiscales.*(RUC|factura)/i.test(ASSIST_SUFFIX));
caso("v50: ASSIST_SUFFIX prohíbe cotizar envío por sector", /NO cotices el costo\/m[eé]todo de env[ií]o/i.test(ASSIST_SUFFIX));
caso("v50: ASSIST_SUFFIX prohíbe pedir/guardar datos del cliente", /NO pidas ni guardes datos/i.test(ASSIST_SUFFIX));
caso("v50: ASSIST_SUFFIX sigue deferente (un asesor continúa)", /asesor contin[uú]a/i.test(ASSIST_SUFFIX));

// --- v51: guard de plantilla saliente (coexistencia con el cron de re-enganche) -------------------
console.log("v51 guard plantilla saliente");
// El cron reengage-expired envía plantillas HSM; WATI eco-notifica "Template Message Sent". El copiloto
// debe SALTARLO (no tratarlo como asesor humano → falso handoff). Lock sobre el source real.
caso("v51: copilot salta eventos de plantilla saliente", /eventType\.includes\("template"\)/.test(src) && /evento_plantilla_saliente/.test(src));
// v51 (revisión adversarial): el guard exige esDelNegocio → un ENTRANTE con "template" en el tipo NO se descarta.
caso("v51: el guard de plantilla exige esDelNegocio (owner=true)", /esDelNegocio && \(eventType\.includes\("template"\)/.test(src));
caso("v51: el guard de plantilla va ANTES del path owner=true (human-agent)", (() => {
  const iGuard = src.indexOf('skipped: "template_message_sent"');
  const iOwner = src.indexOf("Mensaje del NEGOCIO (owner=true)");
  return iGuard > -1 && iOwner > -1 && iGuard < iOwner;
})());
caso("v51: guard de plantilla wireado (independiente de la versión del healthcheck)", /skipped: "template_message_sent"/.test(src));

// --- v52: búsqueda por característica (body) + specs grounded + ticket de promesa -----------------
console.log("v52 búsqueda por característica + ticket de promesa");
// Fix 1: suggestShopify ahora pide `body` (caso real: "bandeja legal" SIN body → 0 resultados;
// probado contra la tienda real CON body → 5 impresoras reales, incluida la que necesitaba la clienta).
caso("suggestShopify pide `body` en los fields", /resources%5Boptions%5D%5Bfields%5D=title,product_type,variants\.title,vendor,tag,body/.test(src));
caso("suggestShopify pasa descripcion_html al resultado", /descripcion_html: p\.body/.test(src));
caso("buscarProducto expone especificaciones (limpiarHtml + slice 1500)", /especificaciones: specs \|\| undefined/.test(src) && /specsLimpias\.slice\(0, 1500\)/.test(src));

// limpiarHtml: quita tags/entidades básicas, colapsa espacios — el modelo debe poder CITAR este texto.
const htmlCanon = '<h2>Título</h2><p>Bandeja de entrada con capacidad para <strong>250 hojas</strong> de papel tamaño carta o legal.</p>&nbsp;&amp;';
const specsLimpias = limpiarHtml(htmlCanon);
caso("limpiarHtml quita tags", !/<[^>]*>/.test(specsLimpias));
caso("limpiarHtml conserva el texto real (carta o legal)", /carta o legal/.test(specsLimpias));
caso("limpiarHtml decodifica entidades básicas", specsLimpias.includes("&") && !specsLimpias.includes("&amp;"));

caso('SYSTEM_PROMPT: REGLA DE ORO menciona "especificaciones"', /especificaciones/.test(SYSTEM_PROMPT.split("VENTA CONSULTIVA")[0]));
caso('SYSTEM_PROMPT: NO afirmar por "lógica" sin especificaciones', /ni\s+"por l[oó]gica"/i.test(SYSTEM_PROMPT) || /SOLO lo confirmas si "especificaciones"/i.test(SYSTEM_PROMPT));

// Fix 2: INTERRUPT_RE — formas PLURALES de pago completado (auditoría real: "Realizamos la transferencia").
for (const t of ["Realizamos la transferencia", "ya hicimos el pago", "les enviamos el comprobante", "ya pagamos la transferencia completa"]) {
  caso(`v52: "${t}" → abstención (plural)`, INTERRUPT_RE.test(t));
}
// no debe tocar preguntas benignas de método (plural incluido).
for (const t of ["¿aceptan yappy?", "¿qué formas de pago tienen?", "podemos pagar con tarjeta?"]) {
  caso(`v52: "${t}" NO → abstención`, !INTERRUPT_RE.test(t));
}

// Fix 3: HANDOFF_RE — reclamo de FACTURACIÓN (auditoría real: "me facturaron los 4" cuando solo entregaron 2).
for (const t of ["necesito una nota de crédito", "solo me entregaron 2 rollos y me facturaron los 4",
  "me cobraron de más", "me llegó una factura incorrecta",
  // revisión adversarial: faltaba la 3ª persona singular del pretérito (facturó/cobró, ni "aron" ni "a").
  "me facturó de más", "el sistema me cobró de más",
  // revisión adversarial: el contraste también debe matchear en el otro orden (factura antes que entrega).
  "me facturaron 4 y solo me llegaron 2"]) {
  caso(`v52: "${t}" → HANDOFF_RE (reclamo de facturación)`, HANDOFF_RE.test(t));
}
// no debe tocar pedidos benignos de facturación (ya cubiertos por INTERRUPT_RE aparte).
caso('v52: "me pueden facturar a nombre de mi empresa" NO cruza el nuevo patrón de HANDOFF_RE', !/me factur|nota de cr[eé]dito|me cobr|factura(ci[oó]n)? (incorrecta|equivocada)/i.test("me pueden facturar a nombre de mi empresa"));
// revisión adversarial: "los? \d+" suelto era un catch-all demasiado amplio — un agradecimiento SIN
// reclamo ("ya me facturaron los 3 que pedí, gracias, todo perfecto") disparaba handoff por error.
caso('v52: "sí, ya me facturaron los 3 que pedí, gracias, todo perfecto" NO dispara HANDOFF_RE (falso positivo cerrado)', !HANDOFF_RE.test("sí, ya me facturaron los 3 que pedí, gracias, todo perfecto"));

// Fix 4: ticket de promesa — detección determinista (no depende de que el modelo llame una tool).
const P_NO_ENCONTRE = "No encontré por ahora un modelo con doble bandeja en el catálogo. ¿Le parece si un asesor le confirma opciones disponibles?";
const P_SIN_STOCK = "Actualmente está sin stock, un asesor le confirma reingreso.";
const P_RESUELTO = "¡Perfecto! Le confirmo: HP 954XL cian por $48.00 + ITBMS = $51.36, con 8 unidades disponibles.";
const P_ASESOR_SIN_PROMESA = "Un asesor sigue con su caso, gracias por su paciencia."; // deferente pero sin verbo de confirmación
// revisión adversarial: faltaban conjugaciones comunes (1ª plural / "puedo") de "sin resolver".
const P_NO_PUEDO = "No puedo confirmar el stock exacto en este momento; un asesor se lo confirma.";
const P_NO_TENEMOS = "No tenemos ese color en este momento, un asesor le confirma cuándo llega.";
caso("prometeSeguimientoSinResolver: 'no encontré... asesor confirma' → true (caso real Anaiska)", prometeSeguimientoSinResolver(P_NO_ENCONTRE));
caso("prometeSeguimientoSinResolver: 'sin stock... asesor confirma reingreso' → true", prometeSeguimientoSinResolver(P_SIN_STOCK));
caso("prometeSeguimientoSinResolver: respuesta YA resuelta (con precio/stock) → false", !prometeSeguimientoSinResolver(P_RESUELTO));
caso("prometeSeguimientoSinResolver: cortesía deferente sin promesa de confirmar → false", !prometeSeguimientoSinResolver(P_ASESOR_SIN_PROMESA));
caso("prometeSeguimientoSinResolver: 'no puedo confirmar... asesor confirma' → true", prometeSeguimientoSinResolver(P_NO_PUEDO));
caso("prometeSeguimientoSinResolver: 'no tenemos... asesor confirma' → true", prometeSeguimientoSinResolver(P_NO_TENEMOS));

// wiring: el ticket SOLO se crea si el mensaje realmente se envió (enviado=true) — un shadow nunca
// llegó al cliente, no hay promesa real que registrar. Chequeo sobre el source real (ambos flujos).
caso("v52: ticket de promesa gateado por `enviado` en el flujo normal", /if \(enviado && salida && prometeSeguimientoSinResolver\(salida\)\)/.test(src));
caso("v52: ticket de promesa también en el flujo de asistencia (v50)", (src.match(/prometeSeguimientoSinResolver\(salida\)/g) || []).length >= 2);
caso("v52/v54: el ticket usa la tabla `handoffs` con `origen` (vía insertarTicketPromesa)", /await sb\.from\("handoffs"\)\.insert\(\{ conversation_id: convId, motivo, origen \}\)/.test(src) && (src.match(/"bot_promise"/g) || []).length >= 2);
caso("v52: el handoff por keyword también trae `origen: \"keyword\"`", /origen: "keyword"/.test(src));
caso("v52/v54: el fallback v23 también genera ticket (bot_fallback)", /seguimiento_bot\(fallback\)/.test(src) && /"bot_fallback"\)/.test(src));
caso("v52/v54: el insert a `handoffs` chequea error (centralizado en el helper)", /handoff_ticket_insert_error/.test(src));
caso("v52/v54: el motivo del ticket usa `contenido` (vía motivoTicket), no `texto` crudo", !/motivoTicket\(texto/.test(src) && (src.match(/motivoTicket\(contenido/g) || []).length >= 3);
caso("v52/v54: ticket de promesa wireado (independiente de la versión del healthcheck)", /"bot_promise"\)/.test(src) && /prometeSeguimientoSinResolver/.test(src));

// revisión adversarial: especificaciones ahora avisa si el texto real era más largo que el corte (1500
// chars) — evita un "no lo tiene" tajante cuando el dato pudo quedar después del corte.
caso("v52: especificaciones_truncada existe en el resultado enriquecido", /especificaciones_truncada: specsLimpias\.length > 1500/.test(src));
caso('SYSTEM_PROMPT: instrucción para especificaciones_truncada', /especificaciones_truncada/i.test(SYSTEM_PROMPT));
caso('SYSTEM_PROMPT: especificaciones pertenece SOLO al mismo resultado (anti atribución cruzada)', /EXCLUSIVAMENTE al producto de ESE MISMO resultado/i.test(SYSTEM_PROMPT));
caso('SYSTEM_PROMPT: especificaciones NUNCA da precio/promo (anti contenido no confiable)', /NUNCA cites de "especificaciones" precio, descuento, promoci[oó]n/i.test(SYSTEM_PROMPT));

// --- v52 (hallazgo en vivo): DÍA DE LA SEMANA sin consultar horario real ---------------------------
// Caso real: cliente dijo "el sábado trataré de ir x allá" y el bot confirmó "puede pasar el sábado"
// sin consultar nada — la tienda NO atiende sábados. Ningún trigger existente lo cazaba (INTERRUPT_RE
// exigía el verbo "pasar" pegado al día; este mensaje usaba otro verbo y otro orden).
console.log("v52 día de la semana → fuerza info_tienda");
for (const t of ["el sábado trataré de ir x allá", "puedo ir el domingo?", "paso a retirar el lunes",
  "voy el martes a buscarlo"]) {
  caso(`v52: "${t}" fuerza tool (día + intención de visitar)`, NEEDS_TOOL_RE.test(t));
}
caso('SYSTEM_PROMPT: regla de DÍA DE LA SEMANA (no asumir que atienden un día sin confirmar)', /DÍA DE LA SEMANA/.test(SYSTEM_PROMPT) && /si el d[ií]a que menciona es s[aá]bado, domingo o feriado/i.test(SYSTEM_PROMPT));

// --- v53: normalización de dimensiones en la búsqueda (casos reales de la auditoría) --------------
console.log("v53 búsqueda por dimensión");
// Las queries EXACTAS que el bot corrió hoy y dieron 0 resultados (aunque el rollo existe y está en stock):
caso('v53: "papel bond 30 pulgadas plotter" → quita "pulgadas"',
  normalizarConsulta("rollo papel bond 30 pulgadas plotter") === "rollo papel bond 30 plotter");
caso('v53: "36 pulgadas" → "36"', normalizarConsulta("rollo papel bond 36 pulgadas plotter") === "rollo papel bond 36 plotter");
caso('v53: "30x150" → "30 150"', normalizarConsulta("Rollo de Papel Bond Alliance 30x150 Plotter") === "Rollo de Papel Bond Alliance 30 150 Plotter");
caso('v53: "30 x 150" → "30 150"', normalizarConsulta("papel bond 30 x 150") === "papel bond 30 150");
caso('v53: el símbolo 30" → 30', normalizarConsulta('papel bond 30" x 150') === "papel bond 30 150");
// no debe alterar una consulta que ya está limpia (para que el dedup la ignore y no duplique llamadas).
caso('v53: "papel bond 30" queda igual (no rompe lo que ya funciona)', normalizarConsulta("papel bond 30") === "papel bond 30");
caso('v53: "tinta hp 954" queda igual', normalizarConsulta("tinta hp 954") === "tinta hp 954");
// no debe tocar un código de modelo con x interna que NO es dimensión (letra pegada) — "x" entre DÍGITOS solo.
caso('v53: "TN-830XL" no se parte (la x no está entre dígitos)', normalizarConsulta("toner TN-830XL") === "toner TN-830XL");
// wiring: la normalizada se agrega como intento adicional en buscarProducto.
caso("v53: buscarProducto agrega la consulta normalizada como reintento", /norm && norm !== consulta \? \[norm\] : \[\]/.test(src));
caso("v53: SYSTEM_PROMPT tiene la regla de MEDIDAS/DIMENSIONES", /MEDIDAS \/ DIMENSIONES/.test(SYSTEM_PROMPT) && /NUNCA "papel bond 30 pulgadas"/.test(SYSTEM_PROMPT));
caso("v53: normalizarConsulta wireada como reintento", /norm && norm !== consulta \? \[norm\] : \[\]/.test(src));

// --- v54: telemetría + intake-first + tickets sin ruido + modelos espaciados ----------------------
console.log("v54 pagos que se escapaban (auditoría 17-jul)");
// Casos REALES de la cola de tickets que cruzaron INTERRUPT_RE:
for (const t of ["Adjunto pago realizado", "adjunto el pago", "el pago ya está hecho",
  "Hola demoran para la transaccion es que me urge", "quiero hacer el pago antes de que venza el plazo"]) {
  caso(`v54: "${t}" → abstención`, INTERRUPT_RE.test(t));
}
// revisión adversarial v54 — formas PASIVAS/impersonales de pago completado también abstienen:
for (const t of ["el pago fue realizado esta mañana", "ya se realizó la transferencia", "ya se hizo el pago",
  "transferencia realizada", "acabamos de pagar", "quiero hacer el pago antes de que venza el plazo"]) {
  caso(`v54: "${t}" → abstención (pasiva/impersonal)`, INTERRUPT_RE.test(t));
}
// las preguntas de MÉTODO siguen respondibles (incl. los FP que la revisión adversarial encontró y cerró):
for (const t of ["¿cómo pago?", "¿cómo hago el pago?", "¿aceptan yappy?", "¿qué formas de pago tienen?", "quiero pagar con tarjeta",
  "¿puedo hacer el pago antes de recoger el producto?", "¿se puede hacer el pago antes por la web?"]) {
  caso(`v54: "${t}" NO → abstención`, !INTERRUPT_RE.test(t));
}

console.log("v54 precio distribuidor → asesor");
for (const t of ["consulta si en la pagina ya es Precio de Distribuidor?", "¿manejan precio de distribuidor?",
  "precios para mayoristas?", "¿venden al por mayor?", "¿me dan el precio del distribuidor?"]) {
  caso(`v54: "${t}" → HANDOFF_RE`, HANDOFF_RE.test(t));
}
caso('v54: "precio del toner" NO → handoff', !HANDOFF_RE.test("precio del toner"));
caso('v54: "¿son distribuidores autorizados de HP?" NO → handoff', !HANDOFF_RE.test("¿son distribuidores autorizados de HP?"));

console.log("v54 modelos espaciados (caso PFI-107/IPF785)");
caso('v54: "tinta para Canon IPF 785" → junta IPF785', juntarModelosEspaciados("tinta para Canon IPF 785") === "tinta para Canon IPF785");
caso('v54: "PFI 107" → "PFI107"', juntarModelosEspaciados("tinta PFI 107 magenta") === "tinta PFI107 magenta");
caso('v54: "cinta Epson LQ 590II" → junta LQ590II', juntarModelosEspaciados("cinta Epson LQ 590II") === "cinta Epson LQ590II");
// protege el fix v53: palabras comunes + número NO se juntan.
caso('v54: "papel bond 30" queda intacto', juntarModelosEspaciados("papel bond 30") === "papel bond 30");
caso('v54: "rollo 36 x 150" queda intacto', juntarModelosEspaciados("rollo 36 x 150") === "rollo 36 x 150");
caso('v54: "tinta 664" queda intacta', juntarModelosEspaciados("tinta 664 canon") === "tinta 664 canon");
caso("v54: buscarProducto agrega la variante juntada como último intento", /\.\.\.\(junta !== consulta \? \[junta\] : \[\]\)/.test(src));

console.log("v54 tickets sin ruido");
// motivo enriquecido: el "Si" de una ráfaga hereda la pregunta real que lo precedió (caso Deli Deli).
const H_DELI = [{ role: "user", content: "Tienen rollo de vellum 36 x 150?" }, { role: "assistant", content: "Está agotado…" }, { role: "user", content: "Si" }];
caso('v54: motivoTicket("Si", historial) hereda la pregunta', motivoTicket("Si", H_DELI) === "Tienen rollo de vellum 36 x 150? » Si");
caso('v54: motivoTicket("[imagen]", historial) hereda la pregunta', motivoTicket("[imagen]", H_DELI).startsWith("Tienen rollo de vellum"));
caso('v54: motivo sustancial queda tal cual', motivoTicket("Tienen cintas dascom", H_DELI) === "Tienen cintas dascom");
caso('v54: sin historial no truena', motivoTicket("", []) === "(sin texto)" && motivoTicket("Si", []) === "Si");
for (const t of ["Si", "gracias", "Precio", "?", "[imagen]", "ok"]) caso(`v54: "${t}" es motivo trivial`, MOTIVO_TRIVIAL_RE.test(t));
caso('v54: "Deseo saber cuando llegan?" NO es trivial', !MOTIVO_TRIVIAL_RE.test("Deseo saber cuando llegan?"));
// dedup + wiring en el source real: helper definido y usado en los 3 caminos (normal, asistencia, fallback).
caso("v54: insertarTicketPromesa wireado en los 3 caminos", (src.match(/insertarTicketPromesa\(/g) || []).length >= 4);
caso("v54: dedup de tickets presente (promesa_dedup)", /promesa_dedup/.test(src) && /\.eq\("resuelto", false\)\.in\("origen", \["bot_promise", "bot_fallback"\]\)/.test(src));
caso("v54: el dedup loggea el motivo suprimido (pérdida cero)", /promesa_dedup", true, \{ waId, motivo/.test(src));

console.log("v54 telemetría de inventario + prompt");
caso("v54: inventarioShopify loggea fallos (inventario_fallo)", (src.match(/inventario_fallo/g) || []).length >= 3);
caso("v54: distingue token muerto (token_401_403)", /token_401_403/.test(src));
caso("v54: SYSTEM_PROMPT tiene CONSUMIBLE SIN MODELO (intake primero)", /CONSUMIBLE SIN MODELO/.test(SYSTEM_PROMPT) && /PREGUNTA el modelo/.test(SYSTEM_PROMPT));
caso("v54: SYSTEM_PROMPT ofrece el botón de aviso cuando no hay stock", /AVISO AUTOMÁTICO/.test(SYSTEM_PROMPT) && /Av[ií]same cuando est[eé] disponible/.test(SYSTEM_PROMPT));

// --- v55: ranking por título (regresión TN-830XL del 17-jul) --------------------------------------
console.log("v55 ranking por título");
// El caso REAL: "toner TN830XL" → v52 (body) hacía que el 1er intento matcheara la IMPRESORA HL-L2460DW
// (su ficha menciona el tóner) y la escalera se detenía ahí, sin llegar al intento "TN-830XL" que
// encuentra el tóner. Con v55, un hit sin el código en NINGÚN título no corta la escalera.
const CODS_TN = modelosEn("toner TN830XL");
caso('v55: modelosEn("toner TN830XL") extrae el código', CODS_TN.includes("TN830XL"));
caso("v55: título de la IMPRESORA no matchea el código (hit tangencial)",
  !algunTituloConCodigo(["Impresora Multifuncional Blanco y Negro Brother HL-L2460DW | 36 ppm"], CODS_TN));
caso("v55: título del TÓNER sí matchea (con guion vs sin guion)",
  algunTituloConCodigo(["Toner Brother TN-830XL | DCP-L2640DW | 3000 páginas"], CODS_TN));
caso("v55: normaliza en ambas direcciones (código con guion vs título pegado)",
  algunTituloConCodigo(["Tinta Canon PFI107M para imagePROGRAF IPF785"], ["PFI-107M"]));
caso("v55: lista de títulos vacía → false (no corta nada)", !algunTituloConCodigo([], CODS_TN));
caso("v55: título null tolerado", !algunTituloConCodigo([null], CODS_TN));
// wiring en el source real: el gate de título + el fallback que preserva el comportamiento pre-v55.
caso("v55: gate de título en la escalera", /if \(codigos\.length && !algunTituloConCodigo\(top\.map/.test(src));
caso("v55: fallback enriquecido tras la escalera (comportamiento pre-v55 preservado)",
  /if \(!fallback\) fallback = top;/.test(src) && /return await enriquecer\(fallback\)/.test(src));
caso("v55: el hit directo usa el mismo enriquecedor", /return await enriquecer\(top\)/.test(src));

// --- v56: tienda física = compra directa (no solo punto de retiro) --------------------------------
console.log("v56 tienda física compra directa");
// Caso real (17-jul): el bot presentó la tienda como "punto de retiro" y dijo "al comprar en línea,
// elige Recoger en tienda" — como si hubiera que comprar por la web primero. La tienda es física y
// se puede llegar a comprar directo; el retiro del checkout es OPCIONAL.
caso("v56: SYSTEM_PROMPT tiene la regla TIENDA FÍSICA — COMPRA DIRECTA", /TIENDA FÍSICA — COMPRA DIRECTA/.test(SYSTEM_PROMPT));
caso("v56: prohíbe presentar la tienda como solo punto de retiro", /NUNCA presentes la tienda como "solo un punto de retiro"/.test(SYSTEM_PROMPT));
caso('v56: "Recoger en tienda" es opcional, no requisito', /menci[oó]nala como opcional, no como requisito/.test(SYSTEM_PROMPT));
caso("v56: puede llegar y comprar sin compra web previa", /LLEGAR Y COMPRAR directamente/.test(SYSTEM_PROMPT) && /sin pedido previo ni compra por la web/.test(SYSTEM_PROMPT));

// --- v57: calcular_cotizacion (aritmética de cantidades / varios productos en CÓDIGO) -------------
console.log("v57 calcular_cotizacion");
// El caso REAL que falló (conv 50760979705): 2× PG-145XL $19.80 + 2× CL-146XL $23.00. El bot sumó los
// totales que YA tenían ITBMS ($42.38 + $49.22 = $91.60), los tomó como subtotal y volvió a aplicar el 7%
// → dijo $98.60. Correcto: subtotal $85.60, ITBMS $5.99, total $91.59.
const COT_REAL = JSON.parse(calcularCotizacion([
  { descripcion: "Tinta Canon PG-145XL Negro", precio_usd: "19.80", cantidad: 2 },
  { descripcion: "Tinta Canon CL-146XL Color", precio_usd: "23.00", cantidad: 2 },
]));
caso("v57: caso real → subtotal 85.60 (NO 91.60)", COT_REAL.subtotal_usd === "85.60");
caso("v57: caso real → ITBMS 5.99 (una sola vez sobre el subtotal)", COT_REAL.itbms_7pct === "5.99");
caso("v57: caso real → total 91.59 (NO el doble-ITBMS 98.60)", COT_REAL.total_con_itbms === "91.59");
caso("v57: el total mal ($98.60) NO reaparece por ningún lado", !/98\.60/.test(JSON.stringify(COT_REAL)));
caso("v57: líneas por producto (39.60 y 46.00)",
  COT_REAL.lineas[0].subtotal_linea_usd === "39.60" && COT_REAL.lineas[1].subtotal_linea_usd === "46.00");
caso("v57: respuesta_sugerida trae el total en negrita *$91.59*", /\*\$91\.59\*/.test(COT_REAL.respuesta_sugerida));
// coherencia con conItbms para 1 unidad (misma base de redondeo determinista).
const COT_UNO = JSON.parse(calcularCotizacion([{ descripcion: "X", precio_usd: 19.80, cantidad: 1 }]));
caso("v57: 1 unidad coincide con conItbms (21.19)", COT_UNO.total_con_itbms === conItbms("19.80").total_con_itbms && COT_UNO.total_con_itbms === "21.19");
// acepta el precio como número o como string con símbolo ($) — el precio_usd de buscar_producto es string.
const COT_STR = JSON.parse(calcularCotizacion([{ precio_usd: "$23.00", cantidad: 2 }]));
caso("v57: parsea '$23.00' → subtotal 46.00, total 49.22", COT_STR.subtotal_usd === "46.00" && COT_STR.total_con_itbms === "49.22");
// cantidad ausente/rara → 1; cantidad enorme → tope 999 (anti-abuso); nunca truena.
const COT_DEFQ = JSON.parse(calcularCotizacion([{ precio_usd: "10.00" }]));
caso("v57: cantidad ausente → 1", COT_DEFQ.lineas[0].cantidad === 1 && COT_DEFQ.subtotal_usd === "10.00");
const COT_CAP = JSON.parse(calcularCotizacion([{ precio_usd: "1.00", cantidad: 100000 }]));
caso("v57: cantidad enorme → tope 999", COT_CAP.lineas[0].cantidad === 999);
// errores → objeto de error (el modelo deriva a buscar_producto), nunca cotiza basura ni truena.
caso("v57: sin items → error sin_items", JSON.parse(calcularCotizacion([])).error === "sin_items");
caso("v57: items no-array → error sin_items", JSON.parse(calcularCotizacion(null)).error === "sin_items");
caso("v57: precio inválido → error precio_invalido", JSON.parse(calcularCotizacion([{ precio_usd: "abc", cantidad: 2 }])).error === "precio_invalido");
caso("v57: precio 0 → error (no cotiza gratis)", JSON.parse(calcularCotizacion([{ precio_usd: 0, cantidad: 2 }])).error === "precio_invalido");
// wiring en el source real: tool definida, cableada en el dispatch, y en el whitelist de asistencia.
caso("v57: index.ts define la tool calcular_cotizacion", /name: "calcular_cotizacion"/.test(src));
caso("v57: index.ts cablea calcularCotizacion en el dispatch", /calcularCotizacion\(\(block\.input as any\)\.items\)/.test(src));
caso("v57: asistencia incluye calcular_cotizacion", /calcular_cotizacion/.test(assistFilter));
caso("v57: SYSTEM_PROMPT tiene la regla CANTIDADES / VARIOS PRODUCTOS con calcular_cotizacion", /CANTIDADES \/ VARIOS PRODUCTOS/.test(SYSTEM_PROMPT) && /calcular_cotizacion/.test(SYSTEM_PROMPT));
caso("v57: SYSTEM_PROMPT advierte del doble ITBMS (una sola vez sobre el subtotal)", /dos veces/.test(SYSTEM_PROMPT) && /una sola vez/i.test(SYSTEM_PROMPT));

// --- v58: envío al interior ofrece AMBAS opciones (retiro + puerta a puerta) ----------------------
console.log("v58 envío interior domicilio");
// Caso real (Chitré): el bot ofreció solo "retiro en sucursal $6.00" y omitió el "$9.00 puerta a puerta"
// que YA está en store_facts.tarifa_interior. La data tiene las dos; la regla del prompt (v46) enmarcaba
// el interior solo como retiro → el modelo dejaba fuera el domicilio.
caso("v58: SYSTEM_PROMPT ofrece las DOS formas de entrega del interior", /DOS formas de entrega y debes ofrecer las DOS/.test(SYSTEM_PROMPT));
caso("v58: SYSTEM_PROMPT nombra la entrega a domicilio puerta a puerta", /ENTREGA A DOMICILIO puerta a puerta por Servientrega/.test(SYSTEM_PROMPT));
caso("v58: SYSTEM_PROMPT manda relayar los dos precios de tarifa_interior sin omitir el domicilio", /tarifa_interior/.test(SYSTEM_PROMPT) && /NUNCA omitas el de puerta a puerta/.test(SYSTEM_PROMPT));
// no rompe el guardrail v46: sigue prohibido decir "tenemos el punto/sucursal en [ciudad]".
caso("v58: sigue prohibiendo 'tenemos el punto/sucursal' (guardrail v46 intacto)", /NUNCA digas "tenemos el punto/.test(SYSTEM_PROMPT));

// v58: TODO el envío lleva ITBMS 7% (decisión de Gerencia) — frasearTarifa (ciudad) ahora muestra
// base + ITBMS + total, calculado en código (nunca de memoria), igual que los precios de producto.
// Reusa los veredictos mock ya calculados arriba (rToc retiro $6, rPac domicilio $9, rEd propia $6, rCa asesor).
caso("v58: retiro ciudad muestra ITBMS ($6.00 → $6.42)", /6\.00 \+ ITBMS \(7%\) = B\/\.6\.42/.test(rToc.respuesta_sugerida));
caso("v58: domicilio ciudad muestra ITBMS ($9.00 → $9.63)", /9\.00 \+ ITBMS \(7%\) = B\/\.9\.63/.test(rPac.respuesta_sugerida));
caso("v58: envío propio muestra ITBMS ($6.00 → $6.42)", /6\.00 \+ ITBMS \(7%\) = B\/\.6\.42/.test(rEd.respuesta_sugerida));
caso("v58: método asesor sigue sin precio (no ITBMS espurio)", !/ITBMS/.test(rCa.respuesta_sugerida));
// ambiguo también cotiza con ITBMS en cada opción.
caso("v58: ambiguo muestra ITBMS por opción", /ITBMS \(7%\) = B\/\.6\.42/.test(rSj.respuesta_sugerida));

// --- v59: SHADOW de búsqueda (parser del Catalog MCP, probado con la respuesta REAL) --------------
console.log("v59 parseCatalogoMCP");
// Shape EXACTO capturado del endpoint real (search_catalog "toner TN830XL"): result.content = [ {text: JSON
// con products[...]}, {text: aviso de deprecación NO-JSON} ]. Cada product: title, price_range.min.amount
// (minor units), variants[0].availability.available, variants[0].id, url.
const MCP_TN = { result: { content: [
  { type: "text", text: JSON.stringify({ products: [
    { title: "Toner Brother TN-830XL | Para DCP-L2640DW / HL-L2460DW | 3,000 Páginas",
      url: "https://quickservicepanama.com/products/toner-brother-tn-830xl-dcp-l2640dw-3000-paginas",
      price_range: { min: { amount: 11600, currency: "USD" }, max: { amount: 11600, currency: "USD" } },
      variants: [{ id: "gid://shopify/ProductVariant/42325644673094", availability: { available: true } }] },
  ] }) },
  { type: "text", text: "DEPRECATION NOTICE: This tool is served by the Storefront MCP server at /api/mcp and will no longer be accessible after August 31, 2026." },
] } };
const rMcp = parseCatalogoMCP(MCP_TN);
caso("v59: parsea el título del tóner correcto", rMcp.length === 1 && rMcp[0].titulo.includes("TN-830XL"));
caso("v59: precio de minor units a dólares (11600 → 116.00)", rMcp[0].precio_usd === "116.00");
caso("v59: disponible=true", rMcp[0].disponible === true);
caso("v59: variant_id presente (para el carrito de fase 2)", rMcp[0].variant_id === "gid://shopify/ProductVariant/42325644673094");
caso("v59: url presente", rMcp[0].url && rMcp[0].url.includes("/products/"));
caso("v59: IGNORA el 2º bloque (aviso de deprecación, no-JSON) sin trunar", Array.isArray(rMcp) && rMcp.length === 1);
// robustez: respuestas raras nunca truenan y devuelven [] o campos null.
caso("v59: content solo con deprecación → []", parseCatalogoMCP({ result: { content: [{ type: "text", text: "DEPRECATION..." }] } }).length === 0);
caso("v59: respuesta vacía/null → []", parseCatalogoMCP({}).length === 0 && parseCatalogoMCP(null).length === 0 && parseCatalogoMCP(undefined).length === 0);
caso("v59: producto sin precio/variantes → campos null, no truena", (() => {
  const r = parseCatalogoMCP({ result: { content: [{ type: "text", text: JSON.stringify({ products: [{ title: "X" }] }) }] } });
  return r.length === 1 && r[0].precio_usd === null && r[0].disponible === null && r[0].variant_id === null;
})());
caso("v59: multi-producto conserva el orden (ranking del MCP)", (() => {
  const r = parseCatalogoMCP({ result: { content: [{ type: "text", text: JSON.stringify({ products: [{ title: "A" }, { title: "B" }] }) }] } });
  return r.length === 2 && r[0].titulo === "A" && r[1].titulo === "B";
})());
// wiring en el source real: gate OFF por default, endpoint configurable, background (no bloquea al cliente).
caso("v59: shadow gateado por BUSQUEDA_SHADOW (default OFF)", /const BUSQUEDA_SHADOW = \(Deno\.env\.get\("BUSQUEDA_SHADOW"\) \?\? ""\)\.trim\(\) === "1"/.test(src));
caso("v59: endpoint configurable (SHOPIFY_CATALOG_MCP_URL, default legacy /api/mcp)", /SHOPIFY_CATALOG_MCP_URL/.test(src) && /\/api\/mcp/.test(src));
caso("v59: buscarCatalogoMCP llama search_catalog", /name: "search_catalog"/.test(src));
caso("v59: shadow corre en background (waitUntil, no await en el camino del cliente)", /EdgeRuntime\.waitUntil\(st\)/.test(src) && /BUSQUEDA_SHADOW && block\.name === "buscar_producto"/.test(src));
caso("v59: loguea a job_log busqueda_shadow con el flag mcp_gana", /"busqueda_shadow"/.test(src) && /mcp_gana:/.test(src));
caso("v59: healthcheck expone busqueda_shadow", /busqueda_shadow: BUSQUEDA_SHADOW/.test(src));

// --- resumen --------------------------------------------------------------------------------------
console.log(`\n${ok} OK, ${mal} FALLA${mal === 1 ? "" : "S"}`);
if (mal > 0) process.exit(1);
console.log("✅ golden tests: todo verde");
