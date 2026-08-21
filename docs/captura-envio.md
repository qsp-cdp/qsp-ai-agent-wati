# Captura de datos de entrega con el agente AI (P3-a / P3-b / v100)

Tres formas de que el bot capture la dirección, referencia y pin del cliente y los deje en la
**libreta `contacts`** — la misma que lee `wati-order`, así el asesor lanza el despacho con la
plantilla/chatbot **"Despachar a Shipday"** sin volver a digitar nada. El bot **nunca** crea la
orden en Shipday: el despacho siempre lo lanza el asesor.

## P3-a — Modo bot (automático)

Cuando la conversación está en modo `bot` y el cliente decide comprar con **envío a domicilio**,
el copiloto captura los datos de forma natural (nueva tool `guardar_datos_envio`):

- Pide dirección completa (corregimiento/barrio, calle, edificio o casa) y un punto de referencia.
- El pin (clip 📎 → Ubicación / link de Maps) se pide **solo como refuerzo** (v76): una sola vez y
  únicamente cuando la dirección no se reconoce en el mapa de zonas o queda incompleta. Si el cliente
  no sabe cómo o no responde, sigue sin insistir (el repartidor puede llamarlo).
- Guarda cada dato al momento; **repregunta solo lo que falta**, una vez, sin sonar a formulario.
- Al completar, **muestra al cliente lo capturado** (dirección + referencia + ubicación si la dio),
  para que corrija en el momento si algo quedó mal.
- La tool devuelve la **zona y el costo** resueltos (resolver_tarifa_v2, metro e interior): el bot
  los confirma tal cual; si la zona es del interior aplica las reglas de Servientrega.
- Al completar: confirma en una línea y avisa que **un asesor confirma despacho y pago**.
- Los links cortos de Maps (maps.app.goo.gl) se guardan crudos: `wati-order` los resuelve al despachar.

## v100 — El asesor pide la dirección y el bot captura solo (sin configurar nada)

El camino sin fricción, pensado porque editar atributos o lanzar flujos desde el inbox resultó
tedioso: **el asesor no hace nada distinto**. Si en un handoff el asesor escribe algo como
"¿me confirma su dirección de entrega?" / "¿a dónde se lo enviamos?" / "me regala un punto de
referencia", el copiloto lo reconoce (`PIDE_ENVIO_RE`, sobre el último mensaje del equipo, <30 min)
y trata la siguiente respuesta del cliente como la dirección — **aunque venga cruda**, sin la
palabra "dirección" ("Calle 50, edificio Torre A, apto 3"). La guarda con `guardar_datos_envio`,
confirma zona/costo y espeja a la ficha de WATI, igual que las otras dos vías.

- Guardarraíles: NO aplica si el cliente interrumpe con reclamo/pago/queja (los AND del gate de
  asistencia siguen mandando), y si el cliente cambió de tema el bot no fuerza la captura.
- Trazabilidad: `asesor_pidio_envio` en jobs y origen `asesor_pidio_envio` en `asistencia_handoff`.
- El diccionario de frases del asesor se está refinando con minería de conversaciones reales
  (`docs/diccionario-frases.md`, en preparación).

## P3-b — Invocar al agente durante atención humana (handoff)

El asesor activa la captura **sin salir del handoff** (él sigue a cargo de la conversación):

```
POST https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<KEY_DEL_WEBHOOK>&captura=1
Content-Type: application/json

{"waId": "<número del cliente, ej. 50769998888>"}
```

- `<KEY_DEL_WEBHOOK>` es **la misma key** que ya usa la URL del webhook de WATI → copilot-webhook.
- Qué hace: abre una ventana de captura de **30 minutos** (`conversations.captura_hasta`), y el bot
  le escribe al cliente pidiendo los datos (si la libreta ya tiene dirección, pide confirmarla).
- Mientras la ventana está abierta, las respuestas del cliente van al **modo captura**: tools
  acotadas (`guardar_datos_envio`, `tarifa_entrega`, `info_tienda`, `sucursales_interior`) y un
  objetivo único — capturar. No vende, no cotiza productos, no toca pagos.
- La ventana se cierra sola al completar los datos (o expira a los 30 min). Un trámite de
  pago/fiscal en curso (anti-interrupción) sigue mandando: ahí el bot calla.
- Si el asesor vuelve a escribir, el bot le cede el turno (anti-carrera de siempre).

### Chatbot de WATI "Captura con AI" (recomendado)

Crear en WATI un chatbot/flow con un solo paso **Webhook / API call**:

- Método: `POST`, URL de arriba (con la key y `&captura=1`).
- Body JSON: `{"waId": "{{contact.phone}}"}` (o la variable equivalente del número del contacto).
- El asesor lo dispara desde el inbox igual que "Despachar a Shipday". Nada más que configurar.

## Atributos de contacto en WATI (v75 · esquema unificado en v89)

Además de guardar en la libreta `contacts` (lo que alimenta el despacho), la captura **espeja**
los datos a los atributos del contacto en WATI para que el asesor los vea en la ficha del inbox.
Todos ya existen en la cuenta (los creó el sistema anterior); si alguno faltara, se crea en
**WATI → Contactos → Atributos** — WATI ignora en silencio el valor de un atributo inexistente.

| Atributo | Contenido |
|---|---|
| `direccion_envio` | dirección de entrega |
| `referencia_envio` | punto de referencia |
| `pin_envio` | link de Google Maps del pin (clicable) |
| `maps_envio` | **el mismo pin** — nombre que usaba el sistema anterior (ver abajo) |
| `zona_envio` | zona + costo + corregimiento (ej. `Z1 Centro · $6 · Betania`) |
| `provincia_envio` · `distrito_envio` · `corregimiento_envio` | jerarquía administrativa |
| `envio_resumen` | `dirección — referencia  ·  Provincia › Distrito › Corregimiento` |
| `envio_estado` | `📍 Lista para despacho (con pin)` o `📝 Sin pin — confirmar ubicacion con el cliente` |
| `envio_datos` | `completo` / `faltan datos` |
| `envio_fecha` | fecha de la captura (`YYYY-MM-DD`) |

Un campo sin valor se escribe como `-`, para **pisar** el dato viejo (v75.1): si se omitiera, la ficha
conservaría el pin o la referencia del domicilio anterior.

### Por qué el esquema unificado (v89)

Hasta el 21-ago convivían **dos sistemas** escribiendo direcciones del mismo cliente en WATI:

- el copiloto → `direccion_envio`, `referencia_envio`, `pin_envio`, `zona_envio`;
- `wati-address` (captura del chatbot anterior) → `maps_envio`, `envio_datos`, `envio_fecha`;
- `wati-mirror` (espejo en lote, manual) → jerarquía + `envio_resumen` + `envio_estado`.

Resultado real observado en una ficha: **dos direcciones y dos pines distintos a la vez**
(`direccion_envio` con una dirección y `envio_resumen` con otra; `pin_envio` con el pin nuevo y
`maps_envio` con uno viejo). El asesor no tenía forma de saber cuál valía.

Decisión del negocio: el copiloto **adopta el esquema completo** y queda como único escritor en vivo.
El formato de `envio_resumen`/`envio_estado` se copió **literalmente** de `wati-mirror` (mismos
separadores `›` `—` `·`, mismos textos) para que las ~4,340 fichas ya espejadas y las nuevas se vean
iguales. `wati-address` queda retirada.

La jerarquía sale del resolvedor, sin inventar nada: el **diccionario** ya devuelve
provincia/distrito/corregimiento; el **pin** y **Google** devuelven el corregimiento y el diccionario
completa el resto (`jerarquiaDeLugar`). Lo que no resuelve, queda vacío.

**Corrección de dirección (v75):** si el cliente da una dirección NUEVA distinta a la registrada y no
manda pin/referencia nuevos, el pin y la referencia viejos se **limpian** — Shipday geocodifica la
dirección nueva en vez de enrutar al domicilio anterior (evita el bug de "la casa vieja").

## Trazabilidad (job_log)

| action | cuándo |
|---|---|
| `captura_activada` | el asesor activó la ventana (endpoint) |
| `captura_envio` | la tool guardó datos (detalle: completo, faltan, pin, zona) |
| `captura_envio_wati` | espejo a los atributos de WATI (campos, wati_status) |

## Flujo completo de punta a punta

1. Bot o asesor+bot capturan → libreta `contacts` (dirección, referencia, pin).
2. Asesor dispara **"Despachar a Shipday"** → `wati-order` completa desde la libreta, crea la orden
   y avisa al cliente "en preparación 📦".
3. `shipday-status` (pierna de vuelta) actualiza `pedidos` y notifica en camino/entregado.
