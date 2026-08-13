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
const esComboTitulo = extraerFuncion("esComboTitulo");
const clavesFamilia = extraerFuncion("clavesFamilia");
const tipoPedido = extraerFuncion("tipoPedido");
const tituloDeTipo = extraerFuncion("tituloDeTipo");
const cortarSesionVieja = extraerFuncion("cortarSesionVieja");
const perfilUcpAgente = extraerFuncion("perfilUcpAgente");
const extraerFolletoPdf = extraerFuncion("extraerFolletoPdf");
const datosOferta = extraerFuncion("datosOferta");
const rerankearCombos = extraerFuncion("rerankearCombos");
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
caso("stockTexto 87 → cantidad", stockTexto(true, 87) === "✅ 87 unidades disponibles");
caso("stockTexto 2 → stock bajo", stockTexto(true, 2).includes("stock bajo"));
caso("stockTexto undefined+disponible → asesor", stockTexto(true, undefined).includes("asesor"));
caso("stockTexto no disponible → sin stock", stockTexto(false, 0).includes("sin stock"));
// v61.4 — emoji de disponibilidad EN CÓDIGO (destaca en el chat; el prompt manda conservarlo).
caso("v61.4: ✅ cuando hay unidades", stockTexto(true, 9).startsWith("✅"));
caso("v61.4: ⚠️ en stock bajo", stockTexto(true, 2).startsWith("⚠️"));
caso("v61.4: ❌ sin stock", stockTexto(false, 0).startsWith("❌"));
caso("v61.4: 🔎 cuando hay que verificar", stockTexto(true, undefined).startsWith("🔎"));
caso("v61.4: el prompt manda CONSERVAR el emoji", /CONSERVANDO el emoji/.test(SYSTEM_PROMPT));
// no debe romper el detector de tickets de promesa (busca "sin stock" en la RESPUESTA del bot).
caso("v61.4: 'sin stock' con emoji sigue disparando el ticket de promesa",
  prometeSeguimientoSinResolver("❌ sin stock — un asesor verifica el inventario físico y le confirma"));
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
// v65: los gates de asistencia ahora evalúan la RÁFAGA completa (mismo guard que el flujo normal v61.3).
caso("v50/v65: INTERRUPT_RE + HANDOFF_RE gatean la asistencia sobre la RÁFAGA", /!interrumpe && !HANDOFF_RE\.test\(rafagaHandoff\)\s*&&\s*\(BASIC_INFO_RE\.test\(texto\) \|\| NEEDS_TOOL_RE\.test\(texto\)\)/.test(src) && /const interrumpe = INTERRUPT_RE\.test\(rafagaHandoff\)/.test(src));
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
    { id: "gid://shopify/Product/7740515942470",
      title: "Toner Brother TN-830XL | Para DCP-L2640DW / HL-L2460DW | 3,000 Páginas",
      description: { html: "<p>Compatible con Brother HL-L2460DW</p>" },
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
caso("v59/v60: shadow en background y AUTO-APAGADO cuando el MCP es primario", /EdgeRuntime\.waitUntil\(st\)/.test(src) && /BUSQUEDA_SHADOW && !BUSQUEDA_MCP && block\.name === "buscar_producto"/.test(src));
caso("v59: loguea a job_log busqueda_shadow con el flag mcp_gana", /"busqueda_shadow"/.test(src) && /mcp_gana:/.test(src));
caso("v59: healthcheck expone busqueda_shadow", /busqueda_shadow: BUSQUEDA_SHADOW/.test(src));

// --- v59.2: envío gratis >$300 — distinción ciudad (domicilio) vs interior (sucursal Servientrega) -
console.log("v59.2 envío gratis interior");
// Decisión de Gerencia: >$300 gratis en todo el país, PERO en el interior el envío gratis es a la sucursal
// Servientrega para RETIRO (no puerta a puerta). El bot debe SIEMPRE aclarar esa distinción.
// v60.2 (corrección): el envío gratis >$300 es EXCLUSIVO del checkout web; por WhatsApp NO aplica.
caso("v60.2: ENVÍO GRATIS es SOLO por la WEB", /ENVÍO GRATIS — SOLO compra por la WEB/.test(SYSTEM_PROMPT) && /ÚNICAMENTE cuando el cliente COMPLETA la compra en línea por la web/.test(SYSTEM_PROMPT));
caso("v60.2: por WhatsApp el envío gratis NO aplica (tarifa normal)", /por WhatsApp, el envío gratis NO aplica/.test(SYSTEM_PROMPT));
caso("v60.2: prohíbe decir 'califica/sigue calificando para envío gratis' en cotización WhatsApp", /NUNCA digas "califica" ni "sigue calificando para envío gratis"/.test(SYSTEM_PROMPT));
caso("v60.2: cuando aplica (web) interior = sucursal Servientrega retiro, no puerta a puerta", /sucursal Servientrega para RETIRO, no puerta a puerta/.test(SYSTEM_PROMPT));
// wiring del despacho (shopify-webhook, no copilot): fuente real chequeada por si la lógica se toca.
const shopifySrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "shopify-webhook", "index.ts"), "utf8");
caso("v59.2: shopify-webhook rescata envío gratis por zona (esEnvioGratis + esFlotaPropia)", /esEnvioGratis\(shopifyOrder\)/.test(shopifySrc) && /esFlotaPropia\(zona\)/.test(shopifySrc));
// F4/v31 (back-port de prod 13-ago): esFlotaPropia además EXCLUYE ambito 'interior' (v2 del resolver
// también resuelve interior con estado 'ok' — sin esta guardia, un interior 'ok' se despacharía a Shipday).
caso("v59.2: rescate solo despacha flota PROPIA (interior/servientrega/retiro → no Shipday)", /if \(zona\.estado === 'ok'\) return zona\.ambito !== 'interior' && zona\.metodo === 'propia';/.test(shopifySrc) && /envio_gratis_omitido/.test(shopifySrc));
// F4/v31/v32 (back-port de prod 13-ago): flags de ruteo + retiro en tienda + upsert para TODO pedido.
caso("F4: calcularFlag cubre los 5 flags de venta imposible/mal ruteada", ["direccion_no_reconocida", "sin_servicio_comarca", "eligio_ciudad_siendo_interior", "eligio_interior_siendo_ciudad", "domicilio_imposible_z4a"].every((f) => shopifySrc.includes(`'${f}'`)) && /pedido_flag/.test(shopifySrc));
caso("v32: retiro en tienda NO clasifica la dirección (sin zona ni flag)", /esRetiroEnTienda\(shopifyOrder\)/.test(shopifySrc) && /retiro \? null : await resolverTarifa/.test(shopifySrc));
caso("F4: upsertPedido corre para TODO pedido (antes del gate !despachar) con zona+flag", (() => {
  const iUp = shopifySrc.indexOf("await upsertPedido({");
  const iGate = shopifySrc.indexOf("if (!despachar) {");
  return iUp > -1 && iGate > -1 && iUp < iGate && /envio_flag: flag/.test(shopifySrc) && /zona_estado: zona\?\.estado \?\? null/.test(shopifySrc);
})());
caso("F4: pedido del interior → metodo servientrega y zona 'INT provincia · lugar'", /zona\.ambito === 'interior' \? 'servientrega'/.test(shopifySrc) && /INT \$\{/.test(shopifySrc));
// Reconciliación 13-ago: el PUENTE resuelve zona con el RPC resolver_tarifa_v2 (metro E interior);
// el COPILOTO sigue llamando resolver_tarifa (wrapper con telemetría → resolver_tarifa_core, solo metro).
const dbSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "_shared", "db.ts"), "utf8");
caso("F4: db.ts del puente llama a resolver_tarifa_v2 (metro+interior)", /\/rpc\/resolver_tarifa_v2/.test(dbSrc));
caso("F4: el copiloto sigue en resolver_tarifa (wrapper de telemetría, solo metro)", /rpc\("resolver_tarifa"/.test(src));
caso("F4: ZonaResuelta conoce sin_servicio + ambito/provincia/lugar", /'sin_servicio'/.test(dbSrc) && /ambito\?: 'metro' \| 'interior'/.test(dbSrc));
// Reconciliación 13-ago (parche wati-address de prod): el PATCH actualiza lat/lng cuando vienen (intent
// v65) y la LIMPIEZA de pin/referencia/maps viejos quedó acotada a esCorreccion (flujo v2 de WATI).
caso("v65/es_correccion: el PATCH actualiza lat/lng y la limpieza es por corrección", /patch\.latitude = contact\.latitude/.test(dbSrc) && /patch\.latitude = null/.test(dbSrc) && /esCorreccion\?: boolean/.test(dbSrc) && /opts\.esCorreccion\) patch\.maps_url = null/.test(dbSrc));
// ANTI-REGRESIÓN (deriva 13-ago): el wati-order de PROD perdió la escritura a `pedidos` (su árbol no
// tenía el helper v48) — el repo la RESTAURA. Si este lock falla, el círculo de pedidos pierde la pata wati.
const watiOrderSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "wati-order", "index.ts"), "utf8");
caso("v48: wati-order ESCRIBE pedidos (fuente wati) — prod lo había perdido", /upsertPedido\(\{/.test(watiOrderSrc) && /fuente: 'wati'/.test(watiOrderSrc));
// Parche wati-address de prod ADOPTADO: valida variables WATI sin resolver, descarta negativas en prosa,
// filtra maps por FORMA (looksLikeLocation) y propaga es_correccion al upsert.
const watiAddrSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "wati-address", "index.ts"), "utf8");
caso("wati-address: parche prod adoptado (es_correccion + NEGATIVAS + validación)", /esCorreccion/.test(watiAddrSrc) && /NEGATIVAS/.test(watiAddrSrc) && /looksUnresolved\(telefono\)/.test(watiAddrSrc) && /looksLikeLocation\(mapsRaw\)/.test(watiAddrSrc));
const shipdaySrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "_shared", "shipday.ts"), "utf8");
caso("shipday.ts: helpers del parche prod (looksLikeLocation/looksUnresolved/isValidPhone)", /export function looksLikeLocation/.test(shipdaySrc) && /export function looksUnresolved/.test(shipdaySrc) && /export function isValidPhone/.test(shipdaySrc));
// ANTI-REGRESIÓN: el watiapi.ts del árbol viejo de prod NO tenía el sender de plantillas (17-jul) ni el
// .trim() v40 — el repo los conserva (los necesita el cron reengage-expired).
const watiapiSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "_shared", "watiapi.ts"), "utf8");
caso("watiapi.ts: conserva sendWatiTemplateMessage + .trim() v40 (el árbol viejo de prod los perdía)", /export async function sendWatiTemplateMessage/.test(watiapiSrc) && /\.trim\(\)/.test(watiapiSrc));

// --- v60: FLIP a search_catalog (Catalog MCP) como motor primario ---------------------------------
console.log("v60 flip a search_catalog");
// parseCatalogoMCP ahora también da `id` (para inventarioShopify) y `descripcion_html` (para especificaciones).
caso("v60: parseCatalogoMCP devuelve id (gid, para inventarioShopify)", rMcp[0].id === "gid://shopify/Product/7740515942470");
caso("v60: parseCatalogoMCP devuelve descripcion_html (para especificaciones)", /Compatible con Brother/.test(rMcp[0].descripcion_html || ""));
// prompt: la regla del guardrail (coincidencia aproximada → pedido especial).
caso("v60: SYSTEM_PROMPT tiene la regla COINCIDENCIA APROXIMADA / PEDIDO ESPECIAL", /COINCIDENCIA APROXIMADA \/ PEDIDO ESPECIAL/.test(SYSTEM_PROMPT) && /PEDIDO ESPECIAL/.test(SYSTEM_PROMPT));
caso("v60: la regla prohíbe presentar la alternativa como el modelo pedido", /NUNCA como si fueran el modelo pedido/.test(SYSTEM_PROMPT));
// wiring en el source real:
caso("v60: gated por BUSQUEDA_MCP (default OFF)", /const BUSQUEDA_MCP = \(Deno\.env\.get\("BUSQUEDA_MCP"\) \?\? ""\)\.trim\(\) === "1"/.test(src));
caso("v60: MCP primario en buscarProducto", /if \(BUSQUEDA_MCP\) \{/.test(src) && /const mcpCrudo = await buscarCatalogoMCP\(consulta\)/.test(src));
// v60.1: el cross-check viejo (que devolvía los vecinos del MCP aunque suggest confirmara que el producto
// existía) se reemplazó por el flujo HÍBRIDO: código-no-en-MCP → la escalera literal busca el EXACTO;
// los vecinos quedan de respaldo "aproximada" solo si la escalera tampoco halla.
caso("v60.1: el cross-check viejo (exacto=suggestN>0) fue RETIRADO", !/exacto = suggestN > 0/.test(src));
// v61: el guard pasó a evaluarse sobre el top-5 ORIGINAL del MCP (pedir 10 no debe ensanchar el "exacto").
caso("v60.1/v61: código no en títulos MCP → vecinos a mcpAprox y la escalera corre", /mcpAprox = top;/.test(src) && /!codigos\.length \|\| algunTituloConCodigo\(mcp\.slice\(0, 5\)\.map/.test(src));
caso("v60.1: aproximada sale AL FINAL (tras el fallback v55 de la escalera)", (() => {
  const iFb = src.indexOf("if (fallback) {");
  const iAprox = src.indexOf("if (mcpAprox) {");
  return iFb > -1 && iAprox > -1 && iFb < iAprox && /enriquecer\(mcpAprox, false\)/.test(src);
})());
caso("v60.1: SYSTEM_PROMPT tiene ALTERNATIVAS CON CRITERIO (conservar marca/atributos)", /ALTERNATIVAS CON CRITERIO/.test(SYSTEM_PROMPT) && /CONSERVA los atributos/.test(SYSTEM_PROMPT));
caso("v60.1: prohíbe B/N como sustituto de color sin aclarar", /NUNCA ofrezcas una de blanco y negro como sustituto de una a color/.test(SYSTEM_PROMPT));
caso("v60.1: manda búsqueda NUEVA con los atributos antes de cambiar marca/categoría", /impresora láser color multifuncional Canon/.test(SYSTEM_PROMPT));
caso("v60: enriquecer señaliza 'aproximada' (alternativas) cuando no es exacto", /if \(exacto\) return JSON\.stringify\(enriquecidos\)/.test(src) && /coincidencia: "aproximada"/.test(src) && /alternativas: enriquecidos/.test(src));
caso("v60: fallback de confiabilidad — MCP caído cae a la escalera suggest.json (busqueda_mcp_fallo)", /busqueda_mcp_fallo/.test(src) && /motor legacy \/ fallback de confiabilidad/.test(src));
caso("v60: healthcheck expone busqueda_mcp", /busqueda_mcp: BUSQUEDA_MCP/.test(src));

// --- v61: combos de tintas (re-ranking + límite MCP + sonda) --------------------------------------
console.log("v61 combos de tintas");
// Caso REAL (28-jul, Epson T544): el MCP llenó el top-5 con las 4 individuales + el combo x3, y el COMBO x4
// ($36, más barato que las 4 sueltas a $43, 31 uds) quedó en posición 6+ → el bot cotizó $7 de más.
caso("v61: esComboTitulo detecta combo/juego/pack/kit", esComboTitulo("Combo de Tintas Epson 544 Original – Combo x 4 Colores") && esComboTitulo("Juego de Tintas Epson T504 | Los 4 colores") && esComboTitulo("Combo Canon GI-16 — Kit Completo 4 Tintas"));
caso("v61: esComboTitulo NO marca una tinta individual", !esComboTitulo("Tinta Epson T544120 - Negro | Epson 544") && !esComboTitulo("Toner Brother TN-830XL"));
caso("v61: esComboTitulo tolera null/vacío", !esComboTitulo(null) && !esComboTitulo(""));

// El set REAL que devolvió el MCP para "T544" (combo x4 en posición 6, fuera del top-5 viejo).
const MCP_T544 = [
  { titulo: "Tinta Epson T544120 - Negro | Epson 544 | Ecotank L3210/L3250", precio_usd: "11.00" },
  { titulo: "Tinta Epson T544220 - Cyan | Epson 544", precio_usd: "11.00" },
  { titulo: "Tinta Epson T544320 - Magenta| Epson 544", precio_usd: "11.00" },
  { titulo: "Tinta Epson T544420 - Amarillo | Epson 544", precio_usd: "11.00" },
  { titulo: "Tinta Epson 544 Original – Combo x 3 Colores (Cian, Magenta, Amarillo)", precio_usd: "29.00" },
  { titulo: "Combo de Tintas Epson 544 Original – Combo x 4 Colores (Negro, Cian, Magenta, Amarillo)", precio_usd: "36.00" },
  { titulo: "Pack de 2 Botellas de Tinta Epson 544 Negra", precio_usd: "18.50" },
  { titulo: "Tinta Epson T664120 - Negro", precio_usd: "9.00" },
];
const top_T544 = rerankearCombos(MCP_T544, modelosEn("tinta epson T544"), 6);
caso("v61: el COMBO x4 (pos 6 del MCP) ENTRA al set entregado al modelo", top_T544.some((p) => /Combo x 4 Colores/.test(p.titulo)));
caso("v61: los combos de la familia van ARRIBA (la mejor oferta primero)", esComboTitulo(top_T544[0].titulo));
// REGRESIÓN que cazó la revisión adversarial: con RESERVA=2 y max=5 la tinta AMARILLA quedaba fuera del set
// (el propio caso insignia perdía un color). Con max=6 entra la familia COMPLETA + los dos combos.
caso("v61: las 4 individuales SOBREVIVEN (la amarilla T544420 no se expulsa)",
  ["T544120", "T544220", "T544320", "T544420"].every((c) => top_T544.some((p) => p.titulo.includes(c))));
caso("v61: set acotado a 6", top_T544.length === 6);
// el combo se reconoce por la forma corta del código (su título dice "Epson 544", no "T544")
caso("v61: clavesFamilia T544 → también '544' (la forma corta del título del combo)", clavesFamilia(["T544"]).includes("544"));
caso("v61: NO parte códigos con guion/2+ letras (TN-830XL no genera '830xl')", !clavesFamilia(["TN-830XL"]).includes("830xl"));
// un combo cuyo TÍTULO trae el código (GI-11, GI-16…) va primero de todo.
caso("v61: combo CON el código en el título va #1", (() => {
  const set = [
    { titulo: "Tinta Canon GI-11 Cyan" }, { titulo: "Tinta Canon GI-11 Amarillo" },
    { titulo: "Tinta Canon GI-11 PGBK Negro" }, { titulo: "Tinta Canon GI-11 -Magenta" },
    { titulo: "Impresora Canon Pixma G4170" },
    { titulo: "Combo de Tintas Canon Mega Kit 4 colores GI-11" },
  ];
  return /Combo de Tintas Canon Mega Kit/.test(rerankearCombos(set, modelosEn("tinta canon GI-11"), 6)[0].titulo);
})());
// 🔴 REGRESIÓN CRÍTICA (revisión adversarial): los combos AJENOS —sin el código pedido— NO deben hoistearse;
// quedaban por ENCIMA del propio producto que el cliente pidió.
caso("v61: un combo AJENO no desplaza al producto pedido (toner TN-830XL)", (() => {
  const set = [
    { titulo: "Toner Brother TN-830XL | Para DCP-L2640DW" },
    { titulo: "Kit de limpieza para impresoras" },
    { titulo: "Combo de Tintas Epson 544 x 4 Colores" },
  ];
  return /TN-830XL/.test(rerankearCombos(set, modelosEn("toner TN830XL"), 6)[0].titulo);
})());
caso("v61: SIN códigos (consulta genérica) NO se reordena — respeta el ranking del MCP", (() => {
  const set = [{ titulo: "Monitor HP M27fw" }, { titulo: "Kit de mantenimiento HP" }, { titulo: "Pack de 500 hojas" }];
  const r = rerankearCombos(set, [], 6);
  return /Monitor HP M27fw/.test(r[0].titulo) && /Kit de mantenimiento/.test(r[1].titulo);
})());
// estabilidad y bordes
caso("v61: set más chico que max no truena", rerankearCombos([{ titulo: "Tinta X" }], ["x"], 6).length === 1);
caso("v61: entrada vacía/no-array → []", rerankearCombos([], ["t544"], 6).length === 0 && rerankearCombos(null, ["t544"], 6).length === 0);
caso("v61: elementos null tolerados", rerankearCombos([null, { titulo: "Combo A" }], [], 6).length === 1);

// wiring en el source real
caso("v61: BUSQUEDA_MCP_LIMIT env con default 10", /const BUSQUEDA_MCP_LIMIT = \(\(\) => \{/.test(src) && /Number\.isFinite\(n\) && n >= 1 \? Math\.min\(n, 50\) : 10/.test(src));
caso("v61: el MCP se pide con ese límite (ya no 5 fijo)", /pagination: \{ limit: BUSQUEDA_MCP_LIMIT \}/.test(src) && !/pagination: \{ limit: 5 \}/.test(src));
caso("v61: re-ranking cableado con max=6 antes de entregar al modelo", /rerankearCombos\(mcp, codigos, 6\)/.test(src));
// el guard v60.1 se evalúa sobre el TOP-5 ORIGINAL del MCP: pedir 10 no debe ensanchar qué cuenta como
// "coincidencia exacta" (un match casual de subcadena en rank 6-10 saltearía la escalera literal).
caso("v61: el guard v60.1 sigue evaluándose sobre el top-5 original del MCP", /algunTituloConCodigo\(mcp\.slice\(0, 5\)\.map/.test(src));
caso("v61: sonda de combo cableada (anexarCombo) solo en el camino exacto", /const conCombo = await anexarCombo\(top, codigos\)/.test(src));
caso("v61: la sonda NO dispara si el set ya trae combo (anti doble-llamada)", /top\.some\(\(p: any\) => esComboTitulo\(p\?\.titulo\)\)\) return top;/.test(src));
caso("v61: la sonda tiene GATE de contexto consumible (no dispara en impresoras/monitores)", /const esConsumibleCombo = \/tinta\|botella\|cartucho\|cabezal\/i\.test\(consulta\)/.test(src) && /if \(!esConsumibleCombo\) return top;/.test(src));
caso("v61: el hit de la sonda se VALIDA contra la familia (no anexa un combo ajeno)", /esComboTitulo\(p\.titulo\) && esFamilia\(p\.titulo\)/.test(src));
caso("v61: escalada a suggest cuando el MCP no trajo combo de la familia (no 'sin candidatos')", /if \(!hit\) \{ motor = "suggest"/.test(src));
caso("v61: dedup normalizado a dígitos (gid del MCP vs id numérico de suggest)", /String\(p\?\.id \?\? ""\)\.replace\(\/\\D\/g, ""\)/.test(src));
caso("v61: la sonda acota el set a 6 al anexar", /\[\.\.\.top\.slice\(0, 5\), \{ \.\.\.hit, combo_disponible: true \}\]/.test(src));
caso("v61: telemetría combo_sonda solo del disparo real y en background", /"combo_sonda"/.test(src) && /EdgeRuntime\.waitUntil\(log\("combo_sonda"/.test(src) && !/disparo: false/.test(src));
caso("v61: el flag combo SOLO se emite en resultados exactos (no afloja v60.1)", /combo: \(exacto && \(p\.combo_disponible === true \|\| esComboTitulo\(p\.titulo\)\)\) \|\| undefined/.test(src));
caso("v61: precio_desde expuesto cuando las variantes tienen precios distintos", /precio_desde: !!\(p && p\.price_range/.test(src) && /precio_desde: p\.precio_desde \|\| undefined/.test(src));
caso("v61: healthcheck expone busqueda_mcp_limit", /busqueda_mcp_limit: BUSQUEDA_MCP_LIMIT/.test(src));
// prompt (grounded, sin aflojar guardrails)
caso("v61: SYSTEM_PROMPT tiene la regla COMBOS / JUEGOS DE TINTAS", /COMBOS \/ JUEGOS DE TINTAS/.test(SYSTEM_PROMPT));
caso("v61: cotiza el COMBO si quiere el juego completo", /COTIZA EL COMBO/.test(SYSTEM_PROMPT));
caso("v61: la regla es GROUNDED (solo combos devueltos en el turno)", /nunca supongas que existe/.test(SYSTEM_PROMPT) && /EN ESTE MISMO TURNO/.test(SYSTEM_PROMPT));
// revisión adversarial — 4 contradicciones cerradas:
caso("v61: NO sumar de memoria — usa calcular_cotizacion (no contradice v57)", /usa calcular_cotizacion/.test(SYSTEM_PROMPT) && /NUNCA sumes ni compares totales de memoria/.test(SYSTEM_PROMPT));
caso("v61: manda LEER el título del combo (el flag es solo léxico)", /LEE SU TÍTULO/.test(SYSTEM_PROMPT) && /NO son el juego completo de 4/.test(SYSTEM_PROMPT));
caso("v61: la regla NO aplica en coincidencia aproximada (no afloja v60.1)", /NO aplica cuando buscar_producto devuelve coincidencia:"aproximada"/.test(SYSTEM_PROMPT));
caso("v61: respeta CONSUMIBLE SIN MODELO (si no sabe el modelo, pregunta primero)", /primero pregunta \(ver CONSUMIBLE SIN MODELO\)/.test(SYSTEM_PROMPT));
caso("v61: si pidió UNO solo, cotiza el individual (no empuja el combo)", /Si pidió UNA sola tinta o UN solo cabezal, cotiza EL INDIVIDUAL/.test(SYSTEM_PROMPT));
caso("v61: precio_desde documentado en el prompt", /precio_desde:true/.test(SYSTEM_PROMPT));

// --- v61.1: cabezales (caso real 03-ago, conv 50767698701) ----------------------------------------
console.log("v61.1 cabezales + tipo de producto");
// El cliente pidió "cabezales para HP 410" (una Ink Tank) y el bot le respondió que la 410 era TÓNER y que
// no había cabezales — teniendo los cabezales de Ink Tank en catálogo. Dos fixes:
caso("v61.1: el TIPO de producto lo define el cliente, no el número", /EL TIPO DE PRODUCTO LO DEFINE EL CLIENTE, NO EL NÚMERO/.test(SYSTEM_PROMPT));
caso("v61.1: prohíbe corregir al cliente por inferencia propia del número", /jamás respondas "eso no existe para su equipo" por inferencia propia/.test(SYSTEM_PROMPT));
caso("v61.1: manda buscar CON la palabra del cliente (cabezal HP 410)", /cabezal HP 410/.test(SYSTEM_PROMPT));
// combos de CABEZALES (las de tanque llevan 2: negro + tricolor, y suele haber kit de ambos)
caso("v61.1: la regla de combos cubre CABEZALES, no solo tintas", /COMBOS \/ JUEGOS DE TINTAS Y CABEZALES/.test(SYSTEM_PROMPT) && /ofrécele el kit de los dos cuando exista/.test(SYSTEM_PROMPT));
caso("v61.1: la sonda dispara también en contexto de cabezal", /tinta\|botella\|cartucho\|cabezal/.test(src));
// plurales en la detección de combo (título real del catálogo: "Kit de Cabezales Canon")
caso("v61.1: esComboTitulo detecta 'Kit de Cabezales' y plurales", esComboTitulo("Kit de Cabezales Canon | BH-1 | CH-1 | Pixma G2100") && esComboTitulo("Kits de cabezales G4100") && esComboTitulo("Combos de tintas"));
caso("v61.1: sigue sin marcar una individual", !esComboTitulo("Cabezal HP M0H51AL Negro Ink Tank 315 | 415") && !esComboTitulo("Tinta Epson T544120 - Negro"));

// --- v61.2: el TIPO de consumible es excluyente (en CÓDIGO, no solo prompt) -----------------------
console.log("v61.2 tipo excluyente");
// Simulación REAL del MCP para "cabezal HP 410" (capturada de la tienda el 03-ago): el motor rankea bien
// los cabezales, pero el TÓNER CF410A aparece en el puesto 8 y su título contiene "410".
const MCP_CAB410 = [
  { titulo: "Cabezal HP X4E75AL Negro", precio_usd: "27.50" },
  { titulo: "Cabezal HP M0H50AL Tricolor", precio_usd: "27.50" },
  { titulo: "Combo de Cabezales HP 3YP86AL Negro y Color", precio_usd: "48.00" },
  { titulo: "Cabezal HP M0H51AL Negro", precio_usd: "27.50" },
  { titulo: "Cabezal HP 3YP17AL Tricolor", precio_usd: "38.00" },
  { titulo: "Kit de Cabezales Canon BH-10 + CH-10", precio_usd: "54.99" },
  { titulo: "Tinta HP 954XL Negra L0S71AL | OfficeJet Pro 7740", precio_usd: "67.00" },
  { titulo: "Toner Hp CF410A 410A - Negro | Para LaserJet Pro M452 / M477", precio_usd: "118.00" },
  { titulo: "Toner Hp CF410X - 410X Negro | Para LaserJet Pro M452 / M477", precio_usd: "198.00" },
  { titulo: "Kit de Cabezales Canon BH-1 + CH-1", precio_usd: "54.99" },
];
caso("v61.2: tipoPedido detecta cabezal/tóner/tinta y vacío si no se declara",
  tipoPedido("cabezales para impresora HP 410") === "cabezal" && tipoPedido("toner TN830XL") === "toner" &&
  tipoPedido("tinta epson 544") === "tinta" && tipoPedido("impresora HP 410") === "");
caso("v61.2: un TÓNER no satisface un pedido de CABEZAL (ni al revés)",
  !tituloDeTipo("Toner Hp CF410A 410A - Negro", "cabezal") && !tituloDeTipo("Cabezal HP M0H50AL Tricolor", "toner"));
caso("v61.2: título sin tipo claro NO se descarta (conservador)", tituloDeTipo("Impresora HP Smart Tank 583", "cabezal") && tituloDeTipo("Kit de Cabezales Canon BH-1 + CH-1", "cabezal"));
caso("v61.2: sin tipo declarado no filtra nada", tituloDeTipo("Toner Hp CF410A", "") && tituloDeTipo("lo que sea", ""));
// 🔴 el bug del 03-ago: el re-ranking hoisteaba el TÓNER (su título trae "410") por encima de los cabezales.
const set410 = rerankearCombos(MCP_CAB410.filter((p) => tituloDeTipo(p.titulo, tipoPedido("cabezales para impresora HP 410"))), modelosEn("cabezales para impresora HP 410"), 6);
caso("v61.2: el TÓNER CF410A NO entra cuando el cliente pidió CABEZALES", !set410.some((p) => /Toner/i.test(p.titulo)));
caso("v61.2: los cabezales SÍ llegan al modelo", set410.some((p) => /M0H50AL/.test(p.titulo)) && set410.some((p) => /X4E75AL/.test(p.titulo)));
caso("v61.2: el COMBO de cabezales llega al modelo (lo que ofreció el asesor)", set410.some((p) => /Combo de Cabezales HP 3YP86AL/.test(p.titulo)));
caso("v61.2: el ranking del MCP se respeta (el #1 semántico sigue #1)", /X4E75AL/.test(set410[0].titulo));
// wiring
caso("v61.2: tipo cableado en buscarProducto (MCP + escalera literal)", /const tipo = tipoPedido\(consulta\)/.test(src) && /crudos\.filter\(\(p: any\) => tituloDeTipo\(p\.titulo, tipo\)\)/.test(src) && /mcpCrudo\.filter\(\(p: any\) => tituloDeTipo\(p\.titulo, tipo\)\)/.test(src));
caso("v61.2: el re-ranking ya NO hoistea por 'código en título' (solo combos de familia)", !/\.\.\.conCodigo,/.test(src) && /\[\.\.\.comboFam\.slice\(0, RESERVA\), \.\.\.resto, \.\.\.comboFam\.slice\(RESERVA\)\]/.test(src));
caso("v61.2: el filtro del MCP no deja el set vacío (cae al crudo)", /mcpFiltrado\.length \? mcpFiltrado : mcpCrudo/.test(src));

// --- v61.3: datos del local, falsas afirmaciones de acción y ráfaga fiscal ------------------------
console.log("v61.3 oficina/acciones/ráfaga");
// Caso real (conv 50766740669, 04-ago): la clienta preguntó "Q oficina es" y el bot respondió "oficina 4008"
// DE MEMORIA (la real es la 454, según store_facts.direccion) y la RECONFIRMÓ al dudar ella — el esposo iba
// subiendo. Los tool_calls de ese turno están vacíos: ningún patrón forzaba info_tienda.
for (const t of ["Q oficina es", "¿qué oficina es?", "en qué piso están", "se me olvidó el número de oficina",
  "cómo llego a ustedes", "en qué parte de Plaza Aventura"]) {
  caso(`v61.3: "${t}" fuerza tool (info_tienda)`, NEEDS_TOOL_RE.test(t));
}
caso("v61.3: SYSTEM_PROMPT exige datos del local desde info_tienda EN EL MISMO TURNO", /DATOS DEL LOCAL/.test(SYSTEM_PROMPT) && /nunca de memoria/.test(SYSTEM_PROMPT));
caso("v61.3: el prompt cita el caso real (4008 vs 454) como ancla", /oficina 4008.*454|454.*4008/s.test(SYSTEM_PROMPT));
// El bot dijo "quedó anotado" y "ya le avisamos al equipo" — NADIE fue avisado (esa respuesta ni genera ticket).
caso("v61.3: prohíbe explícitamente 'quedó anotado' y 'ya le avisamos al equipo'",
  /"quedó anotado"/.test(SYSTEM_PROMPT) && /"ya le avisamos al equipo"/.test(SYSTEM_PROMPT));
caso("v61.3: aclara que NO puede anotar/apartar/avisar", /NO tienes forma de anotar, apartar, reservar/.test(SYSTEM_PROMPT));
caso("v61.3: mantiene la excepción real de guardar_lead", /si guardar_lead confirmó que guardó los datos/.test(SYSTEM_PROMPT));
// La anti-interrupción ahora mira la ráfaga sin responder (el RUC iba seguido de un correo inocente).
caso("v61.3: el RUC de la clienta dispara INTERRUPT_RE", INTERRUPT_RE.test("155634770-2-2016 DV42"));
caso("v61.3: el correo suelto (el que respondió) NO lo dispara — de ahí el hueco", !INTERRUPT_RE.test("Rreyes@renova-empresarial.com"));
// el patrón viejo exigía 1-4 dígitos en el 1er grupo → el RUC de persona jurídica (9 dígitos) se colaba.
for (const t of ["155634770-2-2016", "155743728-2-2023 DV42", "8-717-2345"]) {
  caso(`v61.3: RUC/cédula "${t}" → abstención`, INTERRUPT_RE.test(t));
}
for (const t of ["2026-08-04", "6282-1798", "tinta 544", "TN-830XL", "papel bond 30"]) {
  caso(`v61.3: "${t}" NO dispara el patrón de RUC (sin falsos positivos)`, !INTERRUPT_RE.test(t));
}
caso("v61.3: la ráfaga concatenada SÍ lo dispara", INTERRUPT_RE.test("Rreyes@renova-empresarial.com \n 155634770-2-2016 DV42 \n La factura sería a nombre de Renova Empresarial, S.A."));
caso("v61.3: anti-interrupción cableada sobre la ráfaga", /const rafaga = await textoDeRafagaSinResponder\(conv\.id, texto\)/.test(src) && /if \(INTERRUPT_RE\.test\(rafaga\)\)/.test(src));
caso("v61.3: la ráfaga corta en la última respuesta y por tiempo (no deja al bot mudo)", /if \(m\.role !== "user"\) break;/.test(src) && /3 \* 60 \* 1000/.test(src));
caso("v61.3: telemetría distingue si lo cazó la ráfaga", /por_rafaga: !INTERRUPT_RE\.test\(texto\)/.test(src));

// --- v61.5: corte de sesión (la conversación del mes pasado no entra al contexto) -----------------
console.log("v61.5 corte de sesión");
// Reporte real: el bot leía un chat de hace un mes y lo trataba como parte de la conversación de HOY
// (las marcas de fecha de v32 no bastaban). El corte es determinista: hueco > N días = sesión anterior.
const AHORA = Date.UTC(2026, 7, 5, 16, 0, 0); // referencia fija (no Date.now(): el test debe ser estable)
const msDia = 86400000;
const msg = (diasAtras, role = "user", content = "…") =>
  ({ role, content, created_at: new Date(AHORA - diasAtras * msDia).toISOString() });

// mes pasado (9 msgs) + hoy (1) → solo hoy entra; se reporta hace ~30 días
const cMes = cortarSesionVieja([...Array.from({ length: 9 }, (_, i) => msg(30 + i * 0.01)), msg(0)], AHORA, 7);
caso("v61.5: chat del mes pasado se recorta (queda solo el de hoy)", cMes.hist.length === 1 && cMes.huboAnterior === true);
caso("v61.5: reporta hace ~30 días para la nota", cMes.diasDesde >= 29 && cMes.diasDesde <= 31);
// ayer + hoy → se conserva (la continuidad de v32 sigue intacta)
const cAyer = cortarSesionVieja([msg(1.2), msg(1.1, "assistant"), msg(0)], AHORA, 7);
caso("v61.5: ayer + hoy NO se corta (continuidad v32)", cAyer.hist.length === 3 && cAyer.huboAnterior === false);
// cadena CONTINUA que cruza 10 días (mensajes diarios) → no se corta (el hueco es entre consecutivos)
const cCadena = cortarSesionVieja(Array.from({ length: 10 }, (_, i) => msg(9 - i)), AHORA, 7);
caso("v61.5: negociación continua de 10 días NO se corta", cCadena.hist.length === 10 && !cCadena.huboAnterior);
// borde del umbral: hueco de 8 días corta; de 6 no
caso("v61.5: hueco de 8 días corta", cortarSesionVieja([msg(8.5), msg(0)], AHORA, 7).huboAnterior === true);
caso("v61.5: hueco de 6 días no corta", cortarSesionVieja([msg(6), msg(0)], AHORA, 7).huboAnterior === false);
// defensas
caso("v61.5: umbral 0 = apagado", cortarSesionVieja([msg(60), msg(0)], AHORA, 0).huboAnterior === false);
caso("v61.5: nunca deja el historial vacío", cortarSesionVieja([msg(40), msg(39.9)], AHORA, 7).hist.length >= 1);
caso("v61.5: created_at null no rompe la cadena", (() => {
  const r = cortarSesionVieja([msg(0.2), { role: "user", content: "x", created_at: null }, msg(0)], AHORA, 7);
  return r.hist.length === 3 && !r.huboAnterior;
})());
caso("v61.5: historial vacío/1 mensaje pasa tal cual", cortarSesionVieja([], AHORA, 7).hist.length === 0 && cortarSesionVieja([msg(0)], AHORA, 7).huboAnterior === false);
// wiring en el source real
caso("v61.5: cableado en responderLLM (cubre flujo normal y asistencia)", /const corte = cortarSesionVieja\(hist, ahoraMs, SESION_GAP_DIAS\)/.test(src) && /hist = corte\.hist;/.test(src));
caso("v61.5: nota de cliente que REGRESA (tema cerrado, no adivinar)", /Cliente CONOCIDO que REGRESA/.test(src) && /NUNCA adivines a qué se refiere/.test(src));
caso("v61.5: el que regresa NO recibe bienvenida de nuevo", /No repitas la bienvenida de contacto nuevo/.test(src) && /hist\.length <= 1 && !corte\.huboAnterior/.test(src));
caso("v61.5: env COPILOT_SESION_GAP_DIAS (default 7, clamp 0-90)", /COPILOT_SESION_GAP_DIAS/.test(src) && /Math\.max\(0, Math\.min\(n, 90\)\) : 7/.test(src));
caso("v61.5: healthcheck expone sesion_gap_dias", /sesion_gap_dias: SESION_GAP_DIAS/.test(src));

// --- v62: migración del endpoint UCP (perfil de agente hosteado) ----------------------------------
console.log("v62 perfil UCP + endpoint");
// El legacy /api/mcp muere ~31-ago; /api/ucp/mcp exige que el agente hostee un PERFIL y lo declare en
// meta.ucp-agent.profile (Shopify lo FETCHEA en el discovery). Forma del perfil = spec oficial
// (Universal-Commerce-Protocol: profile.json → { ucp: { version, capabilities, services, payment_handlers } }).
const PERFIL = perfilUcpAgente();
caso("v62: el perfil tiene ucp.version en formato fecha", /^\d{4}-\d{2}-\d{2}$/.test(PERFIL.ucp?.version ?? ""));
caso("v62: la versión es la que declara la TIENDA (2026-04-08)", PERFIL.ucp?.version === "2026-04-08");
caso("v62: declara la capacidad del catálogo con su versión", Array.isArray(PERFIL.ucp?.capabilities?.["dev.ucp.shopping.catalog.search"]) && PERFIL.ucp.capabilities["dev.ucp.shopping.catalog.search"][0]?.version === "2026-04-08");
caso("v62: incluye services y payment_handlers (requeridos por platform_schema)", typeof PERFIL.ucp?.services === "object" && typeof PERFIL.ucp?.payment_handlers === "object");
caso("v62: el perfil es JSON-serializable y sin secretos", (() => { const s = JSON.stringify(PERFIL); return s.length > 0 && !/key|token|secret/i.test(s); })());
// wiring
caso("v62: ruta GET ?ucp_profile=1 pública (sin key) con Content-Type json", /url\.searchParams\.get\("ucp_profile"\) === "1"/.test(src) && /"Content-Type": "application\/json", "Cache-Control"/.test(src));
caso("v62: la ruta del perfil va ANTES del selftest y del healthcheck", (() => {
  const iPerfil = src.indexOf('url.searchParams.get("ucp_profile")');
  const iSelf = src.indexOf('url.searchParams.get("selftest")');
  return iPerfil > -1 && iSelf > -1 && iPerfil < iSelf;
})());
caso("v62: buscarCatalogoMCP manda meta.ucp-agent.profile SIEMPRE (flip = solo config)", /\{ meta: \{ "ucp-agent": \{ profile: UCP_PROFILE_URL \} \} \}/.test(src));
caso("v62: UCP_PROFILE_URL derivada de SUPABASE_URL con override por env", /UCP_AGENT_PROFILE_URL/.test(src) && /\.replace\("\.supabase\.co", "\.functions\.supabase\.co"\)/.test(src));
caso("v62: healthcheck expone catalog_mcp_url y ucp_profile_url", /catalog_mcp_url: CATALOG_MCP_URL/.test(src) && /ucp_profile_url: UCP_PROFILE_URL/.test(src));

// --- v63: folleto PDF de equipos (consultar_folleto, bajo demanda) --------------------------------
console.log("v63 folleto PDF");
// El folleto vive como <a href> en el body_html de la ficha (verificado: HP_SMART_TANK_750.pdf en el
// repositorio de archivos de Shopify). El MCP entrega la descripción SIN tags → el link se resuelve bajo
// demanda desde la ficha pública /products/{handle}.json, nunca en la búsqueda.
caso("v63: extrae el href .pdf del body_html", extraerFolletoPdf('<p>Ver <a href="https://cdn.shopify.com/s/files/1/00/HP_SMART_TANK_750.pdf">folleto</a></p>') === "https://cdn.shopify.com/s/files/1/00/HP_SMART_TANK_750.pdf");
caso("v63: tolera comillas simples y querystring", extraerFolletoPdf("<a href='https://cdn.shopify.com/s/files/x.pdf?v=123'>f</a>") === "https://cdn.shopify.com/s/files/x.pdf?v=123");
caso("v63: URL protocol-relative se normaliza a https", extraerFolletoPdf('<a href="//cdn.shopify.com/s/files/y.pdf">f</a>') === "https://cdn.shopify.com/s/files/y.pdf");
// 🔒 anti-SSRF: SOLO cdn.shopify.com por https
caso("v63: rechaza dominios ajenos", extraerFolletoPdf('<a href="https://evil.com/x.pdf">f</a>') === null && extraerFolletoPdf('<a href="https://cdn.shopify.com.evil.com/x.pdf">f</a>') === null);
caso("v63: rechaza http sin TLS", extraerFolletoPdf('<a href="http://cdn.shopify.com/x.pdf">f</a>') === null);
caso("v63: sin .pdf o sin href → null", extraerFolletoPdf('<a href="https://cdn.shopify.com/x.jpg">f</a>') === null && extraerFolletoPdf("texto plano") === null && extraerFolletoPdf(null) === null);
// wiring
caso("v63: tool consultar_folleto definida (producto_url + pregunta)", /name: "consultar_folleto"/.test(src) && /required: \["producto_url", "pregunta"\]/.test(src));
caso("v63: dispatch cableado", /await consultarFolleto\(\(block\.input as any\)\.producto_url \?\? "", \(block\.input as any\)\.pregunta \?\? ""\)/.test(src));
caso("v63: disponible en MODO ASISTENCIA (read-only, como especificaciones)", /"calcular_cotizacion", "consultar_folleto"\]/.test(src));
caso("v63: el handle se sanea y la URL de la ficha la construimos NOSOTROS (anti-SSRF)", /\/\^\[a-z0-9_-\]\+\$\/i\.test\(handle\)/.test(src) && /\$\{STORE_APEX\}\/products\/\$\{handle\}\.json/.test(src));
caso("v63: tope de tamaño del PDF y timeouts", /buf\.byteLength > 4_500_000/.test(src) && /AbortSignal\.timeout\(12000\)/.test(src));
caso("v63: la sub-llamada adjunta el PDF como document y prohíbe precios", /media_type: "application\/pdf"/.test(src) && /PROHIBIDO mencionar precios, promociones o disponibilidad/.test(src));
caso("v63: camino honesto cuando el dato no está (NO_ESTA_EN_FOLLETO)", /NO_ESTA_EN_FOLLETO/.test(src) && /el folleto no menciona ese dato/.test(src));
caso("v63: telemetría folleto_consultado", /"folleto_consultado"/.test(src));
// prompt
caso("v63: SYSTEM_PROMPT tiene la regla FOLLETO PDF DE EQUIPOS", /FOLLETO PDF DE EQUIPOS/.test(SYSTEM_PROMPT));
// v63.1 (smoke test real): el bot derivó "escanea a doble cara?" al asesor SIN consultar el folleto — la
// regla era tímida y la tool se auto-describía como "costosa". Ahora el folleto es paso OBLIGATORIO antes
// de derivar una pregunta de especificaciones de un equipo.
caso("v63.1: el folleto es paso OBLIGATORIO antes de derivar", /SIGUIENTE paso OBLIGATORIO es consultar_folleto/.test(SYSTEM_PROMPT) && /NUNCA derives a un asesor una pregunta de especificaciones sin haber consultado el folleto/.test(SYSTEM_PROMPT));
caso("v63.1: la descripción de la tool ya no desincentiva (sin 'consulta costosa')", !/es una consulta costosa/.test(src) && /ANTES de derivar a un asesor — nunca respondas 'no está especificado' sin haberla intentado/.test(src));
caso("v63.2: la URL debe venir de buscar_producto DE ESTE MISMO TURNO (no de memoria)", /DE ESTE MISMO TURNO/.test(SYSTEM_PROMPT) && /NUNCA escribas la URL de memoria/.test(SYSTEM_PROMPT));
// v63.2 (telemetría real): el modelo escribió la URL de memoria en el 2º turno → handle inventado → 404.
// El error ahora es AUTO-CORREGIBLE: pide re-buscar y reintentar dentro del mismo turno (loop de tools).
caso("v63.2: 404 de la ficha → error auto-corregible (re-buscar y reintentar)", /url_no_corresponde/.test(src) && /ficha_http_404_url_inventada/.test(src) && /reintenta consultar_folleto/.test(src));
caso("v63: REGLA DURA — del folleto jamás salen precios/promos/stock", /del folleto JAMÁS salen precios/.test(SYSTEM_PROMPT) && /precios de referencia de otros mercados/.test(SYSTEM_PROMPT));
caso("v63: honestidad si no hay dato (no completar por lógica)", /NUNCA completes la especificación por lógica/.test(SYSTEM_PROMPT));

// --- v64: precio de OFERTA (compare-at / list_price) ----------------------------------------------
console.log("v64 precio de oferta");
// Hay oferta SOLO si lista > precio, estrictamente; el ahorro se calcula en código.
const OF = datosOferta("10.00", "12.00");
caso("v64: lista 12 > precio 10 → oferta con antes y ahorro", OF.oferta === true && OF.precio_antes_usd === "12.00" && OF.ahorro_usd === "2.00");
caso("v64: acepta formatos con símbolo", datosOferta("$10.00", "$12.50").ahorro_usd === "2.50");
// 🔒 guardia de dato sucio: el catálogo REAL tiene un comparativo al revés (T544320: compare $10, precio $11).
caso("v64: comparativo AL REVÉS (10 vs 11) NO es oferta", Object.keys(datosOferta("11.00", "10.00")).length === 0);
caso("v64: lista igual al precio NO es oferta", Object.keys(datosOferta("10.00", "10.00")).length === 0);
caso("v64: sin lista / cero / basura → {}", Object.keys(datosOferta("10.00", undefined)).length === 0 && Object.keys(datosOferta("10.00", "0.00")).length === 0 && Object.keys(datosOferta("abc", "12")).length === 0);
// parser MCP: list_price_range (minor units; 0 = sin lista)
caso("v64: parseCatalogoMCP extrae precio_lista de list_price_range", (() => {
  const r = parseCatalogoMCP({ result: { content: [{ type: "text", text: JSON.stringify({ products: [
    { title: "X", price_range: { min: { amount: 10000 } }, list_price_range: { min: { amount: 12900 } } },
    { title: "Y", price_range: { min: { amount: 10000 } }, list_price_range: { min: { amount: 0 } } },
  ] }) }] } });
  return r[0].precio_lista === "129.00" && r[1].precio_lista === undefined;
})());
// wiring
caso("v64: suggestShopify trae compare_at_price_min como precio_lista", /precio_lista: p\.compare_at_price_min \|\| undefined/.test(src));
caso("v64: el mapa del MCP conserva precio_lista", /precio_usd: p\.precio_usd, precio_lista: p\.precio_lista/.test(src));
caso("v64: enriquecer agrega los datos de oferta calculados en código", /\.\.\.datosOferta\(p\.precio_usd, p\.precio_lista\)/.test(src));
// prompt
caso("v64: SYSTEM_PROMPT tiene la regla OFERTA / PRECIO REBAJADO", /OFERTA \/ PRECIO REBAJADO/.test(SYSTEM_PROMPT) && /está en OFERTA 🏷️/.test(SYSTEM_PROMPT));
caso("v64: prohíbe inventar ofertas o calcular el ahorro de memoria", /NUNCA digas que está en oferta ni insinúes descuentos/.test(SYSTEM_PROMPT) && /NUNCA calcules el ahorro ni el porcentaje de memoria/.test(SYSTEM_PROMPT));
caso("v64: nunca promete duración de la oferta", /NUNCA prometas hasta cuándo dura la oferta/.test(SYSTEM_PROMPT));

// --- v65: endurecimiento (revisión profunda 13-ago: 7 confirmados + seguridad + prompt) --------------
console.log("v65 endurecimiento");
// #1 — asesor que responde SOLO con media (PDF/imagen) también marca handoff + human-agent
caso("v65: media del asesor marca handoff (no bypassea la anti-interrupción)", /negocio_atendiendo_media/.test(src) && /\["image", "document", "audio", "video", "file", "sticker"\]\.includes\(tipo\)/.test(src));
// #2 — loop de tools agotado → respaldo, no mudo (y el silencio deliberado de acks se respeta)
caso("v65: agotado:true en el return post-loop de responderLLM", /agotado: true/.test(src));
caso("v65: agotado → respaldo consciente de horario + telemetría llm_agotado", /llm_agotado/.test(src) && /if \(!salida && r\.agotado\)/.test(src));
// #3 — errores JSON-RPC del MCP (HTTP 200) ya lanzan → busqueda_mcp_fallo los ve
caso("v65: j.error y result.isError del MCP lanzan (telemetría del flip UCP)", /mcp_rpc_/.test(src) && /mcp_iserror_/.test(src));
// #6/#7 — insert-antes-de-enviar blindado en TODOS los caminos
caso("v65: insert de respuesta chequea error antes de enviar (normal + asistencia)", /fase: "respuesta_insert"/.test(src) && /fase: "asistencia_insert"/.test(src));
caso("v65: el respaldo v23 inserta ANTES de enviar (invariante anti-eco)", /fase: "fallback_insert"/.test(src) && (() => { const i1 = src.indexOf('fase: "fallback_insert"'); const i2 = src.indexOf("const okfb = await enviarWati"); return i1 > -1 && i2 > -1 && i1 < i2; })());
caso("v65: envío fallido deja telemetría (envio_fallido)", /"envio_fallido"/.test(src));
// #8 — allowlist del host de media (el token de WATI no viaja a hosts arbitrarios)
caso("v65: descargarMediaWati solo baja de *.wati.io", /host === "wati\.io" \|\| host\.endsWith\("\.wati\.io"\)/.test(src) && /media_host_rechazado/.test(src));
// #10 — ASSIST_SUFFIX lista las 6 tools reales de asistencia
const ASSIST2 = (() => { const i = src.indexOf("const ASSIST_SUFFIX = `"); return src.slice(i, src.indexOf("`;", i)); })();
caso("v65: ASSIST_SUFFIX menciona calcular_cotizacion y consultar_folleto", /calcular_cotizacion/.test(ASSIST2) && /consultar_folleto/.test(ASSIST2));
// #12 — el guard anti-fuga conoce las 8 tools
caso("v65: pareceFuncionEnTexto conoce las 8 tools", pareceFuncionEnTexto('llamo name="calcular_cotizacion" ya') && pareceFuncionEnTexto('name="consultar_folleto"') && pareceFuncionEnTexto('name="tarifa_entrega"'));
// #13 — sin voseo residual
caso("v65: sin voseo residual (sabés)", !/sabés/.test(SYSTEM_PROMPT));

// --- v66: respuesta en partes (burbujas) ----------------------------------------------------------
console.log("v66 burbujas");
const partirMensaje = extraerFuncion("partirMensaje");
caso("v66: 3 partes con el marcador (título+link / precio / stock)", (() => {
  const p = partirMensaje("Claro 👍 *Tóner Brother TN-830XL*\nhttps://quickservicepanama.com/products/x\n[[---]]\n*$116.00 + ITBMS (7%) = $124.12*\n[[---]]\n✅ 7 unidades disponibles. ¿Se lo cotizo?");
  return p.length === 3 && p[0].includes("TN-830XL") && p[1].includes("124.12") && p[2].startsWith("✅");
})());
caso("v66: sin marcador → 1 parte intacta", (() => { const p = partirMensaje("Hola, ¿en qué le ayudo?"); return p.length === 1 && p[0] === "Hola, ¿en qué le ayudo?"; })());
caso("v66: segmentos vacíos fuera (marcador al inicio/fin/duplicado)", (() => { const p = partirMensaje("[[---]]\nuno\n[[---]][[---]]\ndos\n[[---]]"); return p.length === 2 && p[0] === "uno" && p[1] === "dos"; })());
caso("v66: más partes que el tope → la COLA se fusiona en la última (no se pierde texto)", (() => { const p = partirMensaje("a[[---]]b[[---]]c[[---]]d"); return p.length === 3 && p[0] === "a" && p[1] === "b" && p[2] === "c\n\nd"; })());
caso("v66: re-unión = texto limpio sin marcadores (camino flag OFF / sombra / asistencia)", (() => { const p = partirMensaje("a[[---]]b").join("\n\n"); return p === "a\n\nb" && !p.includes("[[---]]"); })());
caso("v66: marcador con espacios alrededor también corta", partirMensaje("a  [[---]]  b").length === 2);
// prompt
caso("v66: SYSTEM_PROMPT tiene la regla RESPUESTA EN PARTES (solo UN producto)", /RESPUESTA EN PARTES \(BURBUJAS\)/.test(SYSTEM_PROMPT) && /SOLO al cotizar UN producto específico/.test(SYSTEM_PROMPT));
caso("v66: el marcador documentado EXACTO y con tope de partes", SYSTEM_PROMPT.includes("[[---]]") && /máximo 2 veces \(3 partes\)/.test(SYSTEM_PROMPT));
caso("v66: prohíbe el marcador en listas/cotizaciones múltiples/asistencia", /NUNCA uses el marcador en/.test(SYSTEM_PROMPT) && /ni en MODO ASISTENCIA/.test(SYSTEM_PROMPT));
// wiring
caso("v66: gateado por COPILOT_BURBUJAS (default OFF)", /const BURBUJAS = \(Deno\.env\.get\("COPILOT_BURBUJAS"\) \?\? ""\)\.trim\(\) === "1"/.test(src));
caso("v66: una fila POR burbuja, insertada ANTES de enviar (anti-eco v13/v21)", /fase: "burbuja_insert"/.test(src) && /content: partes\[bi\]/.test(src) && (() => { const iIns = src.indexOf("content: partes[bi]"); const iSend = src.indexOf("const ok = await enviarWati(waId, partes[bi])"); return iIns > -1 && iSend > -1 && iIns < iSend; })());
caso("v66: el marcador se re-une en flujo normal Y asistencia (jamás llega al cliente)", /salida = partes\.join\("\\n\\n"\)/.test(src) && /salida = partirMensaje\(salida\)\.join\("\\n\\n"\)/.test(src));
caso("v66: fallo a mitad ABORTA el resto + telemetría respuesta_burbujas", /sinEnviar = partes\.length - bi; break;/.test(src) && /"respuesta_burbujas"/.test(src));
caso("v66: healthcheck expone burbujas", /burbujas: BURBUJAS/.test(src) && /burbuja_ms: BURBUJA_MS/.test(src));
// v66.1 — la pausa entre burbujas es tuneable por secreto (default 1000 ms, tope 5 s, 0 = sin pausa).
caso("v66.1: pausa entre burbujas por COPILOT_BURBUJA_MS (default 3000, elegido en vivo)", /Deno\.env\.get\("COPILOT_BURBUJA_MS"\)/.test(src) && /Math\.min\(n, 5000\) : 3000/.test(src) && /BURBUJA_MS > 0\) await new Promise/.test(src));

// --- v67: nota de voz → respuesta puente ----------------------------------------------------------
console.log("v67 audio puente");
caso("v67: gateado por COPILOT_AUDIO_PUENTE (default OFF → no-op)", /const AUDIO_PUENTE = \(Deno\.env\.get\("COPILOT_AUDIO_PUENTE"\) \?\? ""\)\.trim\(\) === "1"/.test(src) && /const esAudioCliente = AUDIO_PUENTE && \(tipo === "audio" \|\| tipo === "voice"\) && !esDelNegocio && !!waId/.test(src));
caso("v67: '[audio]' al hilo con dedup por wati_message_id + media_url", /content: "\[audio\]", mode: MODE, wati_message_id: watiMsgId/.test(src));
caso("v67: en HANDOFF calla (el asesor escuchará el audio)", /skipped: "audio_en_handoff"/.test(src) && /motivo: "handoff"/.test(src));
caso("v67: anti-spam — un puente por ráfaga (ventana 10 min)", /"audio-puente"\)\.gte\("created_at", desdeAntiSpam\)/.test(src) && /motivo: "reciente"/.test(src));
caso("v67: insert-antes-de-enviar con model audio-puente (anti-eco v21)", (() => {
  const i1 = src.indexOf('model: "audio-puente" }).select("id")');
  const i2 = src.indexOf("enviadoA = await enviarWati(waId, puente)");
  return i1 > -1 && i2 > -1 && i1 < i2;
})());
caso("v67: puente de usted y consciente del horario", /Recibí su nota de voz 🎧 ¿Me lo puede escribir en un mensaje\?/.test(src) && /un asesor escucha su audio apenas estemos en horario \(Lun-Vie 9:00am–5:00pm\)/.test(src));
caso("v67: '[audio]' NO descarta una respuesta de texto pendiente (combo texto+audio)", /\.neq\("content", "\[audio\]"\)\.gt\("created_at", desde\)/.test(src));
caso("v67: telemetría audio_puente + envio_fallido del puente", /"audio_puente"/.test(src) && /tipo: "audio_puente"/.test(src));
caso("v67: SYSTEM_PROMPT — regla AUDIOS (no regañar ni repetir la petición)", /AUDIOS \/ NOTAS DE VOZ/.test(SYSTEM_PROMPT) && /NO puedes escuchar notas de voz/.test(SYSTEM_PROMPT) && /NO repitas esa petición/.test(SYSTEM_PROMPT));
caso("v67: tope de turnos aplica también a audios", /await log\("tope_turnos", true, \{ waId, tipo: "audio" \}\)/.test(src));
caso("v67: healthcheck expone audio_puente y versión v67", /audio_puente: AUDIO_PUENTE/.test(src) && /version: "v67-audio-puente"/.test(src));

// --- resumen --------------------------------------------------------------------------------------
console.log(`\n${ok} OK, ${mal} FALLA${mal === 1 ? "" : "S"}`);
if (mal > 0) process.exit(1);
console.log("✅ golden tests: todo verde");
