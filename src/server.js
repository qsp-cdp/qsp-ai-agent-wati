import express from 'express';
import crypto from 'node:crypto';
import { createShipdayOrder, shopifyOrderToShipday, watiCaptureToShipday } from './shipday.js';
import { findContactByPhone } from './contacts.js';

const app = express();

// ── Shopify → Shipday ───────────────────────────────────────────────────────
// Ruta de respaldo: la vía recomendada y sin fricción es la app nativa de
// Shipday en Shopify (ver README). Usa este webhook solo si necesitas
// personalizar el mapeo del pedido.
app.post(
  '/webhooks/shopify/orders-create',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!verifyShopifyHmac(req)) {
      return res.status(401).json({ error: 'Firma HMAC inválida' });
    }
    try {
      const shopifyOrder = JSON.parse(req.body.toString('utf8'));
      const order = shopifyOrderToShipday(shopifyOrder);
      const result = await createShipdayOrder(order);
      console.log(`Pedido Shopify ${order.orderNumber} enviado a Shipday`);
      res.json({ ok: true, shipday: result });
    } catch (err) {
      console.error('Error Shopify→Shipday:', err.message);
      // 200 para que Shopify no reintente indefinidamente en errores de datos;
      // los errores quedan en los logs.
      res.status(err.status === 400 ? 200 : 500).json({ ok: false, error: err.message });
    }
  }
);

app.use(express.json());

// ── WATI → Shipday ──────────────────────────────────────────────────────────
// El flujo de WATI (plantilla de captura de dirección) llama aquí con los
// datos del cliente. Ver docs/plantilla-wati.md.
app.post('/webhooks/wati/order', requireWatiToken, async (req, res) => {
  try {
    const order = watiCaptureToShipday(req.body);
    const result = await createShipdayOrder(order);
    console.log(`Pedido WATI ${order.orderNumber} enviado a Shipday`);
    res.json({ ok: true, orderNumber: order.orderNumber, shipday: result });
  } catch (err) {
    console.error('Error WATI→Shipday:', err.message);
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// Consulta de la libreta migrada desde Tookan: el bot de WATI puede
// pre-llenar la dirección de un cliente recurrente por su teléfono.
app.get('/contacts/lookup', requireWatiToken, (req, res) => {
  const contact = findContactByPhone(req.query.phone);
  if (!contact) return res.status(404).json({ found: false });
  res.json({ found: true, contact });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

function verifyShopifyHmac(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return false;
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
  const digest = crypto.createHmac('sha256', secret).update(req.body).digest('base64');
  return (
    hmacHeader.length === digest.length &&
    crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
  );
}

function requireWatiToken(req, res, next) {
  const expected = process.env.WATI_WEBHOOK_TOKEN;
  if (!expected || req.get('x-wati-token') !== expected) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  next();
}

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`qsp-delivery-bridge escuchando en :${port}`));
}

export default app;
