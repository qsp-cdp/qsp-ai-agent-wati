# El despacho a Shipday no encontró la dirección que WATI sí tenía (03-sep-2026)

> Isaac: *"Un usuario tiene sus datos de dirección guardados en los atributos de contacto de Wati,
> entonces nuestro asesor llama al chatbot que se llama Despachar a Shipday, el chatbot activó la
> consulta sobre su dirección de envío y no lanzó la tarea de envío a Shipday."*

## El caso, minuto a minuto (conv `50760466239`, cliente recurrente)

| Hora | Quién | Qué pasó |
|---|---|---|
| 10:25 | asesor | manda la cotización (PDF) con envío |
| 10:28 | cliente | *"Listo"* + captura del pago · *"Me lo envías cuando puedas por favor"* |
| **10:30:40** | `wati-order` | ❌ `El cliente no tiene dirección registrada: captura la dirección primero (flujo wati-address o la captura del copiloto)` |
| 10:30:42 | chatbot (operador "Bot") | *"Necesitamos tu dirección de entrega primero 📍"* → las **tres preguntas** del flujo viejo |
| 10:31 | cliente | *"agente"*, *"panama treasures"* (confundido) |
| 10:31:37 | cliente | ***"¿Cada vez que les compro debo repetir lo mismo?"*** |
| 10:31:38 | chatbot | *"⚠️ No pudimos guardar tu dirección, un asesor te ayudará en un momento."* |
| 10:34 | asesor | *"Sí, ya coordiné la entrega para el día de hoy. Disculpe, estamos realizando unas pruebas con el bot."* |
| **10:37:16** | `wati-order` | ❌ el mismo error (segundo intento) → el chatbot vuelve a preguntar |

El pedido salió a mano. El costo fue la cara del cliente.

## Las dos causas, y por qué se sumaron

### 1. `wati-order` solo leía la libreta de Supabase, nunca la ficha de WATI

El despacho busca la dirección en **`contacts`** (la libreta de Supabase) con `findContactByPhone`. Ese
cliente **no tiene fila ahí** — y no es el único: la libreta la llenan la captura del copiloto
(`guardar_datos_envio`, 32 filas `source=copilot`), la importación de Tookan de julio (5.276 filas)
y los propios despachos. Un cliente recurrente cuya dirección quedó **en los atributos del contacto en
WATI** —la ficha del sistema anterior, o cargada a mano por un asesor— era invisible para el despacho.

Y hay una asimetría que lo hacía inevitable: **el copiloto escribe en los dos lados** (`contacts` y la
ficha de WATI: `direccion_envio`, `referencia_envio`, `pin_envio`, `maps_envio`…), pero **el despacho
solo leía uno**.

### 2. El chatbot "Despachar a Shipday" cae a un flujo de captura que apunta a una función inexistente

Cuando `wati-order` responde 400, el chatbot de WATI entra a su rama de error: las **tres preguntas
del flujo viejo** ("¿Cuál es la dirección exacta?", "¿Alguna referencia?", "comparte tu ubicación 📎")
y al final un POST a **`wati-address`** — una Edge Function que **no existe en esta rama**: nunca hubo
un rastro suyo en `job_log`, y el propio mensaje de error de `wati-order` todavía la nombraba. Ese POST
falla y el chatbot dice *"No pudimos guardar tu dirección"*.

Así que aunque el cliente hubiera respondido bien las tres preguntas, **nada se habría guardado**.

Un efecto lateral que vale anotar: los mensajes de ese chatbot llegan con `owner=true` y
`operatorName: "Bot"`, así que el copiloto los guarda como **mensajes de asesor** (`human-agent`) — la
conversación pasa a handoff y el reloj del asesor se reinicia por un robot. No es la causa de este
incidente, pero es ruido en la telemetría de "asesor activo".

## Radio de daño (30 días)

```
despachos wati-order OK ................ 21
errores "no tiene dirección" ...........  5   (5 de 26 intentos = 19%)
"No pudimos guardar tu dirección" ......  1   (este caso)
```

Uno de cada cinco despachos por WATI fallaba por esto.

## El fix (v64 de `wati-order`)

**Orden de fuentes: libreta → ficha de WATI → 400.** Si `contacts` no tiene la dirección, `wati-order`
lee la ficha del contacto en WATI (`getWatiContact`, por `/api/v1/getContacts` — el único endpoint que
el token abre para leer contactos, con la misma guarda del copiloto contra el filtro difuso: el
teléfono debe coincidir) y la mapea con `direccionDesdeAtributosWati` (pura, probada): `direccion_envio`
/ `referencia_envio` / `pin_envio`, y `maps_envio` como pin del sistema anterior. Un fallo de red al
leer WATI **no es fatal** (`ficha_wati_fallo` en el log, se sigue con lo que haya).

**La libreta se autocura.** El `upsertContactByPhone` que ya corría tras crear la orden escribe la
dirección usada, así que el próximo despacho de ese cliente ya no necesita ir a WATI.

**El 400 solo sale cuando las dos fuentes están vacías**, ya no menciona `wati-address`, nombra el
camino vivo (`?captura=1`) y deja el teléfono en el log (`sin_direccion`): hasta hoy el error no decía
a quién le había pasado.

Telemetría nueva: `direccion_desde_wati` (con `habia_fila_contacts`, `con_referencia`, `con_pin`) mide
cuántos despachos se salvan por este respaldo.

**Pruebas:** `tests/test_wati_order_direccion.mjs` (22 casos: la ficha del copiloto, la del sistema
anterior, el marcador "-", variables sin resolver, y los locks de cableado sobre el fuente real).
Agregada al candado del CI.

**Deploy:** el cambio toca `_shared`, así que el workflow redespliega **todas** las funciones (cada una
empaqueta su propia copia). Los seis bundles validan con esbuild.

## Lo que queda del lado de WATI (Isaac)

El fix hace que el 400 sea raro, pero **la rama de error del chatbot sigue apuntando a una función
muerta**. Hay que cambiarla en el constructor de chatbots de WATI:

- **Quitar** las tres preguntas + el POST a `wati-address`.
- **En su lugar**, un webhook-call a la captura del copiloto:
  `POST https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?captura=1&key=<COPILOT_WEBHOOK_KEY>`
  con body `{"waId": "{{phone}}"}`. El copiloto abre la conversación pidiendo los datos, los guarda en
  **los dos lados** con `guardar_datos_envio`, y el asesor vuelve a disparar "Despachar a Shipday".

Mientras tanto, si un despacho da 400, la salida manual es la misma de siempre: pedir la dirección y
volver a disparar.

## Verificar tras desplegar

```sql
-- Debe empezar a aparecer cuando un cliente recurrente se despacha sin fila en contacts
select created_at, detail from job_log where action = 'direccion_desde_wati' order by created_at desc;
-- Y esto debe caer a ~0
select created_at, detail from job_log where action = 'sin_direccion' order by created_at desc;
```

Y el cliente `50760466239`: la próxima vez que se le despache, la dirección debe salir de su ficha de
WATI y quedar en `contacts` (`select * from contacts where phone_digits = '60466239'`).

## Verificación pendiente (no pude hacerla desde aquí)

El token del conector de WATI de esta sesión venció (403), así que **no pude abrir la ficha del
contacto para confirmar qué atributos exactos tiene**. El mapeo lee los nombres que escribe el
copiloto y el del sistema anterior; si la ficha de ese cliente usa otros nombres, `direccion_desde_wati`
no aparecerá en el log y hay que agregar el nombre al mapeo. Es un `select` en `job_log` después del
primer despacho a ese cliente.
