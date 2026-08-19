// Test de la lógica NUEVA del parser de shipday-status contra los 4 payloads REALES
// capturados del pedido 8848 (2026-08-19). Valida antes de desplegar a producción.

// ---- Lógica nueva (inlined, idéntica a la que irá en _shared/status.ts) ----
function normalizePhone(phone) {
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (/^\d{7,8}$/.test(digits)) return `+${digits.length <= 8 ? '507' : ''}${digits}`;
  return `+${digits}`;
}
const ESTADO_NORMALIZADO = {
  ORDER_ASSIGNED: 'asignado', ORDER_ACCEPTED: 'asignado', ACCEPTED: 'asignado',
  ORDER_ACCEPTED_AND_STARTED: 'en_camino',
  STARTED: 'en_camino', ORDER_ONTHEWAY: 'en_camino', ONTHEWAY: 'en_camino',
  PICKED_UP: 'en_camino', ORDER_PIKEDUP: 'en_camino', ORDER_PICKEDUP: 'en_camino',
  ORDER_COMPLETED: 'entregado', COMPLETED: 'entregado', DELIVERED: 'entregado',
  ORDER_FAILED: 'fallido', FAILED_DELIVERY: 'fallido', INCOMPLETE: 'fallido', ORDER_INCOMPLETE: 'fallido',
};
function estadoNormalizado(s) {
  return ESTADO_NORMALIZADO[String(s || '').toUpperCase().replace(/\s+/g, '_')] ?? 'desconocido';
}
const RANK_ESTADO = { nuevo:0, asignado:1, en_camino:2, entregado:3, fallido:3, cancelado:3 };
function rankEstado(e) { return RANK_ESTADO[String(e ?? '')] ?? -1; }
function parseShipdayStatusEvent(payload = {}) {
  const order = payload.order || payload;
  const delivery = payload.delivery_details || {};
  const customer = payload.customer || order.customer || {};
  const status = String(
    payload.event || payload.orderStatus || payload.order_status || order.orderStatus || order.status || '',
  ).toUpperCase().replace(/\s+/g, '_');
  return {
    status,
    orderNumber: String(order.order_number ?? order.orderNumber ?? payload.order_number ?? payload.orderNumber ?? ''),
    customerName: delivery.name || customer.name || order.customerName || '',
    customerPhone: delivery.phone || customer.phoneNumber || customer.phone || order.customerPhoneNumber || '',
    trackingUrl: payload.trackingUrl || order.trackingLink || order.trackingUrl || '',
  };
}

// ---- Payloads reales capturados (campos clave del pedido 8848) ----
const P = (event, order_status) => ({
  event, order_status,
  order: { id: 51976719, order_number: '8848', order_source: 'Shopify' },
  delivery_details: { name: 'Gianna Varcasia', phone: '60902631', location: { lat: 9.0161495, lng: -79.4862841 } },
  trackingUrl: 'https://dispatch.shipday.com/trackingPage/ZmFncXlxYWc=&lang=es',
});
const casos = [
  { nombre: 'ORDER_ASSIGNED',             p: P('ORDER_ASSIGNED', 'NOT_ACCEPTED'),        estado: 'asignado'   },
  { nombre: 'ORDER_UNASSIGNED',           p: P('ORDER_UNASSIGNED', 'NOT_ASSIGNED'),      estado: 'desconocido'},
  { nombre: 'ORDER_ACCEPTED_AND_STARTED', p: P('ORDER_ACCEPTED_AND_STARTED', 'STARTED'), estado: 'en_camino'  },
  { nombre: 'ORDER_PIKEDUP',              p: P('ORDER_PIKEDUP', 'PICKED_UP'),            estado: 'en_camino'  },
];

// ---- Asserts ----
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`); if (!cond) fail++; };

for (const c of casos) {
  const e = parseShipdayStatusEvent(c.p);
  check(e.orderNumber === '8848', `${c.nombre}: orderNumber = ${e.orderNumber} (esperado 8848)`);
  check(normalizePhone(e.customerPhone) === '+50760902631', `${c.nombre}: phone = ${normalizePhone(e.customerPhone)} (esperado +50760902631)`);
  check(estadoNormalizado(e.status) === c.estado, `${c.nombre}: estado = ${estadoNormalizado(e.status)} (esperado ${c.estado})`);
}

// Guard anti-degradación (webhooks fuera de orden)
check(rankEstado('en_camino') > rankEstado('asignado'), 'rank: en_camino > asignado (avanza, escribe)');
check(!(rankEstado('asignado') > rankEstado('en_camino')), 'rank: asignado NO supera a en_camino (no degrada)');
check(!(rankEstado('en_camino') > rankEstado('entregado')), 'rank: en_camino NO supera a entregado (no degrada tras entrega)');
check(rankEstado('asignado') > rankEstado('nuevo'), 'rank: asignado > nuevo (primer avance desde la fila shopify)');

// Retrocompatibilidad con la forma vieja (por si algún evento llega en formato de creación)
const viejo = { event: 'ORDER_ASSIGNED', order: { orderNumber: '9999', customerPhoneNumber: '+50761112222' } };
const ev = parseShipdayStatusEvent(viejo);
check(ev.orderNumber === '9999' && normalizePhone(ev.customerPhone) === '+50761112222', 'retrocompat: forma vieja sigue parseando');

console.log(`\n${fail === 0 ? '✅ TODOS LOS TESTS PASARON' : '❌ ' + fail + ' TEST(S) FALLARON'}`);
process.exit(fail === 0 ? 0 : 1);
