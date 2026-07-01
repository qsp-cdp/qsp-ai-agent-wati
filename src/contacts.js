// Libreta de direcciones migrada desde Tookan (data/contacts.json).
// Shipday no expone una libreta de contactos por API, así que las direcciones
// viven aquí y el flujo de WATI las consulta para pre-llenar la dirección
// de clientes que ya compraron antes.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'contacts.json');

let cache = null;

export function loadContacts(file = DATA_FILE) {
  if (cache) return cache;
  cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  return cache;
}

export function resetContactsCache() {
  cache = null;
}

// Busca por teléfono ignorando formato (+507, espacios, guiones).
export function findContactByPhone(phone, contacts = loadContacts()) {
  const needle = lastDigits(phone);
  if (!needle) return null;
  return contacts.find((c) => lastDigits(c.phone) === needle) || null;
}

function lastDigits(phone, n = 8) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.slice(-n) || null;
}
