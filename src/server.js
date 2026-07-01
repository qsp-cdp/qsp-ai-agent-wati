import express from 'express';
import crypto from 'node:crypto';
import { createShipdayOrder, shopifyOrderToShipday, shouldDispatchShopifyOrder, watiCaptureToShipday } from './shipday.js';
import { findContactByPhone, saveContacts } from './contacts.js';
import { parseShipdayStatusEvent, statusMessageFor } from './shipday-status.js';
import { sendWatiSessionMessage } from './wati.js';

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
      if (!shouldDispatchShopifyOrder(shopifyOrder)) {
        console.log(`Pedido Shopify ${shopifyOrder.order_number ?? shopifyOrder.id} omitido (no es entrega local)`);
        return res.json({ ok: true, skipped: true });
      }
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

// Límite amplio para poder importar la libreta completa (~5 mil contactos).
app.use(express.json({ limit: '10mb' }));

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

// Carga la libreta migrada de Tookan en un despliegue nuevo (los datos no se
// versionan en git). Uso: curl -X POST .../contacts/import \
//   -H 'x-wati-token: ...' -H 'Content-Type: application/json' \
//   --data-binary @data/contacts.json
app.post('/contacts/import', requireWatiToken, (req, res) => {
  try {
    const count = saveContacts(req.body);
    console.log(`Libreta actualizada: ${count} contactos`);
    res.json({ ok: true, count });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ── Shipday → estados de entrega ────────────────────────────────────────────
// URL para cargar en Shipday: Integraciones → API → Configuración de Webhook:
//   https://TU-SERVICIO/webhooks/shipday/status?token=<SHIPDAY_WEBHOOK_TOKEN>
// Registra cada cambio de estado y, si WATI_NOTIFY=true, reenvía el aviso al
// cliente por WhatsApp vía WATI. Por defecto NO reenvía, porque Shipday ya
// notifica por su propio canal de WhatsApp (evita mensajes duplicados).
app.post('/webhooks/shipday/status', async (req, res) => {
  const expected = process.env.SHIPDAY_WEBHOOK_TOKEN;
  if (expected && req.query.token !== expected && req.get('x-shipday-token') !== expected) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  const event = parseShipdayStatusEvent(req.body);
  console.log(`Shipday: pedido ${event.orderNumber || '?'} → ${event.status || 'evento sin estado'}`);
  if (process.env.WATI_NOTIFY === 'true' && event.customerPhone) {
    const message = statusMessageFor(event);
    if (message) {
      try {
        await sendWatiSessionMessage(event.customerPhone, message);
      } catch (err) {
        console.error('No se pudo notificar por WATI:', err.message);
      }
    }
  }
  res.json({ ok: true });
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
