import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopifyOrderToShipday, watiCaptureToShipday, normalizePhone } from '../src/shipday.js';

const pickup = { name: 'QSP', address: 'Calle 50, Panamá', phone: '+5071234567' };

test('mapea un pedido de Shopify a Shipday', () => {
  const shopifyOrder = {
    order_number: 1001,
    email: 'ana@example.com',
    note: 'Dejar en portería',
    total_price: '45.50',
    shipping_address: {
      name: 'Ana Pérez',
      address1: 'Ave. Balboa, Torre X',
      address2: 'Apto 12B',
      city: 'Ciudad de Panamá',
      country: 'Panama',
      phone: '6000-0000',
      latitude: 8.98,
      longitude: -79.52,
    },
    line_items: [{ title: 'Tinta HP 954', quantity: 2, price: '22.75' }],
  };
  const order = shopifyOrderToShipday(shopifyOrder, pickup);
  assert.equal(order.orderNumber, '1001');
  assert.equal(order.customerName, 'Ana Pérez');
  assert.match(order.customerAddress, /Ave\. Balboa.*Apto 12B.*Ciudad de Panamá/);
  assert.equal(order.totalOrderCost, 45.5);
  assert.equal(order.deliveryLatitude, 8.98);
  assert.equal(order.orderItem.length, 1);
  assert.equal(order.orderItem[0].unitPrice, 22.75);
  assert.equal(order.restaurantName, 'QSP');
});

test('mapea la captura de WATI a Shipday', () => {
  const order = watiCaptureToShipday(
    {
      nombre: 'Carlos Jordán',
      telefono: '6111-2233',
      direccion: 'Vía España, Edif. Roma',
      referencia: 'frente al banco',
      pedido: '1x Epson L3250',
      total: '289',
    },
    pickup
  );
  assert.equal(order.customerName, 'Carlos Jordán');
  assert.equal(order.customerPhoneNumber, '+50761112233');
  assert.equal(order.customerAddress, 'Vía España, Edif. Roma — frente al banco');
  assert.equal(order.totalOrderCost, 289);
  assert.match(order.orderNumber, /^WATI-/);
});

test('rechaza captura de WATI sin dirección', () => {
  assert.throws(
    () => watiCaptureToShipday({ nombre: 'X', telefono: '61112233' }, pickup),
    /direccion/
  );
});

test('normaliza teléfonos de Panamá', () => {
  assert.equal(normalizePhone('6111-2233'), '+50761112233');
  assert.equal(normalizePhone('+507 6111 2233'), '+50761112233');
  assert.equal(normalizePhone('50761112233'), '+50761112233');
});
