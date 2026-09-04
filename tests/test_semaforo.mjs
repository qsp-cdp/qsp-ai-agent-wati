// Pruebas del SEMÁFORO del correo de resumen (watchdog).
//
// El color del asunto es lo único que el equipo lee sin abrir el correo, así que su calibración es
// una decisión de producto, no un detalle: si el rojo se vuelve común deja de significar algo (medido
// el 18-ago, cuando una sola fila de `error` teñía de rojo un día que funcionó perfecto), y si algo
// roto sale en verde el correo miente. Estas pruebas fijan esa frontera.
//
// La función se EXTRAE del watchdog real; no hay copia que se pueda desincronizar.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { crearExtractor } from "./_extraer.mjs";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "watchdog", "index.ts"),
  "utf8",
);
const { semaforo } = crearExtractor(src).extraer(["semaforo"]);

const dia = (incidencias = {}, sinResponder = 0) => ({
  incidencias, sin_responder_n: sinResponder,
  clientes: { escribieron: 60, atendidos: 60, sin_atencion: 0 },
});

const casos = [
  // [nombre, resumen, minutosSinMensajes, saludOk, flags, iconoEsperado, motivoEsperado]
  ["día normal", dia(), 2, true, 0, "🟢", "ok"],
  ["copiloto caído", dia(), 2, false, 0, "🔴", "healthcheck"],
  ["silencio largo", dia(), 999, true, 0, "🔴", "silencio"],
  ["envío fallido", dia({ envio_fallido: 1 }), 2, true, 0, "🔴", "envio_fallido"],
  ["pedido web rechazado por firma", dia({ hmac_rechazado: 1 }), 2, true, 0, "🔴", "hmac_rechazado"],
  ["errores repetidos", dia({ errores: 5 }), 2, true, 0, "🔴", "errores"],
  // La calibración del 18-ago: incidencias sueltas son ámbar, no rojo.
  ["un error suelto NO es rojo", dia({ errores: 1 }), 2, true, 0, "🟡", "incidencias"],
  ["clientes esperando", dia({}, 3), 2, true, 0, "🟡", "sin_responder"],
  ["pedido con alerta de zona", dia(), 2, true, 2, "🟡", "pedido_flag"],
  ["respaldo de la API", dia({ respuesta_respaldo: 1 }), 2, true, 0, "🟡", "incidencias"],
  // Un audio transcrito no es una incidencia: es el sistema funcionando.
  ["audios transcritos NO ensucian el color", dia({ audios_transcritos: 12 }), 2, true, 0, "🟢", "ok"],
];

let fallos = 0;
for (const [nombre, r, mins, salud, flags, icono, motivo] of casos) {
  const got = semaforo(r, mins, salud, flags);
  if (got.icono !== icono || got.motivo !== motivo) {
    console.log(`FALLA ${nombre}: esperaba ${icono}/${motivo}, dio ${got.icono}/${got.motivo}`);
    fallos++;
  } else {
    console.log(`ok  ${nombre.padEnd(34)} -> ${got.icono} ${got.estado}`);
  }
}

// Precedencia: lo ROTO gana sobre lo pendiente. Un día con clientes esperando Y un envío fallido debe
// salir rojo — si saliera ámbar, el correo diría "hay trabajo" cuando en realidad hay algo quebrado.
const mezcla = semaforo(dia({ envio_fallido: 1 }, 5), 2, true, 0);
if (mezcla.icono !== "🔴") { console.log(`FALLA precedencia: esperaba 🔴, dio ${mezcla.icono}`); fallos++; }
else console.log(`ok  ${"lo roto gana sobre lo pendiente".padEnd(34)} -> ${mezcla.icono} ${mezcla.estado}`);

console.log(fallos === 0 ? `\nsemáforo: ${casos.length + 1}/${casos.length + 1} OK` : `\n${fallos} fallos`);
if (fallos) process.exit(1);
