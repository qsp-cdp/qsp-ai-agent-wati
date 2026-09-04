import { detallesDeUnidad as fn } from './_unidad.mjs';
const casos = [
  ['#8871 Shopify', ['Apt. Oficina 46', 'Principal hacia Altos de Panama Plaza Mi Condado 3er Piso'], ['Oficina 46','3er Piso']],
  ['casa con numero', ['Romeral, calle 15, casa 123'], ['casa 123']],
  ['apto', ['Vía Argentina, edificio Torre Molino, apto 5B'], ['apto 5B']],
  ['sin unidad', ['Edificio Winky PB Av. Justo Arosemena Calle 41 Bella Vista'], []],
  ['vacio', [''], []],
  ['nulo', [null, undefined], []],
];
let fallos = 0;
for (const [nombre, entradas, esperados] of casos) {
  const got = fn(...entradas);
  const faltan = esperados.filter(e => !got.toLowerCase().includes(e.toLowerCase()));
  if (faltan.length) { console.log(`FALLA ${nombre}: "${got}" — falta ${faltan.join(', ')}`); fallos++; }
  else console.log(`ok  ${nombre.padEnd(16)} -> "${got}"`);
}
console.log(fallos === 0 ? `\ndetallesDeUnidad: ${casos.length}/${casos.length} OK` : `\n${fallos} fallos`);
