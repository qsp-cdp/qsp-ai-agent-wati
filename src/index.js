// Entry point: load env, report config, start the webhook server.
import 'dotenv/config';

import { config, configSummary, findConfigProblems } from './config.js';
import { createServer } from './server.js';

function printBanner() {
  console.log('────────────────────────────────────────────');
  console.log(' QSP WhatsApp AI Agent (WATI + Claude)');
  console.log('────────────────────────────────────────────');
  for (const [key, value] of Object.entries(configSummary())) {
    console.log(`  ${key.padEnd(14)} : ${value}`);
  }
  console.log('────────────────────────────────────────────');
}

function main() {
  printBanner();

  const problems = findConfigProblems();
  if (problems.length) {
    console.warn('⚠️  Configuration warnings (the agent will start, but calls will fail until fixed):');
    for (const p of problems) console.warn(`   - ${p}`);
    console.warn('   Copy .env.example to .env and fill in the values.');
  }

  const app = createServer();
  app.listen(config.server.port, () => {
    const path = config.server.webhookPath;
    console.log(`✅ Listening on http://localhost:${config.server.port}`);
    console.log(`   Webhook endpoint: POST ${path}`);
    console.log('');
    console.log('Next steps:');
    console.log(`   1. Expose this port publicly:   ngrok http ${config.server.port}`);
    console.log('   2. Subscribe the webhook:       PUBLIC_URL=https://<id>.ngrok.io npm run setup:webhook');
    console.log('   3. Send a WhatsApp message to your WATI number and watch the logs.');
  });
}

main();
