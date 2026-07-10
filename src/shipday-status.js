// Interpreta el webhook de estado de entrega de Shipday
// (Integraciones → API → Configuración de Webhook).
// El payload trae el evento/estado de la orden y los datos del cliente;
// aquí lo normalizamos y generamos el mensaje en español para el cliente.

const STATUS_MESSAGES = {
  ORDER_ASSIGNED: (o) => `📦 Tu pedido ${o.orderNumber} ya tiene repartidor asignado.`,
  ORDER_ACCEPTED: (o) => `📦 Tu pedido ${o.orderNumber} ya tiene repartidor asignado.`,
  ORDER_ONTHEWAY: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  STARTED: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  PICKED_UP: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  ORDER_COMPLETED: (o) => `✅ Tu pedido ${o.orderNumber} fue entregado. ¡Gracias por comprar con Quick Service Panama!`,
  DELIVERED: (o) => `✅ Tu pedido ${o.orderNumber} fue entregado. ¡Gracias por comprar con Quick Service Panama!`,
  ORDER_FAILED: (o) => `⚠️ No pudimos completar la entrega de tu pedido ${o.orderNumber}. Te contactaremos para coordinar.`,
  FAILED_DELIVERY: (o) => `⚠️ No pudimos completar la entrega de tu pedido ${o.orderNumber}. Te contactaremos para coordinar.`,
  INCOMPLETE: (o) => `⚠️ No pudimos completar la entrega de tu pedido ${o.orderNumber}. Te contactaremos para coordinar.`,
};

// Normaliza el payload del webhook de Shipday, que puede variar de forma
// según el evento: el estado puede venir en `event`, `orderStatus` u
// `order.orderStatus`, y el cliente en `customer` u `order`.
export function parseShipdayStatusEvent(payload = {}) {
  const order = payload.order || payload;
  const status = String(
    payload.event || payload.orderStatus || order.orderStatus || order.status || ''
  ).toUpperCase().replace(/\s+/g, '_');
  const customer = payload.customer || order.customer || {};
  return {
    status,
    orderNumber: String(order.orderNumber ?? order.order_number ?? payload.orderNumber ?? ''),
    customerName: customer.name || order.customerName || '',
    customerPhone: customer.phoneNumber || customer.phone || order.customerPhoneNumber || '',
    trackingUrl: payload.trackingUrl || order.trackingLink || order.trackingUrl || '',
  };
}

// Devuelve el mensaje de WhatsApp para el cliente, o null si el evento no
// amerita notificación (ej. estados internos de dispatch).
export function statusMessageFor(event) {
  const build = STATUS_MESSAGES[event.status];
  if (!build || !event.orderNumber) return null;
  let msg = build(event);
  if (event.trackingUrl && !event.status.includes('COMPLETED') && !event.status.includes('DELIVERED')) {
    msg += `\nSíguelo aquí: ${event.trackingUrl}`;
  }
  return msg;
}
