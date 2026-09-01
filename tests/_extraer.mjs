// tests/_extraer.mjs — extractor de funciones/consts desde el fuente TypeScript REAL.
//
// Las pruebas de este repo NO copian el código que verifican: lo EXTRAEN del .ts y lo evalúan. Una
// copia a mano se desincroniza del original y la prueba pasa a certificar código que ya no existe —
// justo la clase de regresión que estas pruebas deberían cazar. Lo usan `golden.mjs` (copiloto) y
// `_unidad.mjs` (puente Shipday), así que vive en un solo lugar.
//
// Reglas que costaron sangre y no conviene relajar:
//   · Nunca tragarse un error de extracción. Un lock que "pasa" porque la función devolvió undefined
//     es peor que no tener lock: da confianza falsa. Si algo no se puede extraer, esto TRUENA.
//   · El balanceo de llaves ignora strings, comentarios y literales de regex — este código está lleno
//     de los tres, y un balanceo ingenuo corta la función a la mitad.
//   · Las anotaciones de tipo se quitan por separado en la FIRMA y en el CUERPO: aplicar el strip de
//     parámetros al cuerpo rompe los object literals ({ metodo: met } -> { metodo }).

export function crearExtractor(src, env = {}) {
  // Shim de Deno: el código extraído lee su configuración con Deno.env.get. Devolviendo undefined, las
  // funciones caen a sus DEFAULTS — que es justamente el comportamiento que hay que fijar en una prueba
  // (lo que corre cuando nadie tocó un secreto). `env` permite forzar un valor cuando la prueba quiere
  // verificar el otro camino.
  const _deno = { env: { get: (k) => (k in env ? env[k] : undefined) } };
// Quita las anotaciones de TS. La FIRMA de una función se limpia aparte del CUERPO: aplicar el
// strip de parámetros al cuerpo rompería los object literals ({ metodo: met } -> { metodo }).
  function sinTiposCuerpo(s) {
  return s
    // Tipo con LLAVES:  const fuera: { handle: string; ref: string | null }[] = [];
    // Va primero: los patrones de abajo cortan en el primer ";" o "=", y dentro de un tipo así hay
    // ambos → dejaban un `const fuera;` seguido de la mitad del tipo suelta.
    .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*\{[^{}]*\}(?:\s*\[\s*\])*\s*=/g, "$1 $2 =")
    .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*\{[^{}]*\}(?:\s*\[\s*\])*\s*;/g, "$1 $2;")
    .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[^=;\n]+=/g, "$1 $2 =")
    // declaración tipada SIN inicializador:  let parsed: any;
    .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[^=;\n]+;/g, "$1 $2;")
    .replace(/\s+as\s+(const|[A-Za-z_$][\w$.<>\[\]|]*)/g, "")
    // argumentos de tipo en llamadas y constructores: new Set<string>() / fn<T>(x)
    .replace(/([A-Za-z_$][\w$.]*)\s*<[^<>();{}]*>\s*\(/g, "$1(")
    // tipo de RETORNO de arrow functions: (c: any): string => ...  (si solo se quitan los parámetros,
    // el tipo de retorno queda como identificador suelto y revienta con "string is not defined")
    .replace(/\)\s*:\s*[A-Za-z_$][\w$.<>\[\]| ]*=>/g, ") =>")
    // parámetros tipados de arrow functions dentro del cuerpo: (c: any) => ...
    .replace(/\(([^()\n]*:[^()\n]*)\)\s*=>/g, (m, p) =>
      "(" + p.split(",").map((x) => x.split(":")[0].trim()).filter(Boolean).join(", ") + ") =>");
}
// Corta por `sep` solo al NIVEL SUPERIOR, respetando <>, (), [] y {}. Un `split(",")` pelado parte
// `Record<string, string>` por la coma de adentro y deja un parámetro fantasma llamado `string>`, que
// revienta al evaluar. El `>` de una arrow (`=>`) no cuenta como cierre.
function partirNivelCero(s, sep) {
  const salida = []; let prof = 0, actual = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "<" || c === "(" || c === "[" || c === "{") prof++;
    else if (c === ")" || c === "]" || c === "}") prof--;
    else if (c === ">" && s[i - 1] !== "=") prof--;
    if (c === sep && prof === 0) { salida.push(actual); actual = ""; continue; }
    actual += c;
  }
  salida.push(actual);
  return salida;
}

  function sinTipos(d) {
  if (!/^(async )?function/.test(d)) return sinTiposCuerpo(d);
  // OJO: la firma ya viene normalizada por decl() con un regex ANCLADO al inicio. Repetir aquí esa
  // limpieza sin anclar era destructivo: `[^{;]+` cruza líneas y el primer "):" de un COMENTARIO se
  // enganchaba con la "{" de una arrow varias líneas abajo, borrando el código de en medio.
  //
  // La "{" del CUERPO no es la primera que aparece tras el ")": un tipo de retorno puede traer llaves
  // propias —`): { handle: string; ref: string | null }[] {`— y quedarse con esa dejaba la firma
  // cortada a la mitad. La del cuerpo es la única cuyo bloque termina donde termina la declaración.
  const ib = inicioDelCuerpo(d, finDeParams(d));
  let sig = d.slice(0, ib), cuerpo = d.slice(ib);
  sig = sig.replace(/\)\s*:\s*[\s\S]+$/, ")");                    // tipo de retorno
  const ip = sig.indexOf("(");
  const params = partirNivelCero(sig.slice(ip + 1, sig.lastIndexOf(")")), ",")
    .map((p) => partirNivelCero(p, ":")[0].trim()).filter(Boolean).join(", ");
  return `${sig.slice(0, ip)}(${params}) ${sinTiposCuerpo(cuerpo)}`;
}

// Devuelve el índice de la llave que CIERRA el bloque abierto en `ini`, ignorando llaves que viven
// dentro de strings, plantillas, comentarios o literales de regex. Un balanceo ingenuo corta la
// función en la primera "}" que aparezca dentro de un texto — y produce código que evalúa pero
// revienta al llamarlo (o peor: un lock que pasa sin probar nada).
  function finDeBloque(s, ini) {
  let d = 0;
  for (let i = ini; i < s.length; i++) {
    const c = s[i], sig = s[i + 1];
    if (c === "/" && sig === "/") { i = s.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && sig === "*") { i = s.indexOf("*/", i + 2) + 1; if (i < 1) break; continue; }
    if (c === "'" || c === '"' || c === "`") {
      const cierre = c;
      for (i++; i < s.length; i++) { if (s[i] === "\\") i++; else if (s[i] === cierre) break; }
      continue;
    }
    if (c === "/") {
      // ¿literal de regex? lo es si lo anterior significativo abre una expresión
      let k = i - 1; while (k >= 0 && /\s/.test(s[k])) k--;
      if (k < 0 || "(,=:[!&|?{};+-*%~^".includes(s[k])) {
        let clase = false;
        for (i++; i < s.length; i++) {
          if (s[i] === "\\") { i++; continue; }
          if (s[i] === "[") clase = true;
          else if (s[i] === "]") clase = false;
          else if (s[i] === "/" && !clase) break;
          else if (s[i] === "\n") break;
        }
        continue;
      }
continue;
    }
    if (c === "{") d++;
    else if (c === "}") { d--; if (!d) return i; }
  }
  return s.length - 1;
}

// Índice del ")" que cierra la lista de parámetros (puede haber paréntesis anidados en un tipo
// función). `finDeBloque` NO sirve para esto: balancea llaves, no paréntesis.
function finDeParams(s) {
  const ini = s.indexOf("(");
  for (let i = ini, prof = 0; i < s.length; i++) {
    if (s[i] === "(") prof++;
    else if (s[i] === ")" && !--prof) return i;
  }
  return ini;
}

// Índice de la "{" que abre el CUERPO, saltándose las que pertenezcan al tipo de RETORNO.
//   function f(x: string): { handle: string; ref: string | null }[] {   ← la 2ª es la del cuerpo
// El truco: tras balancear una llave, se mira qué sigue. Si tras saltar lo que puede formar parte de
// un tipo (espacios, [], |, &, <>, identificadores) aparece OTRA "{", la anterior era del tipo. Los
// paréntesis quedan FUERA de ese conjunto a propósito: con ellos dentro, el "function g() {" que viene
// después en el archivo se leería como continuación del tipo y se saltaría el cuerpo de verdad.
function inicioDelCuerpo(s, desde) {
  for (let i = s.indexOf("{", desde); i > -1; i = s.indexOf("{", i + 1)) {
    let k = finDeBloque(s, i) + 1;
    while (k < s.length && /[\s\[\]|&<>,.\w]/.test(s[k])) k++;
    if (s[k] !== "{") return i;
    i = s.indexOf("{", k) - 1;   // era el tipo: seguimos desde la siguiente llave
  }
  return -1;
}

  function decl(n) {
  let i = src.indexOf(`function ${n}(`);
  if (i < 0) i = src.search(new RegExp(`const ${n}\\s*[:=]`));
  if (i < 0) return null;
  // recorta hasta el cierre balanceado (función) o fin de sentencia (const simple)
  if (src.startsWith("async ", i - 6)) i -= 6;
  if (/^(async )?function/.test(src.slice(i))) {
    // El tipo de RETORNO puede llevar llaves —  function leerStock(t: unknown): { nivel: string } {  —
    // y entonces el balanceo tomaría el "{" del TIPO por el del cuerpo y devolvería una función
    // truncada que evalúa pero revienta al llamarla. Se normaliza la firma ANTES de balancear.
    // (Antes esto era un regex que exigía la "{" del cuerpo PEGADA al tipo, así que un retorno como
    //  `: {…}[] {` no matcheaba y se colaba la función truncada.)
    const bruto = src.slice(i);
    const ini = inicioDelCuerpo(bruto, finDeParams(bruto));
    if (ini < 0) return null;
    const firma = bruto.slice(0, ini).replace(/\)\s*:\s*[\s\S]+$/, ") ");
    const norm = firma + bruto.slice(ini);
    return norm.slice(0, finDeBloque(norm, firma.length) + 1);
  }
  let j = i, d = 0, s = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    else if (c === "`") s = !s;
    else if (c === ";" && !d && !s) break;
  }
  return src.slice(i, j + 1);
}
// Extrae funciones/consts del index.ts real resolviendo dependencias SOLO cuando hacen falta: si el
// eval —o una LLAMADA— truena con "X is not defined", se agrega X y se reintenta. Arrastrar todo lo que
// el texto mencione traería medio archivo; y tragarse el error (lo que hacía el harness portado) deja
// locks que "pasan" sin probar nada, que es peor que no tenerlos.
  function extraer(nombres) {
  const puestos = new Map();
  const añadir = (n) => { if (puestos.has(n)) return true; const d = decl(n); if (!d) return false; puestos.set(n, sinTipos(d)); return true; };
  nombres.forEach((n) => { if (!añadir(n)) throw new Error(`no encontré ${n} en index.ts`); });
  const construir = () => {
    for (let intento = 0; intento < 60; intento++) {
      try { return eval(`const Deno = _deno;\n${[...puestos.values()].join("\n")}\n({${[...puestos.keys()].join(",")}})`); }
      catch (e) {
        const m = String(e.message).match(/(\w+) is not defined/);
        if (!m || !añadir(m[1])) throw e;
      }
    }
    throw new Error("demasiadas dependencias al extraer " + nombres.join(", "));
  };
  let api = construir();
  // envoltura: una dependencia que solo se descubre AL LLAMAR (una const usada en una rama) se
  // resuelve igual, en vez de devolver undefined y falsear el lock.
  const envolver = (n) => (...a) => {
    for (let intento = 0; intento < 60; intento++) {
      try {
        const r = api[n](...a);
        // Varias funciones del copiloto atrapan su propio error y devuelven {error:"..."} (estilo
        // defensivo del repo): ahí el ReferenceError no llega como excepción, viene DENTRO del
        // resultado. Si no se mira, el lock compara contra un objeto de error y pasa por casualidad.
        const dentro = typeof r === "string" ? r : JSON.stringify(r ?? "");
        const mr = dentro.match(/ReferenceError: (\w+) is not defined/);
        if (mr && añadir(mr[1])) { api = construir(); continue; }
        return r;
      }
      catch (e) {
        const m = String(e.message).match(/(\w+) is not defined/);
        if (!m || !añadir(m[1])) throw e;
        api = construir();
      }
    }
    throw new Error("no pude resolver las dependencias de " + n);
  };
  const salida = {};
  for (const n of nombres) salida[n] = typeof api[n] === "function" ? envolver(n) : api[n];
  return salida;
}


  const extraerFuncion = (n) => {
    const v = extraer([n])[n];
    if (v === undefined) throw new Error(`no encontré ${n} en el fuente`);
    return v;
  };
  return { extraer, extraerFuncion, decl, sinTipos };
}
