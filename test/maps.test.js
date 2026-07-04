import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMapsCoords, watiCaptureToShipday } from '../src/shipday.js';

test('extrae coordenadas de los formatos comunes de Google Maps', () => {
  assert.deepEqual(
    parseMapsCoords('https://www.google.com/maps/place/QSP/@8.9824,-79.5199,17z/data=x'),
    { lat: 8.9824, lng: -79.5199 }
  );
  assert.deepEqual(parseMapsCoords('https://maps.google.com/?q=8.98,-79.52'), { lat: 8.98, lng: -79.52 });
  assert.deepEqual(parseMapsCoords('https://google.com/maps?ll=8.98,-79.52&z=17'), { lat: 8.98, lng: -79.52 });
  assert.deepEqual(parseMapsCoords('https://google.com/maps/data=!3d8.9824!4d-79.5199'), { lat: 8.9824, lng: -79.5199 });
});

test('links cortos o inválidos devuelven null sin romper', () => {
  assert.equal(parseMapsCoords('https://maps.app.goo.gl/AbC123'), null);
  assert.equal(parseMapsCoords(''), null);
  assert.equal(parseMapsCoords(undefined), null);
  assert.equal(parseMapsCoords('https://x.com/@999.0,200.0'), null); // fuera de rango
});

test('extrae coordenadas de la ubicación nativa de WhatsApp (geo:) y de destination=', () => {
  assert.deepEqual(parseMapsCoords('geo:8.9927,-79.5343'), { lat: 8.9927, lng: -79.5343 });
  assert.deepEqual(
    parseMapsCoords('https://www.google.com/maps/dir/?api=1&destination=8.9927,-79.5343'),
    { lat: 8.9927, lng: -79.5343 }
  );
});

test('coordenadas explícitas (lat/lng) tienen prioridad sobre el link', () => {
  const pickup = { name: 'QSP', address: 'X', phone: 'Y' };
  const order = watiCaptureToShipday(
    { nombre: 'Ana', telefono: '61112233', direccion: 'PH Elmare', lat: 9.01, lng: -79.5,
      maps_url: 'https://www.google.com/maps/@8.98,-79.52,17z' },
    pickup
  );
  assert.equal(order.deliveryLatitude, 9.01);   // gana lat/lng, no el @8.98 del link
  assert.equal(order.deliveryLongitude, -79.5);
});

test('el pedido WATI incluye el mapa en instrucciones y coordenadas si las hay', () => {
  const pickup = { name: 'QSP', address: 'X', phone: 'Y' };
  const order = watiCaptureToShipday(
    {
      nombre: 'Ana',
      telefono: '61112233',
      direccion: 'PH Elmare 4000',
      maps_url: 'https://www.google.com/maps/@8.9824,-79.5199,17z',
      pedido: '1x HP 954',
    },
    pickup
  );
  assert.equal(order.deliveryLatitude, 8.9824);
  assert.equal(order.deliveryLongitude, -79.5199);
  assert.match(order.deliveryInstruction, /Pedido: 1x HP 954/);
  assert.match(order.deliveryInstruction, /📍 Mapa: https:\/\/www\.google\.com/);
});
