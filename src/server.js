// Express webhook server. Receives WATI events, acknowledges immediately, and
// processes inbound messages asynchronously through the agent.

import express from 'express';

import { config } from './config.js';
import { handleIncomingMessage } from './agent.js';

// Events this agent acts on. Other events (delivery/read receipts, etc.) are
// acknowledged and ignored.
const HANDLED_EVENTS = new Set(['message', 'newContactMessageReceived']);

/**
 * Pull the fields we need out of a WATI webhook body, or return null if the
 * event should be ignored (outbound echo, non-text, unhandled event, …).
 */
export function extractInbound(body) {
  if (!body || typeof body !== 'object') return null;

  const eventType = body.eventType || body.event || '';
  // If WATI labelled the event, only handle the two we care about.
  if (eventType && !HANDLED_EVENTS.has(eventType)) return null;

  // Ignore messages the business sent (echoes of our own replies).
  if (body.owner === true || body.fromMe === true) return null;

  const contact = body.contact || {};
  const from = body.waId || body.phone || body.from || contact.waId || contact.phone;
  if (!from) return null;

  const text = (body.text || body.body || body.message || body.caption || '').toString().trim();
  if (!text) return null; // simplest version handles text messages only

  const senderName = body.senderName || body.name || contact.name || '';

  return { from: String(from), text, senderName, eventType: eventType || 'message' };
}

export function createServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health checks.
  app.get('/', (_req, res) => res.json({ status: 'ok', service: 'qsp-ai-agent-wati' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Some providers probe the webhook URL with a GET; answer it.
  app.get(config.server.webhookPath, (_req, res) => res.status(200).send('OK'));

  app.post(config.server.webhookPath, (req, res) => {
    // Optional shared-secret check.
    if (config.server.verifyToken) {
      const token = req.query.token || req.get('x-webhook-token');
      if (token !== config.server.verifyToken) {
        return res.status(401).json({ error: 'invalid webhook token' });
      }
    }

    // Acknowledge fast so WATI doesn't retry/time out; process in the background.
    res.status(200).json({ received: true });

    const inbound = extractInbound(req.body);
    if (!inbound) return;

    handleIncomingMessage(inbound).catch((err) => {
      console.error(`[server] failed handling message from ${inbound.from}:`, err.message);
    });
  });

  return app;
}
