#!/usr/bin/env node
// Migra los contactos (clientes/direcciones) de Tookan a data/contacts.json,
// la libreta que consulta el bot de WATI (ver src/contacts.js).
//
// Dos fuentes posibles:
//   1. CSV exportado del panel de Tookan (recomendado):
//        Tookan Dashboard → Customers → Export CSV
//        node scripts/migrate-tookan.js --csv export-tookan.csv
//   2. API de Tookan (requiere TOOKAN_API_KEY en .env / entorno):
//        node scripts/migrate-tookan.js --api
//
// Salida:
//   data/contacts.json  → libreta usada por el servicio
//   data/contacts.csv   → copia en CSV por si quieres revisarla en Excel/Drive
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data');
const TOOKAN_BASE = 'https://api.tookanapp.com/v2';

async function main() {
  const args = process.argv.slice(2);
  let contacts;
  if (args[0] === '--csv' && args[1]) {
    contacts = fromCsv(readFileSync(path.resolve(args[1]), 'utf8'));
  } else if (args[0] === '--api') {
    contacts = await fromApi();
  } else {
    console.error('Uso: node scripts/migrate-tookan.js --csv <archivo.csv> | --api');
    process.exit(1);
  }

  contacts = dedupeByPhone(contacts.filter((c) => c.name || c.phone));
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, 'contacts.json'), JSON.stringify(contacts, null, 2));
  writeFileSync(path.join(OUT_DIR, 'contacts.csv'), toCsv(contacts));
  console.log(`Migrados ${contacts.length} contactos → data/contacts.json y data/contacts.csv`);
}

// ── Fuente 1: CSV del panel de Tookan ───────────────────────────────────────
export function fromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const col = (...names) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };
  const iName = col('name');
  const iPhone = col('phone');
  const iEmail = col('email');
  const iAddress = col('address');
  const iLat = col('latitude', 'lat');
  const iLng = col('longitude', 'lng', 'long');
  const iId = col('customer id', 'customer_id', 'id');

  return rows.slice(1).map((r) => ({
    tookanCustomerId: iId !== -1 ? r[iId] : undefined,
    name: iName !== -1 ? r[iName]?.trim() : '',
    phone: iPhone !== -1 ? r[iPhone]?.trim() : '',
    email: iEmail !== -1 ? r[iEmail]?.trim() || undefined : undefined,
    address: iAddress !== -1 ? r[iAddress]?.trim() : '',
    latitude: iLat !== -1 && r[iLat] ? Number(r[iLat]) : undefined,
    longitude: iLng !== -1 && r[iLng] ? Number(r[iLng]) : undefined,
  }));
}

// ── Fuente 2: API de Tookan ─────────────────────────────────────────────────
async function fromApi() {
  const apiKey = process.env.TOOKAN_API_KEY;
  if (!apiKey) {
    console.error('Falta TOOKAN_API_KEY en el entorno');
    process.exit(1);
  }
  const contacts = [];
  // Tookan pagina la lista de clientes; recorremos hasta que no devuelva más.
  for (let page = 1; ; page++) {
    const res = await fetch(`${TOOKAN_BASE}/get_all_customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, requested_page: page }),
    });
    const body = await res.json();
    if (body.status !== 200) {
      throw new Error(`Tookan respondió status ${body.status}: ${body.message}`);
    }
    const batch = Array.isArray(body.data) ? body.data : body.data?.customers || [];
    if (!batch.length) break;
    for (const c of batch) {
      contacts.push({
        tookanCustomerId: c.customer_id ?? c.vendor_id ?? c.id,
        name: c.customer_username || c.name || [c.first_name, c.last_name].filter(Boolean).join(' '),
        phone: c.customer_phone || c.phone || '',
        email: c.customer_email || c.email || undefined,
        address: c.customer_address || c.address || '',
        latitude: numOrUndef(c.latitude ?? c.lat),
        longitude: numOrUndef(c.longitude ?? c.lng),
      });
    }
    console.log(`Página ${page}: ${batch.length} clientes (total ${contacts.length})`);
  }
  return contacts;
}

// ── Utilidades ──────────────────────────────────────────────────────────────
export function dedupeByPhone(contacts) {
  const seen = new Map();
  for (const c of contacts) {
    const key = String(c.phone ?? '').replace(/\D/g, '').slice(-8) || `noph-${seen.size}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  return rows;
}

function toCsv(contacts) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = 'name,phone,email,address,latitude,longitude,tookanCustomerId';
  const lines = contacts.map((c) =>
    [c.name, c.phone, c.email, c.address, c.latitude, c.longitude, c.tookanCustomerId].map(esc).join(',')
  );
  return [header, ...lines].join('\n') + '\n';
}

function numOrUndef(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
