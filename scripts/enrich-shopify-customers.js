#!/usr/bin/env node
// Enriquece en Shopify los clientes migrados de Tookan SIN pisar datos:
// busca cada contacto por teléfono y (en modo --apply) agrega las etiquetas
// `tookan, delivery` si le faltan y la dirección de Tookan SOLO si el
// cliente no tiene ninguna dirección. Por defecto corre en MODO REPORTE
// (dry-run): no cambia nada, solo cuenta el estado real.
//
// Requisitos (app personalizada de Shopify con scopes read/write_customers):
//   $env:SHOPIFY_STORE_DOMAIN = "tu-tienda.myshopify.com"
//   $env:SHOPIFY_ADMIN_TOKEN  = "shpat_..."   (nunca en el chat)
//
// Uso:
//   node scripts/enrich-shopify-customers.js C:\ruta\customers.csv           # reporte
//   node scripts/enrich-shopify-customers.js C:\ruta\customers.csv --apply   # aplicar
//   ... --offset 2500   # reanudar desde el contacto #2500 si se cortó
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fromCsv, dedupeByPhone } from './migrate-tookan.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_VERSION = '2025-01';
const TAGS = ['tookan', 'delivery'];

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

async function gql(query, variables) {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    await sleep(2000);
    return gql(query, variables);
  }
  const body = await res.json();
  if (body.errors?.length) {
    const throttled = body.errors.some((e) => e.extensions?.code === 'THROTTLED');
    if (throttled) {
      await sleep(2000);
      return gql(query, variables);
    }
    throw new Error(JSON.stringify(body.errors).slice(0, 300));
  }
  return body.data;
}

function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (/^\d{7,8}$/.test(digits)) return `+507${digits}`;
  return `+${digits}`;
}

async function findCustomerByPhone(phone) {
  const data = await gql(
    `query($q: String!) {
       customers(first: 2, query: $q) {
         edges { node { id displayName tags defaultAddress { id } } }
       }
     }`,
    { q: `phone:${phone}` },
  );
  return data.customers.edges.map((e) => e.node);
}

async function addTags(id, tags) {
  const data = await gql(
    `mutation($id: ID!, $tags: [String!]!) {
       tagsAdd(id: $id, tags: $tags) { userErrors { message } }
     }`,
    { id, tags },
  );
  const errs = data.tagsAdd.userErrors;
  if (errs?.length) throw new Error(errs[0].message);
}

// Solo se llama cuando el cliente NO tiene ninguna dirección, así que
// escribir la lista completa de direcciones no borra nada.
async function setAddress(id, contact) {
  const data = await gql(
    `mutation($input: CustomerInput!) {
       customerUpdate(input: $input) { userErrors { field message } }
     }`,
    {
      input: {
        id,
        addresses: [{
          address1: (contact.address || '').slice(0, 255),
          city: 'Panamá',
          country: 'Panama',
          phone: normalizePhone(contact.phone),
        }],
      },
    },
  );
  const errs = data.customerUpdate.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
}

function loadContacts(input) {
  const raw = readFileSync(input, 'utf8');
  return input.toLowerCase().endsWith('.csv')
    ? dedupeByPhone(fromCsv(raw).filter((c) => c.name || c.phone))
    : JSON.parse(raw);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!DOMAIN || !TOKEN) {
    console.error('Faltan SHOPIFY_STORE_DOMAIN y/o SHOPIFY_ADMIN_TOKEN en el entorno');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const offsetIdx = args.indexOf('--offset');
  const offset = offsetIdx !== -1 ? parseInt(args[offsetIdx + 1], 10) || 0 : 0;
  const input = args.find((a) => !a.startsWith('--') && a !== String(offset)) || path.join(ROOT, 'data', 'contacts.json');

  const contacts = loadContacts(input).filter((c) => normalizePhone(c.phone));
  console.log(`${contacts.length} contactos con teléfono. Modo: ${apply ? 'APLICAR CAMBIOS' : 'solo reporte (dry-run)'}${offset ? `, desde #${offset}` : ''}`);

  const stats = { encontrados: 0, no_encontrados: 0, sin_direccion: 0, sin_tag: 0, etiquetados: 0, direcciones_agregadas: 0, errores: 0 };
  const pendientes = [];

  for (let i = offset; i < contacts.length; i++) {
    const c = contacts[i];
    const phone = normalizePhone(c.phone);
    try {
      const matches = await findCustomerByPhone(phone);
      if (!matches.length) {
        stats.no_encontrados++;
      } else {
        stats.encontrados++;
        const cust = matches[0];
        const faltanTags = TAGS.filter((t) => !cust.tags.map((x) => x.toLowerCase()).includes(t));
        const sinDireccion = !cust.defaultAddress;
        if (faltanTags.length) stats.sin_tag++;
        if (sinDireccion) stats.sin_direccion++;
        if (faltanTags.length || sinDireccion) {
          pendientes.push({ i, name: c.name, phone, faltanTags: !!faltanTags.length, sinDireccion });
        }
        if (apply) {
          if (faltanTags.length) { await addTags(cust.id, faltanTags); stats.etiquetados++; }
          if (sinDireccion && (c.address || '').trim()) { await setAddress(cust.id, c); stats.direcciones_agregadas++; }
        }
      }
    } catch (err) {
      stats.errores++;
      console.error(`  [#${i}] ${c.name} (${phone}): ${err.message.slice(0, 160)}`);
    }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${contacts.length} procesados…  (reanudable con --offset ${i + 1})`);
    await sleep(apply ? 350 : 250); // respeta el rate limit del API
  }

  console.log('\n===== RESUMEN =====');
  console.log(JSON.stringify(stats, null, 2));
  const reporte = path.join(ROOT, 'data', 'enriquecimiento-reporte.json');
  writeFileSync(reporte, JSON.stringify({ modo: apply ? 'apply' : 'dry-run', stats, pendientes }, null, 2));
  console.log(`Detalle guardado en ${reporte}`);
  if (!apply && (stats.sin_tag || stats.sin_direccion)) {
    console.log('\nPara aplicar los cambios, vuelve a correr el comando agregando --apply');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
