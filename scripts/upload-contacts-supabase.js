#!/usr/bin/env node
// Sube la libreta migrada de Tookan (data/contacts.json) a la tabla
// public.contacts de Supabase. Reemplaza los contactos de origen 'tookan'
// existentes (los creados por WATI se conservan).
//
// Acepta directamente un CSV de Tookan o un contacts.json ya migrado:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<llave sb_secret_...> \
//   node scripts/upload-contacts-supabase.js C:\ruta\customers.csv
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromCsv, dedupeByPhone } from './migrate-tookan.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH = 500;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno');
  process.exit(1);
}
if (key.startsWith('sb_publishable_') || key.startsWith('eyJ') && key.includes('anon')) {
  console.error(
    'La llave es la PÚBLICA (publishable/anon). Necesitas la llave SECRETA ' +
    '(sb_secret_...) del dashboard → Settings → API keys → Secret keys.'
  );
  process.exit(1);
}
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

const file = process.argv[2] || path.join(ROOT, 'data', 'contacts.json');
const raw = readFileSync(file, 'utf8');
// Si es un CSV de Tookan lo migramos al vuelo; si es JSON lo leemos directo.
const contacts = file.toLowerCase().endsWith('.csv')
  ? dedupeByPhone(fromCsv(raw).filter((c) => c.name || c.phone))
  : JSON.parse(raw);
console.log(`${contacts.length} contactos leídos de ${path.basename(file)}`);

const rows = contacts.map((c) => ({
  tookan_customer_id: c.tookanCustomerId ?? null,
  name: c.name ?? '',
  phone: c.phone ?? '',
  email: c.email ?? null,
  address: c.address ?? '',
  latitude: c.latitude ?? null,
  longitude: c.longitude ?? null,
  source: 'tookan',
}));

// Borra la carga anterior de Tookan para que el comando sea re-ejecutable.
const del = await fetch(`${url}/rest/v1/contacts?source=eq.tookan`, { method: 'DELETE', headers });
if (!del.ok) {
  console.error(`Error limpiando contactos previos: ${del.status} ${await del.text()}`);
  process.exit(1);
}

let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const res = await fetch(`${url}/rest/v1/contacts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    console.error(`Error insertando lote ${i / BATCH + 1}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  inserted += batch.length;
  console.log(`${inserted}/${rows.length} contactos subidos`);
}
console.log(`Listo: ${inserted} contactos en Supabase (tabla public.contacts)`);
