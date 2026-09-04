# Asesor pide dirección / ubicación / datos de entrega

Minado de `messages` (role='assistant' AND model='human-agent', ~14,500 filas) — proyecto Supabase `jbigmlcalcwiphqeudxd`. Solo SELECT, dedupe por `lower(trim(content))`. Fecha: 2026-08-21.

Frases del asesor humano cuya intención es **pedir al cliente su dirección, ubicación o datos de entrega** (incluye pedir confirmación de la dirección). Texto anonimizado: `<nombre>`, `<dir>`.

## 1) Frase → frecuencia (top 40)

| # | Frase (normalizada) | n |
|---|---|---|
| 1 | a que dirección desea el envío? | 70 |
| 2 | 📍 ¿cuál es la dirección exacta de entrega? (provincia, corregimiento, barrio, calle) | 19 |
| 3 | 🗺️ para que el repartidor llegue exacto, comparte tu ubicación con 📎 adjuntar → ubicación, o pega un link de google maps (o escribe "no") | 17 |
| 4 | 📍 ¿cuál es la dirección exacta de entrega? (calle, edificio, piso/apto, barrio) | 15 |
| 5 | 🏠 ¿alguna referencia? (frente a qué queda, color del edificio…, # de casa) | 13 |
| 6 | 🏠 ¿alguna referencia? (frente a qué queda, color del edificio…) | 11 |
| 7 | me permite la dirección exacta de entrega | 6 |
| 8 | donde es la entrega? | 6 |
| 9 | esta seria la dirección de entrega? | 5 |
| 10 | me permite la dirección de entrega | 3 |
| 11 | 🗺️ si desea, pegue un link de google maps de su ubicación (o responda «no»). | 2 |
| 12 | 🏠 ¿alguna referencia? (…) puede responder «ninguna». | 2 |
| 13 | necesitamos tu dirección de entrega primero 📍 | 2 |
| 14 | a que dirección seria el envío? | 2 |
| 15 | a que dirección desea la entrega? | 2 |
| 16 | sí, a que dirección desea el envío? | 2 |
| 17 | a que dirección desea el envío (sin ?) | 2 |
| 18 | cual es la direccion? | 2 |
| 19 | donde es la ubicacion? | 2 |
| 20 | me permite la dirección exacta de envío | 1 |
| 21 | me facilita la direccion de la entrega por favor | 1 |
| 22 | me brinda la dirección porfas | 1 |
| 23 | me avisa cual es la direccion | 1 |
| 24 | paseme la direccion de entrega por favro *(sic)* | 1 |
| 25 | paseme la ubicacion por favor | 1 |
| 26 | puede pasarme la ubicacion por favor | 1 |
| 27 | ok, deme la direccion escrita por favor | 1 |
| 28 | pago recibido, escribame la direccion por favor para realizar la guia | 1 |
| 29 | me indica la direccion para programar la entrega, los pedidos van saliendo al medio dia… | 1 |
| 30 | buen dia, me confirma por favor la ubicacion | 1 |
| 31 | favor me permite su ubicación exacta, para verificar si es posible realizar un envío puerta a puerta por medio de servientrega | 1 |
| 32 | si, todavia esta disponible, se le puede entregar mañana, me facilita la ubicacion por favor | 1 |
| 33 | hacemos entregas por un costo adicional, ¿cual es su direccion? quedo atento | 1 |
| 34 | si hacemos envios por un costo adicional dependiendo de la ubicacion, ¿cual seria la direccion? | 1 |
| 35 | favor dame los datos del lugar de entrega | 1 |
| 36 | por favor si me puede confirmar el lugar de entrega | 1 |
| 37 | nos indica donde sería el delivery para añdirle el costo *(sic)* | 1 |
| 38 | a qué sucursal se le enviaría? (envío por Servientrega) | 1 |
| 39 | adjunto cotización. donde sería el envio para añadirle el costo? | 1 |
| 40 | factura emitida, donde seria la entrega? | 1 |

Otras variantes n=1 relevantes: "donde seria la entrega?", "ddonde seria la entrega?" *(sic)*, "donde seria el envio_", "donde es la entrega? la puedo enviar en motouber", "donde es la ubicacion de entrega?", "donde es la direccion?", "quedo atento a la dirección de entrega", "quedo atento a que me de la direccion para hacer la guia", "escribame la direccion…", "me confirma la direccion, <dir>", "ok necesito me de los datos de envio.", "y los datos de facturación y dirección de entrega", "para que sucursal lo ponemos?", "buenos días, que a qué ubicación sería la entrega?", "cree que me podria enviar la ubicación por medio de google maps", "esa es la direccion de entrega?", "la entrega en <dir>? o cual es la direccion?", "las entregas tienen un costo adicional segun la distancia, donde seria la entrega?", "los envios tienen un costo adicional, con gusto se lo agrego si me dice donde es la entrega", "buenas tardes, por favor si me puede indicar el lugar de entregas…", "buendia, ya el pedido lo tengo completo… y donde seria la entrega en caso tal".

Total minado: **~65 frases distintas, ~215 mensajes** en la categoría.

## 2) Falsos negativos del regex actual (frases reales que se escapan)

La familia más frecuente que se escapa es **"dónde es/sería la entrega/el envío"** (el regex actual exige `dónde` seguido casi inmediato del verbo enviar/entregar, pero el patrón real es `dónde + es/sería + la entrega`):

1. "donde es la entrega?" (n=6) y "donde es la entrega? la puedo enviar en motouber"
2. "donde seria la entrega?" / "ddonde seria la entrega?" / "buenas tardes, donde seria la entrega?" / "factura emitida, donde seria la entrega?" / "…y donde seria la entrega en caso tal"
3. "donde seria el envio_"
4. "las entregas tienen un costo adicional segun la distancia, donde seria la entrega?"
5. "los envios tienen un costo adicional, con gusto se lo agrego si me dice donde es la entrega"
6. "adjunto cotización. donde sería el envio para añadirle el costo?"
7. "nos indica donde sería el delivery para añdirle el costo" (delivery no está en el regex)
8. "si realizamos envíos por un costo adicional, ubicación de donde seria el envió" (sin artículo antes de "ubicación")
9. "favor dame los datos del lugar de entrega" (`datos (de|para)` no cubre "datos del lugar")
10. "por favor si me puede confirmar el lugar de entrega" / "…si me puede indicar el lugar de entregas"
11. "🏠 ¿alguna referencia? (frente a qué queda, color del edificio…)" (n≈26 en 3 variantes; solo cubría "punto de referencia")
12. "a qué sucursal se le enviaría?" / "para que sucursal lo ponemos?" (destino de envío por Servientrega)
13. "donde siempre se les a entregado?" *(sic)* (borderline; también se escapa del propuesto)

## 3) Falsos positivos del regex actual (matchea pero NO pide dirección)

La alternativa `(su|la|tu|una|que|cual) (dirección|ubicación)` es demasiado ancha; matchea casi cualquier mención. Contraejemplos reales que hoy matchean:

1. "las entregas tienen un costo adicional segun la ubicacion" (+ ~8 variantes "…dependiendo de la ubicacion" — tarifa, no ask)
2. "si, por un costo adicional segun la ubicacion" / "si tiene un costo adicional dependiendo de la ubicacion"
3. "depende de la dirección de envío" / "depende de la dirección de entrega"
4. "¡listo! guardamos tu dirección de entrega ✅ …" (n=12, confirmación post-captura)
5. "¡listo! guardamos su dirección de entrega ✅ un asesor continúa con su pedido." (n=2)
6. "⚠️ no pudimos guardar tu dirección, un asesor te ayudará en un momento." (n=3)
7. "se le puede enviar por servientrega y retira en la sucursal mas cercana a su ubicacion"
8. "van por brisas del golf, va en ruta hacia su ubicacion" (pedido en camino)
9. "recibido, gracias. un asesor confirma el pago y le comparte la ubicación por aquí mismo." (comparte la ubicación DE LA TIENDA)
10. "la direccion de entrega es en <dir>" (asesor afirma la dirección, no la pide)
11. "me sale esta direccion de entrega" (asesor lee la dirección que ya tiene)
12. "esta seria la ubicación" (asesor comparte ubicación de la tienda)
13. "puede pasar a retirar a nuestra oficina o hacemos entregas por un costo adicional dependiendo de la ubicacion"
14. "el cartucho… pueden pasar a retirar o entregas por un costo adicional segun la ubicacion" (familia grande de mensajes de disponibilidad+tarifa)
15. "tenemos registrada esta dirección de entrega: 📍 <dir> …" (flujo de reuso de dirección; borderline)
16. "me avisa si la guia esta bien con la direccion de entrega" (borderline: verificación de guía)

No matchean (bien): "ubicación: ave. ricardo j. alfaro, plaza aventura, piso 4 local 454…" y "dirección: calle 11, servi plaza colon…" (direcciones de la tienda, sin artículo previo), "esta es nuestra ubicación".

## 4) Regex propuesto (JS, flag i)

Diseño: se elimina la red ancha `articulo + dirección/ubicación` y se reemplaza por 4 familias ancladas: (a) interrogativo `cuál/qué [+ sucursal]`, (b) `dónde es/sería + entrega/envío/delivery/ubicación`, (c) verbo de petición + dirección/ubicación con ventana corta, (d) flujos de ubicación GPS/referencia. Validado con node contra 32 positivos y 20 contraejemplos reales: 0 FN, 0 FP.

```js
const pideDireccion = /\b(?:cu[aá]l|qu[eé])\s[^?.!\n]{0,30}(?:direcci[oó]n|ubicaci[oó]n|sucursal)|\b(?:a|para|hacia) d[oó]nde\b[^?.!\n]{0,20}(?:env[ií]|entreg|mand|llev|despach|ser[ií]a)|\bd[oó]nde (?:es|ser[aá]|ser[ií]a|queda)\b[^?.!\n]{0,25}(?:entreg|env[ií]|delivery|despach|ubicaci|direcci)|\b(?:permit[ae]|confirm[ae]|indi(?:ca|que)|facilit[ae]|brind[ae]|regal[ae]|deme|dame|escr[ií]b[ae]|env[ií][ae]|enviar(?:me|nos)?|avis[ae]|necesit|quedo atent[oa] a)[^.;!\n]{0,20}(?:direcci[oó]n|ubicaci[oó]n)|\bp[aá]s[ae](?:me|nos|rme|rnos)?[^.;\n]{0,15}(?:direcci[oó]n|ubicaci[oó]n)|compart[ae](?:me|nos)?[^.;\n]{0,15}(?:tu|su)s? (?:ubicaci[oó]n|direcci[oó]n)|\bdatos\b[^.;\n]{0,35}(?:entrega|env[ií]o|despacho)|\b(?:confirmar?|indicar?|indique|facilitar?|d[ií]game|me diga)[^.;\n]{0,25}lugar de entrega|punto de referencia|alguna referencia\s*\?|peg(?:a|ue)[^.;\n]{0,30}(?:google maps|ubicaci[oó]n)|(?:esta|esa) (?:es|ser[ií]a) la (?:direcci[oó]n|ubicaci[oó]n) de (?:entrega|env[ií]o)|adjuntar[^.;\n]{0,15}ubicaci[oó]n/i;
```

Notas de diseño:
- No usar `\b` DESPUÉS de `qu[eé]`: en JS `é` no es word-char y `\bqué\b` falla; se exige `\s` en su lugar.
- `compart[ae]` exige `tu/su` → distingue "comparte tu ubicación" (ask) de "le comparte la ubicación" (la tienda comparte la suya).
- Ventanas cortas (`{0,15..35}` sin `.` `;` ni salto de línea) evitan que "enviar … a su ubicacion" o "confirma el pago y le comparte la ubicación" crucen de cláusula.
- Trade-offs aceptados (n=1 c/u): FN "la dirección seria en <dir>… me confirma porfas" (verbo después del sustantivo), FN "la dirección esta correcta?", FN "donde siempre se les ha entregado?".

## 5) Lista de prueba

**DEBEN matchear (12, reales):**
1. "a que dirección desea el envío?"
2. "📍 ¿cuál es la dirección exacta de entrega? (provincia, corregimiento, barrio, calle)"
3. "me permite la dirección exacta de entrega"
4. "donde es la entrega?"
5. "factura emitida, donde seria la entrega?"
6. "paseme la direccion de entrega por favro"
7. "🗺️ para que el repartidor llegue exacto, comparte tu ubicación con 📎 adjuntar → ubicación, o pega un link de google maps"
8. "favor dame los datos del lugar de entrega"
9. "por favor si me puede confirmar el lugar de entrega"
10. "🏠 ¿alguna referencia? (frente a qué queda, color del edificio…)"
11. "a qué sucursal se le enviaría?"
12. "hacemos entregas por un costo adicional, ¿cual es su direccion? quedo atento"

**NO deben matchear (8, reales):**
1. "las entregas tienen un costo adicional segun la ubicacion"
2. "¡listo! guardamos tu dirección de entrega ✅ cuando confirmes tu pedido, lo preparamos para envío."
3. "depende de la dirección de envío"
4. "van por <dir>, va en ruta hacia su ubicacion"
5. "se le puede enviar por servientrega y retira en la sucursal mas cercana a su ubicacion"
6. "recibido, gracias. un asesor confirma el pago y le comparte la ubicación por aquí mismo."
7. "esta es nuestra ubicación"
8. "la direccion de entrega es en <dir>"
