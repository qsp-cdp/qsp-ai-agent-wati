// Port Deno de src/shipday-status.js (la versión Node tiene las pruebas).
export interface StatusEvent {
  status: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  trackingUrl: string;
}

const STATUS_MESSAGES: Record<string, (o: StatusEvent) => string> = {
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

// Estado de Shipday → estado NORMALIZADO para la tabla `pedidos` (lo que lee el copiloto). Mismo
// vocabulario que STATUS_MESSAGES; cubre las formas con y sin prefijo ORDER_. Lo desconocido → 'desconocido'.
const ESTADO_NORMALIZADO: Record<string, string> = {
  ORDER_ASSIGNED: 'asignado', ORDER_ACCEPTED: 'asignado', ACCEPTED: 'asignado',
  STARTED: 'en_camino', ORDER_ONTHEWAY: 'en_camino', ONTHEWAY: 'en_camino', PICKED_UP: 'en_camino',
  ORDER_COMPLETED: 'entregado', COMPLETED: 'entregado', DELIVERED: 'entregado',
  ORDER_FAILED: 'fallido', FAILED_DELIVERY: 'fallido', INCOMPLETE: 'fallido',
};
export function estadoNormalizado(shipdayStatus: string): string {
  return ESTADO_NORMALIZADO[String(shipdayStatus || '').toUpperCase().replace(/\s+/g, '_')] ?? 'desconocido';
}

export function parseShipdayStatusEvent(payload: any = {}): StatusEvent {
  const order = payload.order || payload;
  const status = String(
    payload.event || payload.orderStatus || order.orderStatus || order.status || '',
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

export function statusMessageFor(event: StatusEvent): string | null {
  const build = STATUS_MESSAGES[event.status];
  if (!build || !event.orderNumber) return null;
  let msg = build(event);
  if (event.trackingUrl && !event.status.includes('COMPLETED') && !event.status.includes('DELIVERED')) {
    msg += `\nSíguelo aquí: ${event.trackingUrl}`;
  }
  return msg;
}

export { sendWatiSessionMessage } from './watiapi.ts';
