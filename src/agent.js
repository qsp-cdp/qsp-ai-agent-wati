// Core agent loop:
//   incoming WhatsApp message
//     → fetch conversation history (WATI)
//     → build prompt (instructions + QSP knowledge base + history)
//     → generate reply (Claude)
//     → send reply back over WhatsApp (WATI)

import { config } from './config.js';
import { generateReply } from './llm.js';
import { loadKnowledgeBase } from './knowledge.js';
import { getConversationMessages, sendText } from './wati.js';

const BASE_INSTRUCTIONS = `Eres el asistente virtual de QSP (Quick Service Panama) que atiende a clientes por WhatsApp.

Cómo debes comportarte:
- Responde en el mismo idioma del cliente (por defecto, español de Panamá).
- Sé cordial, claro y breve: es una conversación de WhatsApp, no un correo. Usa frases cortas y, cuando ayude, listas simples.
- Responde ÚNICAMENTE con el mensaje final para el cliente. No incluyas notas internas ni tu razonamiento.
- Apóyate en la base de conocimiento de QSP que aparece más abajo. Si la información no está ahí, dilo con honestidad y ofrece poner al cliente en contacto con una persona del equipo; no inventes datos (precios, horarios, direcciones, políticas).
- No prometas acciones que no puedes realizar (cobros, envíos, citas) a menos que la base de conocimiento indique cómo hacerlo.
- Ante temas sensibles, quejas serias o solicitudes fuera de tu alcance, ofrece escalar a un agente humano.`;

// Frozen prefix: identical across every message, so it can be prompt-cached.
// Keep it free of per-conversation values (see buildConversationContext).
function buildFrozenSystem() {
  const knowledge = loadKnowledgeBase();
  const sections = [BASE_INSTRUCTIONS];
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

// ── Conversation history normalisation ───────────────────────────────────────
// The WATI messages endpoint shape can vary by account/version, so we extract
// defensively and degrade gracefully (an empty history still yields a reply).

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
  // WATI marks business-sent (outbound) messages with owner=true / fromMe=true.
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

/**
 * Map raw WATI messages to Claude's {role, content} format, oldest-first.
 * @param {any} raw response from `wati conversations messages`
 * @param {string} currentText the just-received inbound text (deduped if present)
 */
export function normalizeHistory(raw, currentText) {
  const arr = extractMessageArray(raw);

  const sorted = [...arr].sort((a, b) => timestampOf(a) - timestampOf(b));

  const turns = [];
  for (const msg of sorted) {
    const content = messageText(msg);
    if (!content) continue; // skip media-only / empty entries
    turns.push({ role: isFromBusiness(msg) ? 'assistant' : 'user', content });
  }

  // The history may already include the message we just received; drop a trailing
  // duplicate so we don't send it twice.
  if (turns.length) {
    const last = turns[turns.length - 1];
    if (last.role === 'user' && last.content === currentText.trim()) {
      turns.pop();
    }
  }

  return turns;
}

/**
 * Handle one inbound WhatsApp message end-to-end.
 * @param {object} msg
 * @param {string} msg.from   customer's WhatsApp id / phone
 * @param {string} msg.text   message text
 * @param {string} [msg.senderName]
 * @param {string} [msg.eventType]
 * @returns {Promise<string>} the reply that was sent
 */
export async function handleIncomingMessage({ from, text, senderName, eventType }) {
  // 1. Conversation history (best-effort — never block a reply on it).
  let history = [];
  try {
    const raw = await getConversationMessages(from);
    history = normalizeHistory(raw, text);
  } catch (err) {
    console.warn(`[agent] could not fetch history for ${from}: ${err.message}`);
  }

  // 2. Build the prompt. Ensure the current message is the final user turn.
  const messages = [...history];
  if (!messages.length || messages[messages.length - 1].content !== text.trim()) {
    messages.push({ role: 'user', content: text });
  }
  const system = buildFrozenSystem();
  const context = buildConversationContext({ senderName, eventType });

  // 3. Generate the reply.
  const reply = await generateReply({ system, context, messages });
  if (!reply) {
    console.warn(`[agent] empty reply generated for ${from}; nothing sent`);
    return '';
  }

  // 4. Send it back over WhatsApp.
  await sendText(from, reply);
  console.log(`[agent] replied to ${from} (${reply.length} chars)`);
  return reply;
}

export { buildFrozenSystem, buildConversationContext };
