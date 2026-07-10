import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksUnresolved, isValidPhone, watiCaptureToShipday } from '../src/shipday.js';

test('looksUnresolved detecta plantillas sin resolver de WATI', () => {
  assert.equal(looksUnresolved('@contact_wa_id'), true);
  assert.equal(looksUnresolved('{{phone}}'), true);
  assert.equal(looksUnresolved('50766746530'), false);
  assert.equal(looksUnresolved('Calle 18'), false);
  assert.equal(looksUnresolved(''), false);
});

test('isValidPhone acepta E.164 y rechaza basura', () => {
  assert.equal(isValidPhone('+50766746530'), true);
  assert.equal(isValidPhone('+'), false);
  assert.equal(isValidPhone('+123'), false); // muy corto
  assert.equal(isValidPhone('50766746530'), false); // sin +
});

const pickup = { name: 'QSP', address: 'X', phone: 'Y' };

test('rechaza pedido con variable de WATI sin resolver', () => {
  assert.throws(
    () => watiCaptureToShipday({ nombre: 'X', telefono: '@contact_wa_id', direccion: 'Calle 18' }, pickup),
    /sin resolver/
  );
});

test('rechaza pedido cuyo teléfono normaliza a algo inválido', () => {
  assert.throws(
    () => watiCaptureToShipday({ nombre: 'X', telefono: 'abc', direccion: 'Calle 18' }, pickup),
    /Teléfono inválido/
  );
});

test('acepta pedido válido normal', () => {
  const order = watiCaptureToShipday({ nombre: 'Ana', telefono: '6674-6530', direccion: 'Calle 18' }, pickup);
  assert.equal(order.customerPhoneNumber, '+50766746530');
});
