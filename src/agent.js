// Core agent loop (consolidated from the original Supabase "copilot"):
//   incoming WhatsApp message
//     → load/create conversation + persist inbound (Supabase)
//     → state gate: stay silent if handed off / closed; hand off if over daily cap
//     → build prompt (instructions + QSP knowledge base + history)
//     → generate reply (Claude) with real-time catalog + handoff tools
//     → persist assistant message (model, tokens, latency)
//     → send over WhatsApp (only in 'live' mode; 'shadow' just logs)
//
// Degrades gracefully without Supabase (no persistence; history from WATI).

import { config } from './config.js';
import { generateReply } from './llm.js';
import { loadKnowledgeBase } from './knowledge.js';
import { getConversationMessages, sendText } from './wati.js';
import { getCatalogTools, runCatalogTool, isCatalogEnabled } from './catalog.js';
import * as db from './db.js';

const BASE_INSTRUCTIONS = `Eres el asistente virtual de QSP (Quick Service Panama) que atiende a clientes por WhatsApp.

Cómo debes comportarte:
- Responde en el mismo idioma del cliente (por defecto, español de Panamá).
- Sé cordial, claro y breve: es una conversación de WhatsApp, no un correo. Usa frases cortas y, cuando ayude, listas simples.
- Responde ÚNICAMENTE con el mensaje final para el cliente. No incluyas notas internas ni tu razonamiento.
- Apóyate en la base de conocimiento de QSP que aparece más abajo. Si la información no está ahí, dilo con honestidad y ofrece poner al cliente en contacto con una persona del equipo; no inventes datos (precios, horarios, direcciones, políticas).
- No prometas acciones que no puedes realizar (cobros, envíos, citas) a menos que la base de conocimiento indique cómo hacerlo.`;

const HANDOFF_INSTRUCTIONS = `Escalamiento a una persona:
- Tienes la herramienta \`escalar_a_humano\`. Úsala cuando el cliente lo pida explícitamente, esté molesto, tenga una queja seria, o la consulta esté fuera de tu alcance.
- Al escalar, despídete con empatía e indica que una persona del equipo de QSP continuará la conversación.`;

const CATALOG_INSTRUCTIONS = `Catálogo en tiempo real:
- Tienes la herramienta \`buscar_productos\`, conectada al catálogo de Shopify de QSP.
- Úsala SIEMPRE que el cliente pregunte por precio, disponibilidad, existencias o si se vende un producto. Nunca respondas precios ni stock de memoria.
- Da el precio con su moneda e indica si hay existencias. Si el producto no aparece, dilo con claridad y ofrece buscar alternativas o pasar con una persona.`;

// Tool the model calls to escalate to a human. Execution is handled per-request
// in handleIncomingMessage (it needs the conversation context to update state).
const HANDOFF_TOOL = {
  name: 'escalar_a_humano',
  description:
    'Escala la conversación a una persona del equipo de QSP. Úsala cuando el cliente lo pida ' +
    'explícitamente, esté molesto, tenga una queja seria, o cuando la consulta esté fuera de tu alcance.',
  input_schema: {
    type: 'object',
    properties: {
      motivo: { type: 'string', description: 'Motivo breve del escalamiento.' },
    },
    required: ['motivo'],
  },
};

// Frozen prefix: identical across every message, so it can be prompt-cached.
// Keep it free of per-conversation values (see buildConversationContext).
function buildFrozenSystem() {
  const knowledge = loadKnowledgeBase();
  const sections = [BASE_INSTRUCTIONS, HANDOFF_INSTRUCTIONS];
  if (isCatalogEnabled()) {
    sections.push(CATALOG_INSTRUCTIONS);
  }
  if (knowledge) {
    sections.push(`BASE DE CONOCIMIENTO DE QSP:\n\n${knowledge}`);
  } else {
    sections.push(
      'NOTA: La base de conocimiento de QSP está vacía. Responde de forma general y ofrece escalar a una persona del equipo para datos específicos.',
    );
  }
  return sections.join('\n\n');
}

// Per-conversation context: varies per customer, so it must NOT be part of the
// cached prefix. Returned separately and placed after the cache breakpoint.
function buildConversationContext({ senderName, eventType }) {
  const lines = [];
  if (senderName) lines.push(`Nombre del cliente: ${senderName}`);
  if (eventType === 'newContactMessageReceived') {
    lines.push('Es la primera vez que este contacto escribe: dale una bienvenida breve.');
  }
  if (!lines.length) return '';
  return `Contexto de esta conversación:\n${lines.join('\n')}`;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Decide what to do with an incoming message based on conversation state.
 * Pure function (easy to test).
 * @returns {{action: 'reply'|'silent'|'handoff', reason?: string}}
 */
export function decideGate(conv, today, cap) {
  if (!conv) return { action: 'reply' };
  if (conv.status === 'handoff' || conv.status === 'cerrada') {
    return { action: 'silent', reason: conv.status };
  }
  const turnsToday = conv.turns_date === today ? conv.turns_today || 0 : 0;
  if (turnsToday >= cap) return { action: 'handoff', reason: 'turn_cap' };
  return { action: 'reply' };
}

// ── Conversation history normalisation (WATI fallback when no Supabase) ───────

function extractMessageArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const key of ['messages', 'items', 'data', 'result', 'messages_list']) {
    if (Array.isArray(raw[key])) return raw[key];
    if (raw[key] && Array.isArray(raw[key].items)) return raw[key].items;
  }
  return [];
}

function isFromBusiness(msg) {
  if (typeof msg.owner === 'boolean') return msg.owner;
  if (typeof msg.fromMe === 'boolean') return msg.fromMe;
  if (typeof msg.eventType === 'string') {
    return /sent|outbound|sessionMessageSent|templateMessageSent/i.test(msg.eventType);
  }
  return false;
}

function messageText(msg) {
  return (msg.text || msg.body || msg.message || msg.caption || '').toString().trim();
}

function timestampOf(msg) {
  const t = msg.timestamp || msg.created || msg.created_at || msg.time;
  const n = Number(t);
  if (Number.isFinite(n)) return n;
  const d = Date.parse(t);
  return Number.isFinite(d) ? d : 0;
}

export function normalizeHistory(raw, currentText) {
  const arr = extractMessageArray(raw);
  const sorted = [...arr].sort((a, b) => timestampOf(a) - timestampOf(b));
  const turns = [];
  for (const msg of sorted) {
    const content = messageText(msg);
    if (!content) continue;
    turns.push({ role: isFromBusiness(msg) ? 'assistant' : 'user', content });
  }
  if (turns.length) {
    const last = turns[turns.length - 1];
    if (last.role === 'user' && last.content === currentText.trim()) turns.pop();
  }
  return turns;
}

// The Messages API requires the first message to be from the user.
function trimLeadingAssistant(messages) {
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return messages;
}

/**
 * Handle one inbound WhatsApp message end-to-end.
 * @param {object} msg
 * @param {string} msg.from   customer's WhatsApp id / phone
 * @param {string} msg.text   message text
 * @param {string} [msg.senderName]
 * @param {string} [msg.eventType]
 * @returns {Promise<string>} the reply (sent in live mode; logged-only in shadow)
 */
export async function handleIncomingMessage({ from, text, senderName, eventType }) {
  const mode = config.agent.mode; // 'shadow' | 'live'
  const today = todayUtc();

  // 1. Conversation (Supabase). Null when DB is not configured.
  let conv = null;
  try {
    conv = await db.getOrCreateConversation(from, senderName);
  } catch (err) {
    console.warn(`[agent] conversation lookup failed for ${from}: ${err.message}`);
  }

  // 2. Persist the inbound message.
  if (conv) {
    try {
      await db.insertMessage({ conversation_id: conv.id, role: 'user', content: text, mode });
    } catch (err) {
      console.warn(`[agent] could not store inbound message: ${err.message}`);
    }
  }

  // 3. State gate.
  const gate = decideGate(conv, today, config.agent.dailyTurnCap);
  if (gate.action === 'silent') {
    await db.logJob('copilot-webhook', 'skip_status', true, { wa_id: from, status: gate.reason });
    console.log(`[agent] ${from}: status=${gate.reason} → bot en silencio`);
    return '';
  }
  if (gate.action === 'handoff') {
    if (conv) {
      try {
        await db.updateConversation(conv.id, { status: 'handoff' });
        await db.createHandoff(conv.id, 'límite de turnos diario alcanzado');
      } catch (err) {
        console.warn(`[agent] handoff (turn cap) failed: ${err.message}`);
      }
    }
    await db.logJob('copilot-webhook', 'turn_cap_handoff', true, { wa_id: from });
    console.log(`[agent] ${from}: tope de turnos → handoff`);
    return '';
  }

  // 4. History (Supabase if available, else WATI).
  let history = [];
  try {
    if (conv) {
      history = await db.getHistory(conv.id, config.conversation.historyPageSize);
    } else {
      history = normalizeHistory(await getConversationMessages(from), text);
    }
  } catch (err) {
    console.warn(`[agent] could not load history for ${from}: ${err.message}`);
  }

  // 5. Build the message list (ensure the current text is the last user turn).
  const messages = [...history];
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || last.content !== text.trim()) {
    messages.push({ role: 'user', content: text });
  }
  trimLeadingAssistant(messages);

  const system = buildFrozenSystem();
  const context = buildConversationContext({
    senderName: (conv && conv.sender_name) || senderName,
    eventType,
  });

  // 6. Tools: real-time catalog + human handoff (captured via signals).
  const signals = { handoff: null };
  const tools = [...getCatalogTools(), HANDOFF_TOOL];
  const runTool = async (name, input) => {
    if (name === 'escalar_a_humano') {
      signals.handoff = { motivo: (input && input.motivo) || 'no especificado' };
      return JSON.stringify({ ok: true, mensaje: 'Escalamiento registrado; continúa una persona del equipo.' });
    }
    return runCatalogTool(name, input);
  };

  // 7. Generate the reply.
  const started = Date.now();
  let result;
  try {
    result = await generateReply({ system, context, messages, tools, runTool });
  } catch (err) {
    console.error(`[agent] LLM error for ${from}: ${err.message}`);
    await db.logJob('copilot-webhook', 'llm_error', false, { wa_id: from, error: err.message });
    return '';
  }
  const latencyMs = Date.now() - started;
  const reply = (result.text || '').trim();

  // 8. Persist the assistant message with usage/latency.
  if (conv) {
    try {
      await db.insertMessage({
        conversation_id: conv.id,
        role: 'assistant',
        content: reply || null,
        mode,
        model: result.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        latency_ms: latencyMs,
      });
    } catch (err) {
      console.warn(`[agent] could not store assistant message: ${err.message}`);
    }
  }

  // 9. Apply a tool-requested handoff.
  if (signals.handoff && conv) {
    try {
      await db.updateConversation(conv.id, { status: 'handoff' });
      await db.createHandoff(conv.id, signals.handoff.motivo);
    } catch (err) {
      console.warn(`[agent] handoff (tool) failed: ${err.message}`);
    }
  }

  // 10. Send over WhatsApp — only in live mode.
  let sent = false;
  if (reply && mode === 'live') {
    try {
      await sendText(from, reply);
      sent = true;
    } catch (err) {
      console.error(`[agent] send failed for ${from}: ${err.message}`);
      await db.logJob('copilot-webhook', 'send_error', false, { wa_id: from, error: err.message });
    }
  }

  // 11. Bump per-day counters.
  if (conv) {
    const turnsToday = conv.turns_date === today ? conv.turns_today || 0 : 0;
    try {
      await db.updateConversation(conv.id, {
        turns_today: turnsToday + 1,
        turns_date: today,
        last_message_at: new Date().toISOString(),
        confirmed_new: true,
      });
    } catch (err) {
      console.warn(`[agent] could not update counters: ${err.message}`);
    }
  }

  await db.logJob('copilot-webhook', mode === 'live' ? 'reply_sent' : 'reply_shadow', true, {
    wa_id: from,
    sent,
    chars: reply.length,
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    latency_ms: latencyMs,
    handoff: Boolean(signals.handoff),
  });
  console.log(
    `[agent] ${from} [${mode}]${sent ? ' sent' : ''}${signals.handoff ? ' handoff' : ''} ` +
      `${reply.length} chars, ${latencyMs}ms`,
  );
  return reply;
}

export { buildFrozenSystem, buildConversationContext };
