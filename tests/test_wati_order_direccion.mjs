// Prueba del RESPALDO de dirección para el despacho (wati-order): cuando la libreta `contacts` no
// tiene la dirección, se lee de los atributos del contacto en WATI. Caso real del 03-sep-2026 (conv
// 50760466239): cliente recurrente con la dirección en su ficha de WATI, sin fila en `contacts` →
// "El cliente no tiene dirección registrada" y el chatbot le volvió a pedir todo ("¿Cada vez que les
// compro debo repetir lo mismo?").
//
// La función se EXTRAE del fuente real (`_shared/shipday.ts`), como el resto de las suites: no hay
// copia que se desincronice.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { crearExtractor } from "./_extraer.mjs";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "_shared", "shipday.ts"),
  "utf8",
);
const { direccionDesdeAtributosWati } = crearExtractor(src).extraer(["direccionDesdeAtributosWati"]);

let ok = 0, mal = 0;
function caso(nombre, cond) {
  if (cond) { ok++; } else { mal++; console.log(`  ✗ FALLA: ${nombre}`); }
}
// Los atributos llegan de WATI como [{name, value}] (customParams); la función recibe ese arreglo.
const attrs = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));

// 1. La ficha que escribe el copiloto (v74+): direccion_envio / referencia_envio / pin_envio.
const r1 = direccionDesdeAtributosWati(attrs({
  direccion_envio: "Agencias Escoffery, Calle 1ra, Parque Lefevre",
  referencia_envio: "Después de la Gruta Azul, 2da cuadra a mano derecha",
  pin_envio: "https://maps.google.com/?q=9.01,-79.52",
  envio_estado: "📍 Lista para despacho (con pin)",
}));
caso("ficha del copiloto: dirección", r1?.direccion === "Agencias Escoffery, Calle 1ra, Parque Lefevre");
caso("ficha del copiloto: referencia", r1?.referencia === "Después de la Gruta Azul, 2da cuadra a mano derecha");
caso("ficha del copiloto: pin", r1?.maps_url === "https://maps.google.com/?q=9.01,-79.52");

// 2. La ficha del SISTEMA ANTERIOR (chatbot de WATI): el pin vivía en `maps_envio`.
const r2 = direccionDesdeAtributosWati(attrs({
  direccion_envio: "Tuscany Tower, Calle Winston Churchill",
  maps_envio: "https://goo.gl/maps/abc",
}));
caso("ficha anterior: dirección", r2?.direccion === "Tuscany Tower, Calle Winston Churchill");
caso("ficha anterior: maps_envio cuenta como pin", r2?.maps_url === "https://goo.gl/maps/abc");
caso("ficha anterior: sin referencia → null", r2?.referencia === null);

// 3. El copiloto escribe "-" como marcador de VACÍO (val()): no es una dirección.
caso("el marcador '-' es vacío", direccionDesdeAtributosWati(attrs({ direccion_envio: "-", referencia_envio: "-" })) === null);
caso("vacío/espacios es vacío", direccionDesdeAtributosWati(attrs({ direccion_envio: "   " })) === null);
caso("sin atributos → null", direccionDesdeAtributosWati([]) === null);
caso("entrada nula → null", direccionDesdeAtributosWati(null) === null);

// 4. Una variable de WATI sin resolver ("{{direccion}}") o un "@atributo" NO es una dirección
//    (misma regla que looksUnresolved en el despacho).
caso("variable sin resolver no cuenta", direccionDesdeAtributosWati(attrs({ direccion_envio: "{{direccion_envio}}" })) === null);
caso("'@' de plantilla no cuenta", direccionDesdeAtributosWati(attrs({ direccion_envio: "@direccion" })) === null);

// 5. Nombres de atributo: se toleran mayúsculas y espacios alrededor.
const r5 = direccionDesdeAtributosWati([{ name: " Direccion_Envio ", value: " Vía España, Edif. Sol " }]);
caso("nombre del atributo case-insensitive y sin espacios", r5?.direccion === "Vía España, Edif. Sol");

// 6. pin_envio manda sobre maps_envio cuando vienen los dos (el copiloto escribe ambos iguales; si
//    difieren, pin_envio es el más reciente).
const r6 = direccionDesdeAtributosWati(attrs({ direccion_envio: "X", pin_envio: "https://maps.google.com/?q=1,2", maps_envio: "https://goo.gl/viejo" }));
caso("pin_envio gana sobre maps_envio", r6?.maps_url === "https://maps.google.com/?q=1,2");

// 7. Valores largos se recortan (Shipday/WATI: 250 en la ficha; aquí un tope defensivo).
const largo = "Calle ".repeat(100);
caso("dirección larga se recorta", (direccionDesdeAtributosWati(attrs({ direccion_envio: largo }))?.direccion ?? "").length <= 400);

// 8. LA FICHA REAL del caso del incidente (50760466239, leída de WATI el 03-sep con el conector ya
//    renovado). La geografía vive en un atributo APARTE: sin componerla, a Shipday llegaba "Calle 97,
//    Via porras" — y `customerAddress` es lo que Google geocodifica para poner el pin del repartidor.
const rReal = direccionDesdeAtributosWati(attrs({
  direccion_envio: "Calle 97, Via porras",
  referencia_envio: "Frente a Athens",
  corregimiento_envio: "San Francisco",
  nombre: "Keilyn", empresa: "Panama Treasures",
}));
caso("ficha real: el corregimiento se compone en la dirección", rReal?.direccion === "Calle 97, Via porras, San Francisco");
caso("ficha real: la referencia se conserva", rReal?.referencia === "Frente a Athens");
caso("ficha real: sin pin en la ficha → maps_url null", rReal?.maps_url === null);

// 9. Orden geográfico calle → corregimiento → distrito → provincia (el mismo del camino de Shopify).
const r9 = direccionDesdeAtributosWati(attrs({
  direccion_envio: "Calle 50, Edif. Tower",
  corregimiento_envio: "Bella Vista", distrito_envio: "Panamá", provincia_envio: "Panamá",
}));
caso("orden geográfico calle → corregimiento → distrito → provincia", r9?.direccion === "Calle 50, Edif. Tower, Bella Vista, Panamá");

// 10. No duplicar lo que la calle YA dice (muchas direcciones traen el sector escrito a mano).
const r10 = direccionDesdeAtributosWati(attrs({
  direccion_envio: "Calle 97, Via Porras, San Francisco",
  corregimiento_envio: "San Francisco",
}));
caso("no repite el sector que la calle ya nombra", r10?.direccion === "Calle 97, Via Porras, San Francisco");
// …y el descarte es insensible a acentos y mayúsculas: "Panamá" no se agrega dos veces por la tilde.
const r11 = direccionDesdeAtributosWati(attrs({ direccion_envio: "Vía España, Panama", provincia_envio: "Panamá" }));
caso("el descarte ignora acentos y mayúsculas", r11?.direccion === "Vía España, Panama");

// 11. Sin geografía en la ficha, el comportamiento es EXACTAMENTE el de antes (no se rompe lo que ya andaba).
caso("sin atributos de geografía, la dirección queda igual",
  direccionDesdeAtributosWati(attrs({ direccion_envio: "Tuscany Tower, Calle Winston Churchill" }))?.direccion === "Tuscany Tower, Calle Winston Churchill");
// El marcador "-" tampoco se cuela como si fuera un corregimiento.
caso("un corregimiento en '-' no ensucia la dirección",
  direccionDesdeAtributosWati(attrs({ direccion_envio: "Calle 1ra", corregimiento_envio: "-" }))?.direccion === "Calle 1ra");
caso("el tope de 400 se respeta al componer",
  (direccionDesdeAtributosWati(attrs({ direccion_envio: largo, corregimiento_envio: "San Francisco" }))?.direccion ?? "").length <= 400);

// --- Cableado en wati-order (locks sobre el fuente real, estilo golden) ----------------------------
const orden = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "wati-order", "index.ts"),
  "utf8",
);
caso("wati-order importa el respaldo (getWatiContact + direccionDesdeAtributosWati)",
  /import \{ getWatiContact, sendWatiSessionMessage \} from '\.\.\/_shared\/watiapi\.ts'/.test(orden)
  && /direccionDesdeAtributosWati, HttpError/.test(orden));
// ORDEN: primero la libreta, después la ficha de WATI, y el 400 SOLO cuando las dos están vacías.
caso("wati-order: libreta → ficha WATI → 400, en ese orden", (() => {
  const iLib = orden.indexOf("const contacto = await findContactByPhone(capture.telefono);");
  const iWati = orden.indexOf("ficha = await getWatiContact(capture.telefono);");
  const i400 = orden.indexOf("throw new HttpError(400, 'El cliente no tiene dirección ni en la libreta ni en su ficha de WATI");
  return iLib > -1 && iWati > iLib && i400 > iWati;
})());
// Un fallo de red al leer WATI NO es fatal: se registra y el despacho sigue con lo que haya.
caso("wati-order: la lectura de WATI va en try/catch con telemetría", /catch \(err\) \{\s*\n\s*await logJob\('wati-order', 'ficha_wati_fallo', false/.test(orden));
caso("wati-order: registra cuándo la dirección salió de WATI", /logJob\('wati-order', 'direccion_desde_wati', true/.test(orden));
// El error ya no menciona `wati-address` (una función que no existe en esta rama) y deja el teléfono.
caso("wati-order: el 400 ya no apunta a wati-address", !/flujo wati-address/.test(orden));
caso("wati-order: el 400 deja el teléfono en el log (sin_direccion)", /logJob\('wati-order', 'sin_direccion', false, \{\s*\n\s*telefono_final/.test(orden));
// La autocura de la libreta: el upsert tras crear la orden sigue existiendo y usa capture.direccion.
caso("wati-order: la libreta se autocura con la dirección usada (upsertContactByPhone tras la orden)", (() => {
  const iOrden = orden.indexOf("const result = await createShipdayOrder(order);");
  const iUp = orden.indexOf("await upsertContactByPhone({");
  return iOrden > -1 && iUp > iOrden && /address: capture\.direccion,/.test(orden.slice(iUp, iUp + 400));
})());

console.log(mal === 0 ? `\nwati-order dirección desde WATI: ${ok}/${ok + mal} OK` : `\n${mal} FALLA(S), ${ok} OK`);
if (mal > 0) process.exit(1);
