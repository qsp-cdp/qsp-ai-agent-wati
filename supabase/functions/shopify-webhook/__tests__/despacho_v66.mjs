import { readFileSync } from 'node:fs';
const src = readFileSync('supabase/functions/shopify-webhook/index.ts', 'utf8');

// Se extraen del CODIGO REAL para que la prueba siga al codigo, no a una copia.
const esFlotaPropiaSrc = src.match(/function esFlotaPropia\(zona: ZonaResuelta \| null\): boolean \{([\s\S]*?)\n\}/)[1];
const esFlotaPropia = new Function('zona', esFlotaPropiaSrc.replace(/: any/g, ''));
const provSrc = src.match(/function provinciaEsMetro\(shopifyOrder: any\): boolean \{([\s\S]*?)\n\}/)[1];
const provinciaEsMetro = new Function('shopifyOrder', provSrc.replace(/: any/g, ''));

// Replica de la decision tal como esta escrita en el handler (v66).
function decidir({ retiro, zona, zonaPin, orden, lineaCiudad = false }) {
  const nombroElInterior = zona?.motivo === 'fuera_del_area_metro';
  const provinciaRescata = provinciaEsMetro(orden) && !nombroElInterior;
  const sinMatchCiudad = zona?.estado === 'sin_match' && (lineaCiudad || provinciaRescata);
  const consultaPin = !retiro && zona?.estado !== 'ok' && !nombroElInterior;
  return {
    consultaPin,
    despachar: retiro ? false
      : (zona ? (esFlotaPropia(zona) || sinMatchCiudad || esFlotaPropia(consultaPin ? zonaPin : null))
              : (lineaCiudad || esFlotaPropia(consultaPin ? zonaPin : null))),
  };
}

// Fixtures tomados de la BASE y de Shopify el 24-ago, no inventados.
const Z_8871_TEXTO = { estado: 'sin_match' };
const Z_8871_PIN   = { estado: 'ambiguo', corregimiento: 'Ancón',
  opciones: [{ zona: 'Z1 Centro', metodo: 'propia', tarifa_usd: 6 },
             { zona: 'Z4b Puerta a puerta', metodo: 'servientrega', tarifa_usd: 9 }] };
const Z_8870_TEXTO = { estado: 'ok', ambito: 'interior', provincia: 'Bocas del Toro' };
const Z_8870_PIN   = { estado: 'sin_match', motivo: 'corregimiento_sin_zona', corregimiento: 'Las Huacas' };
const Z_8865_TEXTO = { estado: 'ok', ambito: 'metro', metodo: 'propia', zona: 'Z1 Centro' };
const Z_INTERIOR_TEXTO = { estado: 'sin_match', motivo: 'fuera_del_area_metro' };

const casos = [
  ['#8871 ciudad, texto falla, provincia Panama',
   { retiro: false, zona: Z_8871_TEXTO, zonaPin: Z_8871_PIN, orden: { shipping_address: { province: 'Panamá' } } },
   { despachar: true, consultaPin: true }],
  ['#8870 interior resuelto por texto: NUNCA mira el pin (que cayo en Cocle)',
   { retiro: false, zona: Z_8870_TEXTO, zonaPin: Z_8870_PIN, orden: { shipping_address: { province: 'Bocas del Toro' } } },
   { despachar: false, consultaPin: false }],
  ['#8865 ciudad resuelta por texto',
   { retiro: false, zona: Z_8865_TEXTO, zonaPin: null, orden: { shipping_address: { province: 'Panamá' } } },
   { despachar: true, consultaPin: false }],
  ['texto nombro el interior: ni provincia ni pin lo rescatan',
   { retiro: false, zona: Z_INTERIOR_TEXTO, zonaPin: { estado: 'ok', ambito: 'metro', metodo: 'propia' },
     orden: { shipping_address: { province: 'Panamá' } } },
   { despachar: false, consultaPin: false }],
  ['Panama Oeste no es flota propia',
   { retiro: false, zona: { estado: 'sin_match' }, zonaPin: null, orden: { shipping_address: { province: 'Panamá Oeste' } } },
   { despachar: false, consultaPin: true }],
  ['retiro en tienda nunca despacha',
   { retiro: true, zona: null, zonaPin: { estado: 'ok', ambito: 'metro', metodo: 'propia' },
     orden: { shipping_address: null } },
   { despachar: false, consultaPin: false }],
  ['pin metro rescata aunque la provincia venga vacia',
   { retiro: false, zona: { estado: 'sin_match' }, zonaPin: { estado: 'ok', ambito: 'metro', metodo: 'propia' },
     orden: { shipping_address: { province: '' } } },
   { despachar: true, consultaPin: true }],
];

let fallos = 0;
for (const [nombre, entrada, esperado] of casos) {
  const r = decidir(entrada);
  for (const k of Object.keys(esperado)) {
    if (r[k] !== esperado[k]) { console.log(`FALLA ${nombre} · ${k}: ${r[k]}, esperaba ${esperado[k]}`); fallos++; }
  }
}
console.log(fallos === 0 ? `despacho v66: ${casos.length}/${casos.length} OK` : `${fallos} fallos`);
