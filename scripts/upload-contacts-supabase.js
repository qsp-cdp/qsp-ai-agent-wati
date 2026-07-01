#!/usr/bin/env node
// Sube la libreta migrada de Tookan (data/contacts.json) a la tabla
// public.contacts de Supabase. Reemplaza los contactos de origen 'tookan'
// existentes (los creados por WATI se conservan).
//
// Uso:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/upload-contacts-supabase.js [data/contacts.json]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH = 500;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno');
  process.exit(1);
}
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

const file = process.argv[2] || path.join(ROOT, 'data', 'contacts.json');
const contacts = JSON.parse(readFileSync(file, 'utf8'));

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
