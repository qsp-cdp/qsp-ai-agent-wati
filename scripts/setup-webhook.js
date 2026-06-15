// Subscribe (or inspect) the WATI webhook for this agent.
//
// Usage:
//   PUBLIC_URL=https://<id>.ngrok.io npm run setup:webhook
//   npm run setup:webhook -- https://<id>.ngrok.io
//   npm run setup:webhook -- --list
//
// It registers the `message` and `newContactMessageReceived` events pointing at
// <PUBLIC_URL><WEBHOOK_PATH> (plus ?token=... when WEBHOOK_VERIFY_TOKEN is set).
import 'dotenv/config';

import { config } from '../src/config.js';
import { subscribeWebhook, listWebhooks } from '../src/wati.js';

const EVENTS = ['message', 'newContactMessageReceived'];

function buildWebhookUrl(base) {
  const trimmed = base.replace(/\/+$/, '');
  let url = `${trimmed}${config.server.webhookPath}`;
  if (config.server.verifyToken) {
    url += `?token=${encodeURIComponent(config.server.verifyToken)}`;
  }
  return url;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    const result = await listWebhooks();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const base = args.find((a) => !a.startsWith('-')) || config.publicUrl;
  if (!base) {
    console.error('No public URL provided.');
    console.error('Pass one as an argument or set PUBLIC_URL, e.g.:');
    console.error('  PUBLIC_URL=https://<id>.ngrok.io npm run setup:webhook');
    process.exit(1);
  }

  const url = buildWebhookUrl(base);
  console.log(`Subscribing webhook → ${url}`);
  console.log(`Events: ${EVENTS.join(', ')}`);

  const result = await subscribeWebhook(url, EVENTS);
  console.log('Done. WATI response:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Webhook setup failed:', err.message);
  process.exit(1);
});
