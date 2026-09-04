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
  ORDER_ACCEPTED_AND_STARTED: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  ORDER_ONTHEWAY: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  STARTED: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  PICKED_UP: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  ORDER_PIKEDUP: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  ORDER_PICKEDUP: (o) => `🛵 ¡Tu pedido ${o.orderNumber} va en camino!`,
  ORDER_COMPLETED: (o) => `✅ Tu pedido ${o.orderNumber} fue entregado. ¡Gracias por comprar con Quick Service Panama!`,
  DELIVERED: (o) => `✅ Tu pedido ${o.orderNumber} fue entregado. ¡Gracias por comprar con Quick Service Panama!`,
  ORDER_FAILED: (o) => `⚠️ No pudimos completar la entrega de tu pedido ${o.orderNumber}. Te contactaremos para coordinar.`,
  FAILED_DELIVERY: (o) => `⚠️ No pudimos completar la entrega de tu pedido ${o.orderNumber}. Te contactaremos para coordinar.`,
  INCOMPLETE: (o) => `⚠️ No pudimos completar la entrega de tu pedido ${o.orderNumber}. Te contactaremos para coordinar.`,
  ORDER_INCOMPLETE: (o) => `⚠️ No pudimos completar la entrega de tu pedido ${o.orderNumber}. Te contactaremos para coordinar.`,
};

// Estado de Shipday → estado NORMALIZADO para la tabla `pedidos` (lo que lee el copiloto). Mismo
// vocabulario que STATUS_MESSAGES; cubre las formas con y sin prefijo ORDER_. Lo desconocido → 'desconocido'.
// v66: el payload REAL del webhook manda ORDER_ACCEPTED_AND_STARTED y ORDER_PIKEDUP (con el typo de Shipday),
// que antes caían a 'desconocido'. ORDER_UNASSIGNED se deja SIN mapear a propósito → 'desconocido' → se omite
// (una desasignación no debe degradar un estado ya guardado).
const ESTADO_NORMALIZADO: Record<string, string> = {
  ORDER_ASSIGNED: 'asignado', ORDER_ACCEPTED: 'asignado', ACCEPTED: 'asignado',
  ORDER_ACCEPTED_AND_STARTED: 'en_camino',
  STARTED: 'en_camino', ORDER_ONTHEWAY: 'en_camino', ONTHEWAY: 'en_camino',
  PICKED_UP: 'en_camino', ORDER_PIKEDUP: 'en_camino', ORDER_PICKEDUP: 'en_camino',
  ORDER_COMPLETED: 'entregado', COMPLETED: 'entregado', DELIVERED: 'entregado',
  ORDER_FAILED: 'fallido', FAILED_DELIVERY: 'fallido', INCOMPLETE: 'fallido', ORDER_INCOMPLETE: 'fallido',
};
export function estadoNormalizado(shipdayStatus: string): string {
  return ESTADO_NORMALIZADO[String(shipdayStatus || '').toUpperCase().replace(/\s+/g, '_')] ?? 'desconocido';
}

// Orden de avance de un pedido. Se usa para NO DEGRADAR el estado ante webhooks fuera de orden
// (Shipday no garantiza el orden de entrega). Los estados terminales (entregado/fallido/cancelado)
// comparten el rango más alto: una vez entregado, un evento tardío no lo mueve.
export const RANK_ESTADO: Record<string, number> = {
  nuevo: 0, asignado: 1, en_camino: 2, entregado: 3, fallido: 3, cancelado: 3,
};
export function rankEstado(e?: string | null): number {
  return RANK_ESTADO[String(e ?? '')] ?? -1;
}

// Parser del payload del webhook de estados de Shipday.
// FORMA REAL (capturada 2026-08-19, ver docs/shipday/webhook-payload-real.md):
//   { event, order_status, order:{ order_number, id }, delivery_details:{ name, phone, ... }, trackingUrl }
// El teléfono vive en `delivery_details.phone` (NO en un objeto `customer`, que no existe en el webhook), y
// el número del comercio en `order.order_number` (NO `order.id`, que es el id interno de Shipday). Se
// mantienen como respaldo las rutas de la forma "de creación" (customer.*, orderNumber) por compatibilidad.
export function parseShipdayStatusEvent(payload: any = {}): StatusEvent {
  const order = payload.order || payload;
  const delivery = payload.delivery_details || {};
  const customer = payload.customer || order.customer || {};
  const status = String(
    payload.event || payload.orderStatus || payload.order_status || order.orderStatus || order.status || '',
  ).toUpperCase().replace(/\s+/g, '_');
  return {
    status,
    orderNumber: String(
      order.order_number ?? order.orderNumber ?? payload.order_number ?? payload.orderNumber ?? '',
    ),
    customerName: delivery.name || customer.name || order.customerName || '',
    customerPhone: delivery.phone || customer.phoneNumber || customer.phone || order.customerPhoneNumber || '',
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
