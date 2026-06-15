// Centralised configuration, read once from the environment.
// `.env` is loaded by src/index.js (and scripts) before this module is used.

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  // WATI
  wati: {
    baseUrl: process.env.WATI_BASE_URL || '',
    authToken: process.env.WATI_AUTH_TOKEN || '',
    tenantId: process.env.WATI_TENANT_ID || '',
  },

  // Anthropic / Claude
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    maxTokens: int(process.env.ANTHROPIC_MAX_TOKENS, 4096),
    // "adaptive" enables adaptive thinking; anything else (e.g. "off") disables it.
    thinking: (process.env.ANTHROPIC_THINKING || 'adaptive').toLowerCase(),
  },

  // Supabase (conversation store — the existing qsp-wati-copilot project)
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // Agent behaviour
  agent: {
    // 'shadow' = generate + log replies but DON'T send to WhatsApp (safe testing,
    //            matching the original copilot). 'live' = actually send.
    mode: (process.env.AGENT_MODE || 'shadow').toLowerCase() === 'live' ? 'live' : 'shadow',
    // Max bot replies per conversation per day before handing off to a human.
    dailyTurnCap: int(process.env.AGENT_DAILY_TURN_CAP, 40),
  },

  // Shopify (real-time product catalog — optional)
  shopify: {
    domain: process.env.SHOPIFY_STORE_DOMAIN || '',
    token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2026-01',
  },

  // Webhook HTTP server
  server: {
    port: int(process.env.PORT, 3000),
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || '',
  },

  // Conversation
  conversation: {
    historyPageSize: int(process.env.HISTORY_PAGE_SIZE, 20),
  },

  // Helper scripts
  publicUrl: process.env.PUBLIC_URL || '',
};

// Returns a list of human-readable problems with the current configuration.
export function findConfigProblems() {
  const problems = [];
  if (!config.wati.baseUrl) problems.push('WATI_BASE_URL is not set');
  if (!config.wati.authToken) problems.push('WATI_AUTH_TOKEN is not set');
  if (!config.anthropic.apiKey) problems.push('ANTHROPIC_API_KEY is not set');
  return problems;
}

function mask(value) {
  if (!value) return '(not set)';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

// Compact, secret-safe summary for the startup banner.
export function configSummary() {
  return {
    'WATI base URL': config.wati.baseUrl || '(not set)',
    'WATI token': mask(config.wati.authToken),
    'WATI tenant': config.wati.tenantId || '(none)',
    'Anthropic key': mask(config.anthropic.apiKey),
    'Model': config.anthropic.model,
    'Max tokens': config.anthropic.maxTokens,
    'Thinking': config.anthropic.thinking,
    'Modo agente': config.agent.mode,
    'Supabase': config.supabase.url && config.supabase.serviceKey ? 'conectado' : '(off → sin persistencia)',
    'Tope turnos/día': config.agent.dailyTurnCap,
    'Catálogo': config.shopify.domain && config.shopify.token ? `Shopify (${config.shopify.domain})` : '(off)',
    'Port': config.server.port,
    'Webhook path': config.server.webhookPath,
    'Webhook token': config.server.verifyToken ? 'set' : '(none)',
    'History size': config.conversation.historyPageSize,
  };
}
