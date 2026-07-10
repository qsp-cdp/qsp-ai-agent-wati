import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromCsv, dedupeByPhone, parseCsv } from '../scripts/migrate-tookan.js';

test('parsea CSV exportado de Tookan con comillas y comas', () => {
  const csv =
    'Customer Id,Name,Phone,Email,Address,Latitude,Longitude\n' +
    '101,"Pérez, Ana",+50761112233,ana@x.com,"Ave. Balboa, Torre X",8.98,-79.52\n' +
    '102,Luis Gómez,62224455,,Vía Argentina,,\n';
  const contacts = fromCsv(csv);
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].name, 'Pérez, Ana');
  assert.equal(contacts[0].address, 'Ave. Balboa, Torre X');
  assert.equal(contacts[0].latitude, 8.98);
  assert.equal(contacts[1].latitude, undefined);
});

test('deduplica por los últimos 8 dígitos del teléfono', () => {
  const out = dedupeByPhone([
    { name: 'A', phone: '+507 6111-2233' },
    { name: 'B', phone: '61112233' },
    { name: 'C', phone: '62224455' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'A');
});

test('parseCsv maneja saltos de línea CRLF', () => {
  const rows = parseCsv('a,b\r\n1,2\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});
