#!/usr/bin/env node
// Convierte la libreta migrada de Tookan (data/contacts.json) al CSV oficial
// de importación de clientes de Shopify, para que los asesores puedan crear
// pedidos de entrega buscando al cliente por nombre/teléfono en el admin.
//
// Uso: node scripts/export-shopify-customers.js [entrada.json|csv] [salida.csv]
// Salida por defecto: data/shopify-customers.csv
//
// Decisiones de mapeo:
// - El nombre completo va en "First Name" (muchos son empresas; partirlo
//   en nombre/apellido lo empeora). La búsqueda del admin funciona igual.
// - La dirección libre de Tookan va en "Default Address Address1".
// - Marketing (email/SMS) queda en "no": no hay consentimiento registrado.
// - Emails duplicados: solo el primero conserva el email (Shopify rechaza
//   filas con email repetido); el resto queda sin email pero con teléfono.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fromCsv, dedupeByPhone } from './migrate-tookan.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const HEADERS = [
  'First Name', 'Last Name', 'Email', 'Accepts Email Marketing',
  'Default Address Company', 'Default Address Address1', 'Default Address Address2',
  'Default Address City', 'Default Address Province Code', 'Default Address Country Code',
  'Default Address Zip', 'Default Address Phone', 'Phone',
  'Accepts SMS Marketing', 'Tags', 'Note', 'Tax Exempt',
];

export function contactsToShopifyRows(contacts) {
  const seenEmails = new Set();
  return contacts
    .filter((c) => (c.name || '').trim() || (c.phone || '').trim())
    .map((c) => {
      let email = (c.email || '').trim().toLowerCase();
      if (email) {
        if (seenEmails.has(email)) email = '';
        else seenEmails.add(email);
      }
      const phone = (c.phone || '').trim();
      return [
        (c.name || 'Cliente').trim(), // First Name (nombre completo o razón social)
        '',                            // Last Name
        email,
        'no',                          // Accepts Email Marketing
        '',                            // Company
        (c.address || '').trim(),      // Address1 (dirección libre de Tookan)
        '',                            // Address2
        'Panamá',                      // City
        '',                            // Province Code
        'PA',                          // Country Code
        '',                            // Zip
        phone,                         // Default Address Phone
        phone,                         // Phone (búsqueda por teléfono en el admin)
        'no',                          // Accepts SMS Marketing
        'tookan,delivery',             // Tags (para segmentar/filtrar)
        c.tookanCustomerId ? `Migrado de Tookan (ID ${c.tookanCustomerId})` : 'Migrado de Tookan',
        'no',                          // Tax Exempt
      ];
    });
}

function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [HEADERS, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

function main() {
  const input = process.argv[2] || path.join(ROOT, 'data', 'contacts.json');
  const output = process.argv[3] || path.join(ROOT, 'data', 'shopify-customers.csv');
  const raw = readFileSync(input, 'utf8');
  const contacts = input.toLowerCase().endsWith('.csv')
    ? dedupeByPhone(fromCsv(raw).filter((c) => c.name || c.phone))
    : JSON.parse(raw);
  const rows = contactsToShopifyRows(contacts);
  writeFileSync(output, toCsv(rows));
  console.log(`${rows.length} clientes exportados → ${output}`);
  const sinTelefono = rows.filter((r) => !r[12]).length;
  if (sinTelefono) console.log(`Aviso: ${sinTelefono} clientes sin teléfono (solo se podrán buscar por nombre).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
