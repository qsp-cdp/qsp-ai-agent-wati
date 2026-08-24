import { readFileSync } from 'node:fs';
const src = readFileSync('supabase/functions/shopify-webhook/index.ts', 'utf8');
const m = src.match(/function provinciaEsMetro\(shopifyOrder: any\): boolean \{([\s\S]*?)\n\}/);
const fn = new Function('shopifyOrder', m[1].replace(/: any/g, '').replace(/const p =/, 'const p ='));
const casos = [
  ['#8871 ciudad',        'Panamá',        true],
  ['#8865 ciudad',        'Panamá',        true],
  ['#8870 Bocas',         'Bocas del Toro',false],
  ['#8863 Chiriqui',      'Chiriquí',      false],
  ['Panama Oeste',        'Panamá Oeste',  false],
  ['sin acento',          'Panama',        true],
  ['minusculas',          'panamá',        true],
  ['espacios',            '  Panamá  ',    true],
  ['Cocle',               'Coclé',         false],
  ['vacio',               '',              false],
  ['nulo',                null,            false],
];
let fallos = 0;
for (const [nombre, provincia, esperado] of casos) {
  const got = fn({ shipping_address: { province: provincia } });
  if (got !== esperado) { console.log(`FALLA ${nombre}: ${JSON.stringify(provincia)} -> ${got}, esperaba ${esperado}`); fallos++; }
}
console.log(fallos === 0 ? `provinciaEsMetro: ${casos.length}/${casos.length} OK` : `${fallos} fallos`);
