// Puente entre `test_shipday_campos.mjs` y el código REAL: extrae `detallesDeUnidad` de
// `_shared/shipday.ts`.
//
// El commit que trajo la prueba no versionó este archivo, así que la única prueba del puente llevaba
// desde entonces sin correr (`ERR_MODULE_NOT_FOUND`) y nadie lo notó — el CI tampoco ejecutaba
// pruebas. Se reconstruye EXTRAYENDO la función del fuente, no copiando su cuerpo: una copia a mano
// se desincroniza y la prueba terminaría certificando código que ya no existe.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { crearExtractor } from "./_extraer.mjs";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "_shared", "shipday.ts"),
  "utf8",
);

export const detallesDeUnidad = crearExtractor(src).extraerFuncion("detallesDeUnidad");
