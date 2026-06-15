// Loads the QSP knowledge base — every .md file under knowledge/ — and exposes it
// as a single string that is injected into the LLM system prompt.
//
// This is the integration point for content migrated from qsp-cdp-docs: drop the
// relevant markdown into knowledge/ and it becomes part of the agent's knowledge
// automatically (see knowledge/README.md).

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const knowledgeDir = join(here, '..', 'knowledge');

let cached = null;

/** Concatenate all knowledge .md files (cached after first read). */
export function loadKnowledgeBase() {
  if (cached !== null) return cached;

  let files = [];
  try {
    files = readdirSync(knowledgeDir)
      .filter((f) => f.toLowerCase().endsWith('.md'))
      // README is documentation for maintainers, not agent knowledge.
      .filter((f) => f.toLowerCase() !== 'readme.md')
      .sort();
  } catch {
    cached = '';
    return cached;
  }

  const parts = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(knowledgeDir, file), 'utf8').trim();
      if (content) parts.push(`# Fuente: ${file}\n\n${content}`);
    } catch {
      // Skip unreadable files rather than crash the agent.
    }
  }

  cached = parts.join('\n\n---\n\n');
  return cached;
}

/** For tests / hot-reload: clear the cache so the next load re-reads disk. */
export function clearKnowledgeCache() {
  cached = null;
}

export { knowledgeDir };
