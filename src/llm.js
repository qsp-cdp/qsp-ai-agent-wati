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
 * Build the `system` field as cacheable content blocks.
 *
 * The frozen prefix (instructions + knowledge base) is identical across every
 * message, so we mark it with cache_control: subsequent requests read it at ~0.1x
 * instead of full price. Per-conversation context (customer name, first-time
 * greeting) goes in a second, uncached block *after* the breakpoint so it can
 * vary per customer without invalidating the cached prefix.
 *
 * Note: caching only kicks in once the cached prefix exceeds the model minimum
 * (~2048 tokens for Sonnet 4.6, ~4096 for Opus). With a small/empty knowledge
 * base it silently won't cache yet — no error, just no savings until QSP content
 * is loaded into knowledge/.
 *
 * @param {string} system  frozen prefix (instructions + knowledge base)
 * @param {string} [context]  optional per-conversation context
 */
export function buildSystemBlocks(system, context) {
  const blocks = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  if (context) blocks.push({ type: 'text', text: context });
  return blocks;
}

/**
 * Generate a reply.
 * @param {object} args
 * @param {string} args.system   frozen system prefix (instructions + knowledge base)
 * @param {string} [args.context] per-conversation context (not cached)
 * @param {Array<{role: 'user'|'assistant', content: string}>} args.messages
 * @returns {Promise<string>} the assistant's text reply
 */
export async function generateReply({ system, context, messages }) {
  const request = {
    model: config.anthropic.model,
    max_tokens: config.anthropic.maxTokens,
    system: buildSystemBlocks(system, context),
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
