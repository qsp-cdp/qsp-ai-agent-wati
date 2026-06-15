// Claude (Anthropic) integration: turns a system prompt + conversation history
// into a reply string.

import Anthropic from '@anthropic-ai/sdk';

import { config } from './config.js';

let client = null;
function getClient() {
  if (!client) {
    // Reads ANTHROPIC_API_KEY from the environment by default; we pass it
    // explicitly so config is the single source of truth.
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

/**
 * Generate a reply.
 * @param {object} args
 * @param {string} args.system   system prompt (instructions + knowledge base)
 * @param {Array<{role: 'user'|'assistant', content: string}>} args.messages
 * @returns {Promise<string>} the assistant's text reply
 */
export async function generateReply({ system, messages }) {
  const request = {
    model: config.anthropic.model,
    max_tokens: config.anthropic.maxTokens,
    system,
    messages,
  };

  // Adaptive thinking is the recommended default; let operators turn it off for
  // lower latency/cost via ANTHROPIC_THINKING=off.
  if (config.anthropic.thinking === 'adaptive') {
    request.thinking = { type: 'adaptive' };
  }

  const response = await getClient().messages.create(request);

  // Safety classifiers can decline a request (HTTP 200, stop_reason "refusal").
  if (response.stop_reason === 'refusal') {
    return 'Lo siento, no puedo ayudarte con eso. ¿Hay algo más en lo que pueda asistirte?';
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return text;
}
