// Pruebas de la sincronía de la réplica del catálogo (catalogo-sync).
//
// Las funciones puras se EXTRAEN del fuente real con el extractor compartido — no hay copia que se
// desincronice. Lo que se fija aquí es el contrato del webhook→fila: si Shopify cambia de forma o
// alguien "simplifica" la normalización, estos locks lo gritan antes del deploy.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { crearExtractor } from "./_extraer.mjs";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "catalogo-sync", "index.ts"),
  "utf8",
);
const { normalizarProducto, sinHtml } = crearExtractor(src).extraer(["normalizarProducto", "sinHtml"]);

let ok = 0, mal = 0;
function caso(nombre, cond) {
  if (cond) { ok++; } else { mal++; console.log(`  ✗ FALLA: ${nombre}`); }
}

// --- normalizarProducto: el payload REAL del webhook de Shopify -----------------------------------
const payload = {
  id: 7602035556422,
  title: "Caja de Mantenimiento Epson C9344",
  handle: "caja-de-mantenimiento-epson-c9344-c12934461-para-epson-l5590",
  vendor: "Epson",
  product_type: "Partes de Impresora",
  // ⚠️ El webhook manda los tags como UN string separado por comas — no un array.
  tags: "bestsellers, Epson EcoTank L3560, Epson Ecotank L5590, popular",
  status: "ACTIVE",
  updated_at: "2026-08-28T12:00:00-05:00",
  body_html: "<p>La caja <b>C9344</b> (EWMB3) recoge la tinta residual.</p><script>alert(1)</script>",
  image: { src: "https://cdn.shopify.com/x.jpg" },
  variants: [
    { id: 41843086950470, sku: "C12C934461", price: "20.00", compare_at_price: null },
    { id: 41843086950471, sku: "C12C934461-2P", price: "38.00", compare_at_price: "44.00" },
  ],
};
const fila = normalizarProducto(payload);
caso("fila válida con id/handle/título", fila && fila.id === 7602035556422 && fila.handle.includes("l5590") && fila.titulo.includes("C9344"));
caso("tags: el string con comas se vuelve array limpio", Array.isArray(fila.tags) && fila.tags.length === 4 && fila.tags.includes("Epson Ecotank L5590"));
caso("status normalizado a minúsculas", fila.status === "active");
caso("precio = el MÍNIMO entre variantes (para filtrar, jamás cotizar)", fila.precio_usd === 20);
caso("precio comparado presente (detección de oferta v64)", fila.precio_comparado_usd === 44);
caso("sku = el de la primera variante (regla MPN = SKU)", fila.sku === "C12C934461");
caso("variantes con variant_id/sku/precio (futuro carrito)", fila.variantes.length === 2 && fila.variantes[0].variant_id === 41843086950470);
caso("descripción sin HTML ni scripts", /C9344 \(EWMB3\)/.test(fila.descripcion) && !/<|alert/.test(fila.descripcion));

// Un payload roto NO produce una fila a medias: se descarta entero (el caller loguea payload_incompleto).
caso("sin id → null", normalizarProducto({ title: "x", handle: "x" }) === null);
caso("sin handle → null", normalizarProducto({ id: 1, title: "x" }) === null);
caso("sin título → null", normalizarProducto({ id: 1, handle: "x" }) === null);
caso("payload de products/delete (solo id) NO se upsertea", normalizarProducto({ id: 5 }) === null);

// --- sinHtml -------------------------------------------------------------------------------------
caso("sinHtml quita tags y entidades", sinHtml("<p>a &amp; b</p>") === "a & b");
caso("sinHtml colapsa espacios", sinHtml("  a\n\n  <br>  b  ") === "a b");

// --- locks de wiring sobre el fuente --------------------------------------------------------------
caso("HMAC fail-closed con los TRES motivos (patrón v68)", /'sin_secreto'/.test(src) && /'sin_cabecera'/.test(src) && /'no_cuadra'/.test(src));
caso("el rechazo HMAC se REGISTRA (un rechazo sin huella es un producto que desaparece)", /'hmac_rechazado'/.test(src));
caso("la reconciliación está gated por CATALOGO_SYNC_KEY fail-closed", /const SYNC_KEY = \(Deno\.env\.get\('CATALOGO_SYNC_KEY'\) \?\? ''\)\.trim\(\)/.test(src) && /!SYNC_KEY \|\|/.test(src));
caso("el archivado por watermark SOLO corre con recorrido completo", /if \(!parcial\) \{/.test(src));
caso("delete = soft-archive, nunca DELETE de la fila", /'archivado_local'/.test(src) && !/method: 'DELETE'/.test(src));
caso("payload inválido devuelve 200 (que Shopify no reintente lo irreparable); error nuestro devuelve 500", /payload_incompleto' \}, 200\)/.test(src) && /'interno' \}, 500\)/.test(src));
caso("la tabla NO guarda stock (línea roja: el stock replicado envejece en minutos)", !/inventory|stock/i.test(JSON.stringify(Object.keys(fila))));

console.log(`\ncatalogo-sync: ${ok} OK, ${mal} FALLA${mal === 1 ? "" : "S"}`);
if (mal > 0) process.exit(1);
