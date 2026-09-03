import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDispatchShopifyOrder } from '../src/shipday.js';

const localOrder = { shipping_lines: [{ title: 'Entrega Local', code: 'Local Delivery' }] };
const pickupOrder = { shipping_lines: [{ title: 'Retiro en tienda', code: 'Pickup' }] };

test('sin filtro se despachan todos los pedidos', () => {
  assert.equal(shouldDispatchShopifyOrder(pickupOrder, ''), true);
  assert.equal(shouldDispatchShopifyOrder(localOrder, undefined), true);
});

test('con filtro solo pasan los métodos de entrega local', () => {
  const filter = 'entrega local,local delivery';
  assert.equal(shouldDispatchShopifyOrder(localOrder, filter), true);
  assert.equal(shouldDispatchShopifyOrder(pickupOrder, filter), false);
  assert.equal(shouldDispatchShopifyOrder({ shipping_lines: [] }, filter), false);
});

test('el filtro no distingue mayúsculas y coincide por code', () => {
  assert.equal(
    shouldDispatchShopifyOrder({ shipping_lines: [{ code: 'LOCAL DELIVERY' }] }, 'local delivery'),
    true
  );
});
