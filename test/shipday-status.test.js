import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShipdayStatusEvent, statusMessageFor } from '../src/shipday-status.js';

test('parsea evento de Shipday con order anidada', () => {
  const event = parseShipdayStatusEvent({
    event: 'ORDER_ONTHEWAY',
    order: { orderNumber: '1001', customerName: 'Ana', customerPhoneNumber: '+50761112233' },
    trackingUrl: 'https://track.shipday.com/x',
  });
  assert.equal(event.status, 'ORDER_ONTHEWAY');
  assert.equal(event.orderNumber, '1001');
  assert.equal(event.customerPhone, '+50761112233');
  const msg = statusMessageFor(event);
  assert.match(msg, /va en camino/);
  assert.match(msg, /track\.shipday\.com/);
});

test('entregado no incluye link de tracking', () => {
  const msg = statusMessageFor(
    parseShipdayStatusEvent({ orderStatus: 'delivered', orderNumber: '1002', trackingUrl: 'https://t' })
  );
  assert.match(msg, /entregado/);
  assert.doesNotMatch(msg, /https:\/\/t/);
});

test('evento desconocido o sin número de orden no genera mensaje', () => {
  assert.equal(statusMessageFor(parseShipdayStatusEvent({ event: 'GEO_UPDATE', orderNumber: '1' })), null);
  assert.equal(statusMessageFor(parseShipdayStatusEvent({ event: 'ORDER_ONTHEWAY' })), null);
});
