// Cliente mínimo del API de Shipday.
// Docs: https://docs.shipday.com — autenticación "Authorization: Basic <API_KEY>".
const SHIPDAY_BASE_URL = 'https://api.shipday.com';

export async function createShipdayOrder(order, { apiKey = process.env.SHIPDAY_API_KEY, fetchFn = fetch } = {}) {
  if (!apiKey) {
    throw new Error('Falta SHIPDAY_API_KEY en el entorno');
  }
  const res = await fetchFn(`${SHIPDAY_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(order),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shipday respondió ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Decide si un pedido de Shopify debe generar entrega en Shipday.
// SHOPIFY_DELIVERY_FILTER: lista separada por comas de textos a buscar en el
// método de envío (ej. "entrega local,local delivery"). Vacío = todos los
// pedidos. Así los retiros en tienda o envíos nacionales no crean viajes.
export function shouldDispatchShopifyOrder(shopifyOrder, filter = process.env.SHOPIFY_DELIVERY_FILTER) {
  const terms = (filter || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!terms.length) return true;
  const methods = (shopifyOrder.shipping_lines || []).map((l) =>
    `${l.title ?? ''} ${l.code ?? ''}`.toLowerCase()
  );
  return methods.some((m) => terms.some((t) => m.includes(t)));
}

// Convierte un pedido de Shopify (payload del webhook orders/create) al
// formato de inserción de órdenes de Shipday.
export function shopifyOrderToShipday(shopifyOrder, pickup = defaultPickup()) {
  const shipping = shopifyOrder.shipping_address || shopifyOrder.billing_address || {};
  const customer = shopifyOrder.customer || {};
  const name =
    shipping.name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    'Cliente';
  const addressParts = [shipping.address1, shipping.address2, shipping.city, shipping.province, shipping.country]
    .filter(Boolean)
    .join(', ');

  const order = {
    orderNumber: String(shopifyOrder.order_number ?? shopifyOrder.name ?? shopifyOrder.id),
    customerName: name,
    customerAddress: addressParts,
    customerPhoneNumber: shipping.phone || shopifyOrder.phone || customer.phone || '',
    customerEmail: shopifyOrder.email || customer.email || undefined,
    restaurantName: pickup.name,
    restaurantAddress: pickup.address,
    restaurantPhoneNumber: pickup.phone,
    totalOrderCost: Number(shopifyOrder.total_price) || undefined,
    deliveryFee: Number(shopifyOrder.total_shipping_price_set?.shop_money?.amount) || undefined,
    deliveryInstruction: shopifyOrder.note || undefined,
    orderSource: 'Shopify',
    orderItem: (shopifyOrder.line_items || []).map((li) => ({
      name: li.title,
      quantity: li.quantity,
      unitPrice: Number(li.price) || 0,
    })),
  };
  if (shipping.latitude != null && shipping.longitude != null) {
    order.deliveryLatitude = Number(shipping.latitude);
    order.deliveryLongitude = Number(shipping.longitude);
  }
  return order;
}

// Convierte los datos capturados por la plantilla de WATI al formato Shipday.
// Campos esperados (ver docs/plantilla-wati.md): nombre, telefono, direccion,
// referencia (opcional), pedido (texto o lista), total (opcional).
export function watiCaptureToShipday(capture, pickup = defaultPickup()) {
  const required = ['nombre', 'telefono', 'direccion'];
  const missing = required.filter((f) => !String(capture?.[f] ?? '').trim());
  if (missing.length) {
    const err = new Error(`Faltan campos obligatorios: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }
  const direccion = [capture.direccion, capture.referencia].filter(Boolean).join(' — ');
  const items = Array.isArray(capture.items)
    ? capture.items.map((it) => ({
        name: it.name ?? String(it),
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
      }))
    : undefined;

  return {
    orderNumber: capture.orderNumber || `WATI-${Date.now()}`,
    customerName: String(capture.nombre).trim(),
    customerAddress: direccion,
    customerPhoneNumber: normalizePhone(capture.telefono),
    restaurantName: pickup.name,
    restaurantAddress: pickup.address,
    restaurantPhoneNumber: pickup.phone,
    totalOrderCost: capture.total != null ? Number(capture.total) : undefined,
    deliveryInstruction: capture.pedido ? `Pedido: ${capture.pedido}` : undefined,
    orderSource: 'WATI',
    ...(items ? { orderItem: items } : {}),
  };
}

export function normalizePhone(phone) {
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  // Panamá: celulares de 8 dígitos → anteponer +507
  if (/^\d{7,8}$/.test(digits)) return `+507${digits}`;
  return `+${digits}`;
}

export function defaultPickup() {
  return {
    name: process.env.PICKUP_NAME || 'Quick Service Panama',
    address: process.env.PICKUP_ADDRESS || '',
    phone: process.env.PICKUP_PHONE || '',
  };
}
