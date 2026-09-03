// Libreta de direcciones migrada desde Tookan (data/contacts.json).
// Shipday no expone una libreta de contactos por API, así que las direcciones
// viven aquí y el flujo de WATI las consulta para pre-llenar la dirección
// de clientes que ya compraron antes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

// Reemplaza la libreta completa (usado por POST /contacts/import para cargar
// los contactos migrados de Tookan en un despliegue nuevo).
export function saveContacts(contacts, file = DATA_FILE) {
  if (!Array.isArray(contacts)) {
    const err = new Error('Se espera un arreglo de contactos');
    err.status = 400;
    throw err;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(contacts, null, 2));
  cache = contacts;
  return contacts.length;
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
