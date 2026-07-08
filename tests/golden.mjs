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
// INTERRUPT_RE sigue gateando (pago/fiscal/coordinar entrega bloquean la asistencia ANTES del OR).
caso("v50: INTERRUPT_RE sigue gateando la asistencia (!interrumpe && (...))", /!interrumpe && \(BASIC_INFO_RE\.test\(texto\) \|\| NEEDS_TOOL_RE\.test\(texto\)\)/.test(src));
// una pregunta de PRECIO habilita la asistencia (matchea NEEDS_TOOL_RE) — antes se callaba.
caso('v50: "¿cuánto cuesta el tóner 105A?" habilitaría asistencia', NEEDS_TOOL_RE.test("¿cuánto cuesta el tóner 105A?"));
// pero un PAGO EN CURSO que menciona un producto sigue bloqueado por INTERRUPT_RE (interrumpe=true).
caso('v50: "a qué cuenta te transfiero por el tóner" NO asiste (INTERRUPT gana)', INTERRUPT_RE.test("a qué cuenta te transfiero por el tóner"));
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

// --- resumen --------------------------------------------------------------------------------------
console.log(`\n${ok} OK, ${mal} FALLA${mal === 1 ? "" : "S"}`);
if (mal > 0) process.exit(1);
console.log("✅ golden tests: todo verde");
