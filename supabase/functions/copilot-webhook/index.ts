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

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

const SYSTEM_PROMPT = `Eres el asistente de Quick Service Panamá (quickservicepanama.com), tienda de suministros de impresión y tecnología en Panamá. Atiendes por WhatsApp.

ESTILO
- Mensajes CORTOS: 1 a 3 oraciones. Tono cordial panameño, en español, cercano.
- Negrita SOLO con UN asterisco: *así*. NUNCA uses dobles asteriscos (**texto**), porque en WhatsApp se ven literales y se ve mal. Tampoco uses otra sintaxis de Markdown (#, listas con guion, tablas).
- Emojis con moderación (uno o dos por mensaje, no más).

REGLA DE ORO — precio, stock y promociones
- Para CUALQUIER precio o disponibilidad usa SIEMPRE la herramienta buscar_producto y responde SOLO con lo que ella devuelve.
- NUNCA inventes precios, existencias, descuentos ni promociones.
- Incluye el link del producto cuando lo tengas.
- Si la tool no encuentra el producto, o piden algo fuera de catálogo: discúlpate breve e indica que un asesor confirmará disponibilidad y opciones.

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
- Para envíos/entregas, ubicación, horarios o métodos de pago usa SIEMPRE la herramienta info_tienda y responde SOLO con lo que devuelva.
- NUNCA inventes montos de envío, direcciones, horarios ni formas de pago. Para pagos: NUNCA compartas números de cuenta; di que Yappy/ACH/transferencia se coordinan por WhatsApp al confirmar el pedido.
- Si info_tienda no tiene el dato (devuelve "sin datos disponibles"): dilo con honestidad y deriva a un asesor para confirmarlo. No prometas plazos ni costos específicos.

HANDOFF A HUMANO (deriva con calma y sin prometer de más)
- Deriva a un asesor cuando: la tool no encuentra el producto; piden algo fuera de catálogo; quieren reclamar o están molestos; piden hablar con una persona; detectas un trámite/pago en curso (ver anti-interrupción); o la consulta excede lo que puedes resolver. Discúlpate breve e indica que un asesor le responderá pronto.

LÍMITES
- No des asesoría legal ni médica. No hables de temas ajenos a la tienda.`;

const TOOLS: Anthropic.Tool[] = [{
  name: "buscar_producto",
  description: "Busca productos en el catálogo de Quick Service Panamá. Llama esta herramienta SIEMPRE que el cliente pregunte precio, disponibilidad/stock, o mencione un producto (tinta, toner, impresora, etc.). Devuelve título, precio en USD, disponibilidad y link.",
  strict: true,
  input_schema: { type: "object", properties: { consulta: { type: "string", description: "Términos de búsqueda, ej: 'tinta hp 954 negra'" } }, required: ["consulta"], additionalProperties: false },
} as Anthropic.Tool, {
  name: "info_tienda",
  description: "Devuelve los datos oficiales de la tienda QSP (envíos/entregas, métodos de pago, ubicación, horarios, devoluciones, contacto) como pares clave→valor. Llama esta herramienta SIEMPRE que pregunten por esos temas y responde SOLO con lo que devuelva; NUNCA inventes montos, direcciones, cuentas ni horarios. Para pagos: NUNCA compartas números de cuenta (Yappy/ACH se coordinan por WhatsApp).",
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

async function buscarProducto(consulta: string): Promise<string> {
  try {
    const u = `${STORE}/search/suggest.json?q=${encodeURIComponent(consulta)}&resources%5Btype%5D=product&resources%5Blimit%5D=5&resources%5Boptions%5D%5Bunavailable_products%5D=show`;
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return JSON.stringify({ error: `tienda respondió ${r.status}` });
    const j = await r.json();
    const prods = (j?.resources?.results?.products ?? []).map((p: any) => ({ titulo: p.title, precio_usd: p.price, disponible: p.available === true, url: p.url?.startsWith("http") ? p.url : `${STORE}${p.url ?? ""}` }));
    return JSON.stringify(prods.length ? prods : { resultado: "sin coincidencias en el catálogo" });
  } catch (e) { return JSON.stringify({ error: String(e).slice(0, 200) }); }
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

async function responderLLM(history: { role: string; content: string }[]): Promise<{ text: string | null; toolCalls: unknown[]; tokensIn: number; tokensOut: number }> {
  if (!anthropic) return { text: null, toolCalls: [], tokensIn: 0, tokensOut: 0 };
  const esNuevo = history.length <= 1;
  const ctx = esNuevo
    ? "\n\nCONTEXTO INTERNO: Es la PRIMERA interacción registrada de este contacto (aplica bienvenida + presentación una sola vez)."
    : "\n\nCONTEXTO INTERNO: Contacto con conversación ya en curso (NO repitas bienvenida ni presentación; ve al grano).";
  const system = SYSTEM_PROMPT + ctx;
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: m.content || "(vacío)" }));
  const toolCalls: unknown[] = [];
  let tokensIn = 0, tokensOut = 0;
  for (let i = 0; i < 4; i++) {
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens: 1024, system, tools: TOOLS, messages });
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

async function enviarWati(waId: string, texto: string): Promise<boolean> {
  if (!WATI_API_TOKEN || !WATI_API_BASE) return false;
  const u = `${WATI_API_BASE}/api/v1/sendSessionMessage/${encodeURIComponent(waId)}?messageText=${encodeURIComponent(texto)}`;
  const r = await fetch(u, { method: "POST", headers: { Authorization: `Bearer ${WATI_API_TOKEN}` }, signal: AbortSignal.timeout(10000) });
  return r.ok;
}

async function log(action: string, ok: boolean, detail: unknown) {
  try { await sb.from("job_log").insert({ function_name: "copilot-webhook", action, ok, detail }); } catch { /* nunca romper */ }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    return Response.json({ status: "ok", function: "copilot-webhook", version: "v9-anti-interrupcion", mode: MODE, model: MODEL, llm_configured: !!anthropic, wati_send_configured: !!(WATI_API_TOKEN && WATI_API_BASE), ts: new Date().toISOString() });
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

  // Mensaje del negocio (humano/asesor): regístralo en job_log para detectar atención
  // humana reciente (anti-interrupción) y termina.
  if (esDelNegocio && waId && texto && tipo === "text") {
    await log("mensaje_humano", true, { waId });
    return Response.json({ ok: true, skipped: "mensaje_del_negocio_registrado" });
  }

  if (!waId || !texto || tipo !== "text") {
    if (!texto) await log("evento_sin_texto", true, { tipo, eventType: eventType || null });
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

    // Anti-interrupción 1: ¿un humano del equipo atendió esta conversación hace < 45 min?
    const humanCutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const { data: humanRecent } = await sb.from("job_log").select("id").eq("function_name", "copilot-webhook").eq("action", "mensaje_humano").gte("created_at", humanCutoff).filter("detail->>waId", "eq", waId).limit(1);
    if (humanRecent && humanRecent.length) { await log("abstencion_humano_reciente", true, { waId }); return Response.json({ ok: true, skipped: "humano_atendiendo" }); }

    // Anti-interrupción 2: señales de trámite/pago/dato fiscal en curso → abstenerse.
    if (INTERRUPT_RE.test(texto)) { await log("abstencion_interrupcion", true, { waId }); return Response.json({ ok: true, skipped: "interrupcion_tramite" }); }

    if (HANDOFF_RE.test(texto)) {
      await sb.from("conversations").update({ status: "handoff" }).eq("id", conv.id);
      await sb.from("handoffs").insert({ conversation_id: conv.id, motivo: `keyword: ${texto.slice(0, 120)}` });
      const despedida = "Con gusto, ya le paso con un asesor que le responderá en breve. ¡Gracias por escribirnos!";
      const enviado = MODE === "live" ? await enviarWati(waId, despedida) : false;
      await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: despedida, mode: enviado ? "live" : "shadow", latency_ms: Date.now() - t0 });
      return Response.json({ ok: true, handoff: true });
    }

    const { data: hist } = await sb.from("messages").select("role,content").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(8);
    const history = (hist ?? []).reverse();
    const r = await responderLLM(history as any);

    let modoFinal = "shadow"; let enviado = false;
    if (r.text && MODE === "live") { enviado = await enviarWati(waId, r.text); modoFinal = enviado ? "live" : "shadow"; }
    await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: r.text, tool_calls: r.toolCalls.length ? r.toolCalls : null, mode: modoFinal, model: anthropic ? MODEL : null, tokens_in: r.tokensIn || null, tokens_out: r.tokensOut || null, latency_ms: Date.now() - t0 });
    if (!anthropic) await log("llm_no_configurado", true, { waId });
    return Response.json({ ok: true, mode: modoFinal, respondido: !!r.text, enviado, nuevo: history.length <= 1 });
  } catch (e) {
    await log("error", false, { waId, error: String(e).slice(0, 400) });
    return Response.json({ ok: false, error: "internal" }, { status: 200 });
  }
});
