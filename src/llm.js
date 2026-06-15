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

function extractText(response) {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Turn the model's tool_use blocks into tool_result blocks by running each tool.
 * Errors are returned as JSON content (not thrown) so the model can recover.
 */
export async function collectToolResults(content, runTool) {
  const results = [];
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    let resultText;
    try {
      resultText = await runTool(block.name, block.input);
    } catch (err) {
      resultText = JSON.stringify({ error: err.message });
    }
    results.push({ type: 'tool_result', tool_use_id: block.id, content: resultText });
  }
  return results;
}

// Cap on tool-use round trips per message, to bound latency/cost.
const MAX_TOOL_TURNS = 4;

const REFUSAL_REPLY = 'Lo siento, no puedo ayudarte con eso. ¿Hay algo más en lo que pueda asistirte?';

/**
 * Generate a reply, running an agentic tool-use loop when tools are provided.
 * @param {object} args
 * @param {string} args.system   frozen system prefix (instructions + knowledge base)
 * @param {string} [args.context] per-conversation context (not cached)
 * @param {Array<{role: 'user'|'assistant', content: any}>} args.messages
 * @param {Array<object>} [args.tools] Anthropic tool definitions
 * @param {(name: string, input: any) => Promise<string>} [args.runTool] tool executor
 * @returns {Promise<{text: string, tokensIn: number, tokensOut: number, model: string}>}
 */
export async function generateReply({ system, context, messages, tools = [], runTool }) {
  const convo = [...messages];
  const model = config.anthropic.model;
  let tokensIn = 0;
  let tokensOut = 0;

  for (let turn = 0; turn <= MAX_TOOL_TURNS; turn++) {
    const request = {
      model,
      max_tokens: config.anthropic.maxTokens,
      system: buildSystemBlocks(system, context),
      messages: convo,
    };
    if (tools.length) request.tools = tools;

    // Adaptive thinking is the recommended default; let operators turn it off for
    // lower latency/cost via ANTHROPIC_THINKING=off.
    if (config.anthropic.thinking === 'adaptive') {
      request.thinking = { type: 'adaptive' };
    }

    const response = await getClient().messages.create(request);
    if (response.usage) {
      tokensIn += response.usage.input_tokens || 0;
      tokensOut += response.usage.output_tokens || 0;
    }

    // Safety classifiers can decline a request (HTTP 200, stop_reason "refusal").
    if (response.stop_reason === 'refusal') {
      return { text: REFUSAL_REPLY, tokensIn, tokensOut, model };
    }

    // The model wants to call a tool: run it, feed results back, loop.
    if (response.stop_reason === 'tool_use' && runTool && turn < MAX_TOOL_TURNS) {
      convo.push({ role: 'assistant', content: response.content });
      const toolResults = await collectToolResults(response.content, runTool);
      convo.push({ role: 'user', content: toolResults });
      continue;
    }

    return { text: extractText(response), tokensIn, tokensOut, model };
  }

  return { text: '', tokensIn, tokensOut, model };
}
