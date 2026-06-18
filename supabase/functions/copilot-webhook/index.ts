// === copilot-webhook v18.1 — diagnóstico de media (paso previo a visión v19) ===
// v18.1 (2026-06-18): registra el payload COMPLETO de los mensajes que NO son texto
//   (imágenes, documentos…) en job_log (action `evento_sin_texto`, campo `payload`,
//   con strings largos truncados) para conocer el shape real de media de WATI — dónde
//   viene la URL/ID del archivo — y construir v19 (visión) sin adivinar. NO cambia el
//   comportamiento de envío: los no-texto se siguen saltando (el bot aún no ve imágenes).
// === copilot-webhook v18 — Copiloto AI de WATI — búsqueda tolerante al guion en modelos ===
// v18 (2026-06-18): buscar_producto prueba el código de modelo CON y SIN guion (TN830XL ↔
//   TN-830XL, GI11 ↔ GI-11). Shopify no matchea una forma contra la otra, así que el bot decía
//   "no lo tengo" a productos que SÍ existen. Las variantes se generan EN CÓDIGO (no depende de
//   que el LLM adivine el guion) y se deduplican los intentos.
// === copilot-webhook v17 — Copiloto AI de WATI — modelo exacto + soporte/reparaciones ===
// v17 (2026-06-17): (1) anti-"modelo equivocado": el bot usa el título real del resultado y, si el
//   modelo pedido no aparece, lo dice en vez de renombrar (corrige casos como el monitor 322pv que
//   se respondió con el link de otro modelo); (2) soporte/reparaciones: QSP no repara, sugiere la
//   empresa de la marca desde store_facts (key soporte_reparaciones) — se fuerza info_tienda ante
//   preguntas de reparación/soporte/sucursal (NEEDS_TOOL_RE).
// === copilot-webhook v16 — Copiloto AI de WATI — formato apto para WhatsApp (links/negritas) ===
// v16 (2026-06-16): limpia el texto antes de enviarlo a WhatsApp (limpiarWhatsApp): convierte los
//   links markdown [texto](url) en URL pelada y los dobles asteriscos en uno solo, porque WhatsApp
//   los muestra literales. Refuerzo en el prompt para que el modelo ya no genere [texto](url).
// === copilot-webhook v15 — Copiloto AI de WATI — el bot solo atiende contactos nuevos / sin asignar ===
// v15 (2026-06-16): cuando el NEGOCIO escribe en una conversación (owner=true: asesor humano o
//   mensaje automático), se marca status='handoff' → el bot deja de atenderla y NO la retoma solo
//   (antes volvía a los 45 min, lo que hacía que se "robara" conversaciones ya atendidas por un
//   humano, incluso después de marcarlas resueltas). El bot solo responde a contactos nuevos o
//   conversaciones sin intervención del negocio. Para devolver una conversación al bot: status='bot'.
//   Se registra el operador (operatorName) del payload saliente de WATI.
// === copilot-webhook v14 — Copiloto AI de WATI — respuesta rápida a WATI (procesa en segundo plano) ===
// v14 (2026-06-16): el webhook responde 200 al instante y hace el trabajo lento (historial +
//   LLM + envío + guardado) en SEGUNDO PLANO (EdgeRuntime.waitUntil). Evita el timeout de WATI
//   (que marcaba las entregas como "Err" y reintentaba). La deduplicación del mensaje de usuario
//   sigue siendo síncrona (antes de responder), así que los reintentos quedan cubiertos.
// === copilot-webhook v13 — Copiloto AI de WATI — contexto de asesores + anti-eco + piloto live por allowlist ===
// v13 (2026-06-16): (1) guarda los mensajes de asesores (owner=true) en el hilo para CONTEXTO
//   completo del agente; (2) guardia anti-eco (no confunde los envíos propios del bot con un
//   humano → evita auto-abstención en live); (3) piloto: COPILOT_LIVE_ALLOWLIST limita el envío
//   (vacío = nadie; "all" = todos); (4) descarta "assistant" al inicio del historial.
// === copilot-webhook v12 — Copiloto AI de WATI (MODO SOMBRA) — todo lo anterior + forzado de tools ===
// v12 (2026-06-16): el prompt v11 no bastó con Haiku (seguía inventando precios/stock en
//   preguntas de categoría). Ahora se FUERZA el uso de tool (tool_choice:"any" en la 1ª
//   iteración) cuando el mensaje pide datos de catálogo/tienda (NEEDS_TOOL_RE) → grounding
//   garantizado en buscar_producto/info_tienda.
// v11 (2026-06-16): regla dura "sin tool, sin datos" — el bot NO menciona producto/precio/stock
//   sin buscar_producto, ni envíos/pagos/ubicación/horarios sin info_tienda (single source =
//   store_facts; se quita la data duplicada del prompt). Corrige que inventara precios en
//   preguntas de categoría (#3). (Pendiente en este v11 antes de desplegar: recall de productos
//   + ajustes según docs de WATI.)
// v10 (2026-06-16): misión "apoyar al equipo humano"; búsqueda de productos más robusta
//   (fallback por número/código de modelo cuando la consulta libre no encuentra; manejo de
//   sinónimos/línea y preguntas de categoría vía prompt; resultados con marca/tipo) y regla
//   de NO afirmar compatibilidad sin evidencia del catálogo.
// === copilot-webhook v9 — Copiloto AI de WATI (MODO SOMBRA) — prompt v2 + new-contact + info_tienda + anti-interrupción ===
// v9 (2026-06-16): guardrail PRE-LLM de anti-interrupción — ante señales de trámite/pago/dato
//   fiscal (INTERRUPT_RE) o si un humano atendió hace poco (job_log `mensaje_humano` < 45 min),
//   el bot se ABSTIENE (no llama al LLM, solo loggea). Registra los mensajes del negocio
//   (owner=true) en job_log. `info_tienda` devuelve TODOS los datos de store_facts (keys del
//   metaobjeto Shopify store_facts/datos-tienda).
// v8 (2026-06-15): Fase 1.5 — tool `info_tienda` que lee de `store_facts`. Reemplaza el
//   "puente honesto" de LOGÍSTICA/PAGOS del prompt.
// v7 (2026-06-13): maneja el evento WATI `newContactMessageReceived` (sin texto):
//   marca la conversación como confirmed_new + first_contact_at y lo registra
//   (señal autoritativa de lead nuevo / conteo). El texto real llega aparte en el
//   evento message normal. Bienvenida sigue por heurístico. prompt v2 intacto.

import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const WATI_API_TOKEN = Deno.env.get("WATI_API_TOKEN") ?? "";
const WATI_API_BASE = Deno.env.get("WATI_API_BASE") ?? "";
const MODE = (Deno.env.get("COPILOT_MODE") ?? "shadow").toLowerCase();
const MODEL = Deno.env.get("COPILOT_MODEL") ?? "claude-haiku-4-5";
const WEBHOOK_KEY = Deno.env.get("COPILOT_WEBHOOK_KEY") ?? "cw-qsp-9f2e7b3a1c5d4806";
const MAX_TURNS_DIA = 40;
const STORE = "https://www.quickservicepanama.com";

// Piloto gradual: en live, SOLO se envía a estos wa_id. Vacío = no se envía a nadie (sigue
// registrando en sombra); "all"/"*" = todos. Evita ir a live total por accidente.
const LIVE_RAW = (Deno.env.get("COPILOT_LIVE_ALLOWLIST") ?? "").trim().toLowerCase();
const LIVE_ALL = LIVE_RAW === "all" || LIVE_RAW === "*";
const LIVE_ALLOWLIST = LIVE_RAW.split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
function liveAllowed(waId: string): boolean {
  if (MODE !== "live") return false;
  return LIVE_ALL || LIVE_ALLOWLIST.includes(waId);
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

const SYSTEM_PROMPT = `Eres el asistente de Quick Service Panamá (quickservicepanama.com), tienda de suministros de impresión y tecnología en Panamá. Atiendes por WhatsApp.

MISIÓN
- Tu trabajo es APOYAR al equipo humano de QSP: adelanta lo que puedas responder con certeza (precio, disponibilidad, información general y de la tienda) y, cuando no estés seguro o una respuesta pueda comprometer a la empresa con una promesa, NO respondas: deja que un asesor humano siga. Mejor no responder que responder mal. Nunca inventes ni prometas de más.

ESTILO
- Mensajes CORTOS: 1 a 3 oraciones. Tono cordial panameño, en español, cercano.
- Negrita SOLO con UN asterisco: *así*. NUNCA uses dobles asteriscos (**texto**), porque en WhatsApp se ven literales y se ve mal. Tampoco uses otra sintaxis de Markdown (#, listas con guion, tablas). Para enlaces, escribe la URL completa tal cual (https://...); NUNCA uses el formato [texto](url) — en WhatsApp se ve literal.
- Emojis con moderación (uno o dos por mensaje, no más).

REGLA DE ORO — precio, stock y promociones
- Para CUALQUIER precio o disponibilidad usa SIEMPRE la herramienta buscar_producto y responde SOLO con lo que ella devuelve.
- NUNCA menciones un producto, modelo, precio o disponibilidad que no provenga de un resultado de buscar_producto EN ESTE MISMO TURNO. Si no llamaste a la tool, NO nombres modelos ni des precios/stock: búscalo primero. Aplica también a preguntas de categoría ("¿venden impresoras Epson?"): primero busca, luego responde con lo que devuelva.
- NUNCA inventes precios, existencias, descuentos ni promociones.
- Incluye el link del producto cuando lo tengas.
- Si la tool no encuentra el producto, o piden algo fuera de catálogo: discúlpate breve e indica que un asesor confirmará disponibilidad y opciones.

BÚSQUEDA DE PRODUCTOS (cómo usar buscar_producto)
- Convierte lo que pide el cliente en términos CONCISOS. Quita relleno ("¿venden?", "tienen", "necesito", "para") y conserva la MARCA y sobre todo el MODELO — el número/código de modelo es la señal más fuerte. Ej.: "¿venden tinta para mi Canon Pixma G2170?" → busca "tinta G2170".
- Un mismo producto se nombra de varias formas: "Canon" ↔ línea "Pixma"; "Epson" ↔ "EcoTank"/"WorkForce"; "HP" ↔ "DeskJet/LaserJet/OfficeJet". Para "tinta para [impresora]", busca por el modelo de la impresora (la tinta suele indicar los modelos compatibles) y, si hace falta, por el modelo de la tinta.
- Si la primera búsqueda no encuentra, REFORMULA y vuelve a llamar buscar_producto (prueba solo el número de modelo, la línea, o el modelo de la tinta) ANTES de derivar.
- Preguntas genéricas de categoría ("¿venden impresoras Epson?", "¿manejan toner?"): busca la categoría/marca y responde sí/no con 1-2 ejemplos concretos y su precio; invita a indicar el modelo. No listes más de 2-3.
- COMPATIBILIDAD: NO afirmes que un producto sirve para cierto equipo a menos que el resultado de buscar_producto lo indique. Si no estás seguro, dilo y deja que un asesor confirme.
- MODELO EXACTO: usa el TÍTULO tal cual lo devuelve buscar_producto. Si el modelo que pidió el cliente NO aparece en el título del resultado, NO lo renombres ni asumas que es el mismo equipo: dilo claro (ej. "no encontré el [modelo] exacto; lo más parecido que tenemos es [título real]…") y ofrécelo como alternativa o deriva. NUNCA pongas el modelo pedido junto al precio o link de otro producto.

CONTACTO NUEVO vs CONOCIDO
- Si es la PRIMERA interacción de este contacto: da una bienvenida cálida y breve, preséntate como Quick Service Panamá (suministros de impresión y tecnología) y pregunta en qué le puedes ayudar. Una sola vez, sin repetirla.
- Si ya es un contacto conocido o la conversación venía andando: ve directo al grano, sin repetir la presentación ni el saludo de bienvenida.

REGLA ANTI-INTERRUPCIÓN — no te metas si hay un humano atendiendo
- Si la conversación parece estar siendo atendida por una persona del equipo, ABSTÉNTE de responder y deriva a un asesor (handoff). Señales típicas:
  - el cliente responde a algo que TÚ no dijiste (continúa otro hilo);
  - entrega datos sueltos de un trámite: correo, cédula/RUC, nombre para factura, un monto, comprobante o "le adjunto el pago", instrucciones de retiro/entrega ("el chico va en camino", "que retire X"), confirmaciones tipo "paso el lunes";
  - pregunta por una cotización, pedido o pago YA en curso.
- Ante la duda, NO interrumpas: es mejor que un humano siga la venta a que tú la cortes. Mensajes sueltos de cierre ("ok", "gracias", "listo", "recibido") no requieren respuesta tuya salvo que claramente te estén preguntando algo.
- NUNCA captures, repitas ni confirmes datos fiscales, de facturación o de pago (RUC, cédula, razón social, "factura a nombre de", comprobantes, transferencias). Si el cliente los envía, NO los proceses: indica en UNA línea que un asesor se encarga y no pidas más datos.

LOGÍSTICA, PAGOS Y DATOS DE LA TIENDA (envíos, ubicación, horarios, métodos de pago)
- Para envíos/entregas, ubicación, horarios o métodos de pago usa SIEMPRE la herramienta info_tienda y responde SOLO con lo que devuelva. No respondas estos temas de memoria.
- NUNCA inventes montos, direcciones, horarios ni formas de pago, y NUNCA compartas números de cuenta (Yappy/ACH/transferencia). Para "cómo pago", responde con lo que devuelva info_tienda y deja la coordinación a un asesor.
- Si info_tienda no tiene el dato (devuelve "sin datos disponibles"): dilo con honestidad y deriva a un asesor para confirmarlo. No prometas plazos ni costos específicos.

SOPORTE TÉCNICO Y REPARACIONES
- QSP NO ofrece soporte técnico ni servicios de reparación. Si preguntan por reparar/arreglar un equipo, soporte técnico, o que algo "no enciende/no imprime", usa info_tienda y sugiere la empresa de la marca correspondiente que ahí figure; NUNCA inventes teléfonos ni empresas, y si no hay dato, deriva a un asesor.

HANDOFF A HUMANO (deriva con calma y sin prometer de más)
- Deriva a un asesor cuando: la tool no encuentra el producto; piden algo fuera de catálogo; quieren reclamar o están molestos; piden hablar con una persona; detectas un trámite/pago en curso (ver anti-interrupción); o la consulta excede lo que puedes resolver. Discúlpate breve e indica que un asesor le responderá pronto.

LÍMITES
- No des asesoría legal ni médica. No hables de temas ajenos a la tienda.`;

const TOOLS: Anthropic.Tool[] = [{
  name: "buscar_producto",
  description: "Busca productos en el catálogo de Quick Service Panamá (Shopify). Llámala SIEMPRE que el cliente pregunte precio, disponibilidad/stock, compatibilidad, o mencione/insinúe un producto, marca o categoría (tinta, toner, impresora Epson/Canon/HP, etc.). Pasa términos CONCISOS: marca + MODELO (el número de modelo es la mejor señal); para 'tinta para [impresora]' busca por el modelo de la impresora. Puedes llamarla varias veces reformulando si no encuentras. Devuelve título, precio USD, disponibilidad, marca, tipo y link (máx 5).",
  strict: true,
  input_schema: { type: "object", properties: { consulta: { type: "string", description: "Términos de búsqueda, ej: 'tinta hp 954 negra'" } }, required: ["consulta"], additionalProperties: false },
} as Anthropic.Tool, {
  name: "info_tienda",
  description: "Devuelve los datos oficiales de la tienda QSP (envíos/entregas, métodos de pago, ubicación, horarios, devoluciones, contacto) como pares clave→valor. Llama esta herramienta SIEMPRE que pregunten por esos temas y responde SOLO con lo que devuelva; NUNCA inventes montos, direcciones, cuentas ni horarios, y NUNCA compartas números de cuenta.",
  input_schema: { type: "object", properties: { tema: { type: "string", description: "Opcional e informativo: el tema preguntado (envío, pago, ubicación, horario…). La herramienta devuelve TODOS los datos de la tienda." } } },
} as Anthropic.Tool];

const HANDOFF_RE = /\b(humano|persona|asesor|agente|reclamo|queja|devoluci[oó]n|garant[ií]a|hablar con alguien|supervisor)\b/i;

// Anti-interrupción (guardrail PRE-LLM): señales de un trámite/pago/dato fiscal EN CURSO
// (típicamente atendido por un humano). Si el texto entrante matchea, el bot se ABSTIENE
// (no llama al LLM, solo loggea). Sesgo deliberado: mejor callar que cortar una venta humana.
// Evita matchear preguntas legítimas ("¿aceptan yappy?", "¿dónde retiro?") — esas las
// resuelve info_tienda.
const INTERRUPT_RE = new RegExp([
  // datos fiscales / facturación
  "\\bruc\\b", "\\bdv\\b", "c[eé]dula", "raz[oó]n social", "factura a nombre", "facturar a", "datos (de|para) (la )?factura", "a nombre de",
  "\\b\\d{1,4}-\\d{2,4}-\\d{4,7}\\b", // RUC/cédula PA (ej. 557-538-101617); no matchea fechas (último grupo >=4 dígitos)
  // pago/comprobante EN CURSO (no "¿aceptan X?")
  "le adjunto", "adjunto (el|la|mi) ?(pago|comprobante|transferencia|recibo)", "comprobante", "ya (le |te )?(hice|mand[eé]|envi[eé]|pagu[eé])", "dep[oó]sit",
  // entrega/retiro EN CURSO
  "mensajer[oa]", "el chico", "va en camino", "que retir", "va a retirar", "pas(o|a|ar[eé]) (el |la )?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|mañana|hoy)",
].join("|"), "i");

// Mensajes que piden datos de catálogo o de la tienda → forzar uso de tool (tool_choice:"any").
// Haiku a veces responde "de memoria" en preguntas genéricas; esto lo obliga a buscar/consultar.
// No incluye saludos/acks (esos no fuerzan tool). garantía/devolución las intercepta HANDOFF_RE.
const NEEDS_TOOL_RE = new RegExp([
  "impresor", "multifuncional", "\\btinta", "t[oó]ner", "toner", "cartuch", "consumible", "\\bpapel", "resma",
  "precio", "cu[aá]nto", "cuesta", "cotiza", "disponib", "stock", "existenc", "\\bmodelo", "\\bvende", "manejan",
  "epson", "canon", "\\bhp\\b", "brother", "pixma", "ecotank", "workforce", "laserjet", "deskjet", "officejet", "\\bg\\d{3,4}\\b", "\\bl\\d{3,4}\\b", "gi-?\\d",
  "env[ií]o", "entrega", "delivery", "horario", "ubicaci", "direcci", "\\bd[oó]nde\\b", "\\bpago", "pagar", "yappy", "\\bach\\b", "transferen", "tarjeta", "reembols",
  "repar", "soporte t[eé]cnico", "averi", "da[ñn]ad", "no enciende", "no prende", "no imprime", "sucursal", "recoger", "retir",
].join("|"), "i");
// resultados; lanza solo ante error de red/HTTP (lo maneja buscarProducto).
async function suggestShopify(q: string): Promise<any[]> {
  const u = `${STORE}/search/suggest.json?q=${encodeURIComponent(q)}&resources%5Btype%5D=product&resources%5Blimit%5D=5&resources%5Boptions%5D%5Bunavailable_products%5D=show`;
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`tienda respondió ${r.status}`);
  const j = await r.json();
  return (j?.resources?.results?.products ?? []).map((p: any) => ({
    titulo: p.title,
    precio_usd: p.price,
    disponible: p.available === true,
    marca: p.vendor || undefined,
    tipo: p.product_type || p.type || undefined,
    url: p.url?.startsWith("http") ? p.url : `${STORE}${p.url ?? ""}`,
  }));
}

// Extrae códigos/números de modelo (la señal más fuerte para hallar el producto correcto
// pese a sinónimos/alias): G2170, L3250, GI-11, TS3450, 954, 664...
function modelosEn(q: string): string[] {
  const t = new Set<string>();
  for (const m of q.matchAll(/\b[a-z]{1,4}-?\d{2,5}[a-z]{0,3}\b/gi)) t.add(m[0]);
  for (const m of q.matchAll(/\b\d{3,4}\b/g)) t.add(m[0]);
  return [...t].slice(0, 3);
}

// Variantes de un código de modelo para tolerar el guion: Shopify no matchea "TN830XL" contra
// "TN-830XL" (ni "GI11" contra "GI-11"). Probamos ambas formas — generadas en código, sin
// depender de que el modelo adivine el guion. (v18)
function variantesModelo(m: string): string[] {
  const v = new Set<string>([m]);
  const sin = m.replace(/-/g, "");                       // TN-830XL -> TN830XL
  v.add(sin);
  v.add(sin.replace(/^([a-z]{1,4})(\d)/i, "$1-$2"));     // TN830XL  -> TN-830XL
  return [...v];
}

async function buscarProducto(consulta: string): Promise<string> {
  // Consulta libre tal cual; si no encuentra, reintenta por código de modelo y sus variantes
  // con/sin guion. Deduplica para no repetir llamadas. (v18)
  const intentos = [consulta, ...modelosEn(consulta).flatMap(variantesModelo)];
  const vistos = new Set<string>();
  let lastErr: string | null = null;
  for (const q of intentos) {
    const k = q.trim().toLowerCase();
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    try {
      const prods = await suggestShopify(q);
      if (prods.length) return JSON.stringify(prods.slice(0, 5));
    } catch (e) { lastErr = String(e).slice(0, 120); }
  }
  if (lastErr) return JSON.stringify({ error: lastErr });
  return JSON.stringify({ resultado: "sin coincidencias en el catálogo" });
}

// Fase 1.5 — datos de tienda desde una fuente única (tabla store_facts, espejo del
// metaobjeto Shopify store_facts/datos-tienda). Devuelve TODOS los pares key→value con
// valor; omite vacíos. Si no hay datos, el bot deriva a un asesor.
async function infoTienda(): Promise<string> {
  try {
    const { data, error } = await sb.from("store_facts").select("key,value").not("value", "is", null).neq("value", "");
    if (error) return JSON.stringify({ error: `store_facts: ${error.message}` });
    const facts: Record<string, string> = {};
    for (const f of (data ?? []) as { key: string; value: string }[]) facts[f.key] = f.value;
    return JSON.stringify(Object.keys(facts).length ? facts : { resultado: "sin datos disponibles; deriva a un asesor" });
  } catch (e) { return JSON.stringify({ error: String(e).slice(0, 200) }); }
}

async function responderLLM(history: { role: string; content: string; model?: string | null }[], forceTool: boolean): Promise<{ text: string | null; toolCalls: unknown[]; tokensIn: number; tokensOut: number }> {
  if (!anthropic) return { text: null, toolCalls: [], tokensIn: 0, tokensOut: 0 };
  // La API exige que el primer mensaje sea del usuario: descarta "assistant" al inicio
  // (puede pasar si un asesor escribió primero).
  const hist = [...history];
  while (hist.length && hist[0].role === "assistant") hist.shift();
  const esNuevo = hist.length <= 1;
  const ctx = esNuevo
    ? "\n\nCONTEXTO INTERNO: Es la PRIMERA interacción registrada de este contacto (aplica bienvenida + presentación una sola vez)."
    : "\n\nCONTEXTO INTERNO: Contacto con conversación ya en curso (NO repitas bienvenida ni presentación; ve al grano).";
  const system = SYSTEM_PROMPT + ctx;
  // Los mensajes de un asesor humano se marcan para que el agente sepa que los dijo una persona.
  const messages: Anthropic.MessageParam[] = hist.map((m) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: (m.model === "human-agent" ? "[Asesor del equipo]: " : "") + (m.content || "(vacío)") }));
  const toolCalls: unknown[] = [];
  let tokensIn = 0, tokensOut = 0;
  for (let i = 0; i < 4; i++) {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 1024, system, tools: TOOLS, messages,
      ...(i === 0 && forceTool ? { tool_choice: { type: "any" as const } } : {}),
    });
    tokensIn += resp.usage.input_tokens; tokensOut += resp.usage.output_tokens;
    if (resp.stop_reason !== "tool_use") {
      const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      return { text: text || null, toolCalls, tokensIn, tokensOut };
    }
    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type === "tool_use") {
        toolCalls.push({ name: block.name, input: block.input });
        const out = block.name === "buscar_producto"
          ? await buscarProducto((block.input as any).consulta ?? "")
          : block.name === "info_tienda"
          ? await infoTienda()
          : JSON.stringify({ error: "tool desconocida" });
        results.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: null, toolCalls, tokensIn, tokensOut };
}

// Limpia formato que WhatsApp NO renderiza (si no, se ve literal): links markdown [texto](url) → URL
// pelada, y dobles asteriscos → uno solo. (v16 — estilo)
function limpiarWhatsApp(t: string): string {
  return t
    .replace(new RegExp("\\[([^\\]]*)\\]\\((https?://[^)\\s]+)\\)", "g"), "$2")
    .replace(new RegExp("\\*\\*([^*\\n]+)\\*\\*", "g"), "*$1*");
}

async function enviarWati(waId: string, texto: string): Promise<boolean> {
  if (!WATI_API_TOKEN || !WATI_API_BASE) return false;
  const u = `${WATI_API_BASE}/api/v1/sendSessionMessage/${encodeURIComponent(waId)}?messageText=${encodeURIComponent(texto)}`;
  const r = await fetch(u, { method: "POST", headers: { Authorization: `Bearer ${WATI_API_TOKEN}` }, signal: AbortSignal.timeout(10000) });
  return r.ok;
}

async function log(action: string, ok: boolean, detail: unknown) {
  try { await sb.from("job_log").insert({ function_name: "copilot-webhook", action, ok, detail }); } catch { /* nunca romper */ }
}

// Corre una tarea DESPUÉS de responder, manteniendo viva la instancia (Supabase
// EdgeRuntime.waitUntil). Si el runtime no expone waitUntil, la tarea igual ya está
// corriendo; su try/catch interno evita que rompa nada.
function correrEnSegundoPlano(p: Promise<unknown>): void {
  try {
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(p);
  } catch { /* nunca romper */ }
  void p;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    return Response.json({ status: "ok", function: "copilot-webhook", version: "v18.1-diag-imagen", mode: MODE, model: MODEL, llm_configured: !!anthropic, wati_send_configured: !!(WATI_API_TOKEN && WATI_API_BASE), live_targets: MODE === "live" ? (LIVE_ALL ? "all" : LIVE_ALLOWLIST.length) : 0, ts: new Date().toISOString() });
  }
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  if (url.searchParams.get("key") !== WEBHOOK_KEY) return Response.json({ error: "forbidden" }, { status: 403 });

  let p: any;
  try { p = await req.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const waId = String(p.waId ?? p.wa_id ?? "").replace(/\D/g, "");
  const texto = (p.text ?? "").toString().trim();
  const esDelNegocio = p.owner === true || p.owner === "true";
  const tipo = (p.type ?? "text").toString();
  const eventType = (p.eventType ?? p.event ?? "").toString().toLowerCase();
  const operador = (p.operatorName ?? p.operatorEmail ?? "").toString().trim(); // asesor que escribió (v15)

  // Evento WATI de contacto nuevo (sin texto): marcar lead nuevo. El texto llega aparte.
  if (eventType.includes("newcontact")) {
    if (waId) {
      await sb.rpc("upsert_conversation", { p_wa_id: waId, p_sender_name: p.senderName ?? null });
      await sb.from("conversations").update({ confirmed_new: true, first_contact_at: new Date().toISOString() }).eq("wa_id", waId).is("first_contact_at", null);
      await log("contacto_nuevo", true, { waId, senderName: p.senderName ?? null, sourceType: p.sourceType ?? null, sourceId: p.sourceId ?? null });
      return Response.json({ ok: true, evento: "new_contact_registrado", waId });
    }
    return Response.json({ ok: true, skipped: "new_contact_sin_waid" });
  }

  // Mensaje del NEGOCIO (owner=true): asesor humano/automático, o el ECO de un envío propio del bot.
  if (esDelNegocio && waId && texto && tipo === "text") {
    const { data: convH } = await sb.from("conversations").select("id,status").eq("wa_id", waId).maybeSingle();
    if (convH?.id) {
      // ¿Eco de un envío propio reciente del bot? (mismo texto, respuesta del bot < 5 min) → ignorar.
      const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: eco } = await sb.from("messages").select("id").eq("conversation_id", convH.id)
        .eq("role", "assistant").neq("model", "human-agent").eq("content", texto).gte("created_at", desde).limit(1);
      if (eco && eco.length) return Response.json({ ok: true, skipped: "eco_propio" });
      // El negocio está atendiendo: guarda el mensaje como contexto y marca la conversación como
      // ATENDIDA POR HUMANO (v15). El bot no la retoma hasta que se devuelva a status='bot'.
      await sb.from("messages").insert({ conversation_id: convH.id, role: "assistant", content: texto.slice(0, 4000), mode: "live", model: "human-agent" });
      if (convH.status !== "handoff") await sb.from("conversations").update({ status: "handoff" }).eq("id", convH.id);
      await log("mensaje_humano", true, { waId, operador: operador || null });
    }
    return Response.json({ ok: true, skipped: "negocio_atendiendo" });
  }

  if (!waId || !texto || tipo !== "text") {
    // Diagnóstico v18.1: registrar el payload COMPLETO de mensajes no-texto (imágenes,
    // documentos…) para descubrir dónde viene la URL/ID de media en el webhook de WATI
    // y construir v19 (visión) sin adivinar. Trunca strings largos (evita base64 enorme).
    const muestra: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(p ?? {})) {
      muestra[k] = typeof val === "string" && val.length > 500 ? val.slice(0, 500) + "…[trunc]" : val;
    }
    await log("evento_sin_texto", true, { tipo, eventType: eventType || null, payload: muestra });
    return Response.json({ ok: true, skipped: "no_es_mensaje_de_cliente" });
  }

  const t0 = Date.now();
  try {
    const { data: convRows, error: convErr } = await sb.rpc("upsert_conversation", { p_wa_id: waId, p_sender_name: p.senderName ?? null });
    if (convErr) throw new Error(`upsert_conversation: ${convErr.message}`);
    const conv = (Array.isArray(convRows) ? convRows[0] : convRows) as { id: string; status: string; turns_today: number };
    if (!conv?.id) throw new Error("upsert_conversation devolvió vacío");

    const watiMsgId = (p.id ?? p.whatsappMessageId ?? null)?.toString() ?? null;
    const ins = await sb.from("messages").insert({ conversation_id: conv.id, role: "user", content: texto.slice(0, 4000), mode: MODE, wati_message_id: watiMsgId }).select("id");
    if (ins.error) {
      if (ins.error.code === "23505") return Response.json({ ok: true, skipped: "duplicado" });
      throw new Error(`insert user msg: ${ins.error.message}`);
    }

    if (conv.status === "handoff") return Response.json({ ok: true, skipped: "en_handoff" });
    if (conv.turns_today > MAX_TURNS_DIA) { await log("tope_turnos", true, { waId }); return Response.json({ ok: true, skipped: "tope_diario" }); }

    // Anti-interrupción 1 (v15): si el negocio ya atendió la conversación, quedó en status='handoff'
    // (se marca cuando un owner=true escribe, arriba) y ya se saltó en el corte de status de arriba.
    // El bot solo atiende contactos nuevos / sin asignar a un humano.

    // Anti-interrupción 2: señales de trámite/pago/dato fiscal en curso → abstenerse.
    if (INTERRUPT_RE.test(texto)) { await log("abstencion_interrupcion", true, { waId }); return Response.json({ ok: true, skipped: "interrupcion_tramite" }); }

    if (HANDOFF_RE.test(texto)) {
      await sb.from("conversations").update({ status: "handoff" }).eq("id", conv.id);
      await sb.from("handoffs").insert({ conversation_id: conv.id, motivo: `keyword: ${texto.slice(0, 120)}` });
      const despedida = "Con gusto, ya le paso con un asesor que le responderá en breve. ¡Gracias por escribirnos!";
      const enviado = liveAllowed(waId) ? await enviarWati(waId, despedida) : false;
      await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: despedida, mode: enviado ? "live" : "shadow", latency_ms: Date.now() - t0 });
      return Response.json({ ok: true, handoff: true });
    }

    // Trabajo lento (historial + LLM + envío + guardado) en SEGUNDO PLANO: así le
    // respondemos a WATI al instante y evitamos su timeout/reintentos (v14). El insert
    // del mensaje de usuario (dedup) ya ocurrió de forma síncrona más arriba.
    const procesar = (async () => {
      try {
        const { data: hist } = await sb.from("messages").select("role,content,model").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(10);
        const history = (hist ?? []).reverse();
        const r = await responderLLM(history as any, NEEDS_TOOL_RE.test(texto));
        const salida = r.text ? limpiarWhatsApp(r.text) : null; // formato apto para WhatsApp (v16)
        let modoFinal = "shadow"; let enviado = false;
        if (salida && liveAllowed(waId)) { enviado = await enviarWati(waId, salida); modoFinal = enviado ? "live" : "shadow"; }
        await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: salida, tool_calls: r.toolCalls.length ? r.toolCalls : null, mode: modoFinal, model: anthropic ? MODEL : null, tokens_in: r.tokensIn || null, tokens_out: r.tokensOut || null, latency_ms: Date.now() - t0 });
        if (!anthropic) await log("llm_no_configurado", true, { waId });
      } catch (e) {
        await log("error", false, { waId, fase: "async", error: String(e).slice(0, 400) });
      }
    })();
    correrEnSegundoPlano(procesar);
    return Response.json({ ok: true, queued: true });
  } catch (e) {
    await log("error", false, { waId, error: String(e).slice(0, 400) });
    return Response.json({ ok: false, error: "internal" }, { status: 200 });
  }
});
