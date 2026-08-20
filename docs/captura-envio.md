# Captura de datos de entrega con el agente AI (P3-a / P3-b, copilot v74)

Dos formas de que el bot capture la dirección, referencia y pin del cliente y los deje en la
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

## Atributos de contacto en WATI (v75)

Además de guardar en la libreta `contacts` (lo que alimenta el despacho), la captura **espeja**
los datos a los atributos del contacto en WATI para que el asesor los vea en la ficha del inbox.
**Requisito:** crear estos atributos en **WATI → Contactos → Atributos** (si no existen, WATI ignora
el valor):

| Atributo | Contenido |
|---|---|
| `direccion_envio` | dirección de entrega |
| `referencia_envio` | punto de referencia |
| `pin_envio` | link de Google Maps del pin (clicable) |
| `zona_envio` | zona + costo resueltos (ej. `Z1 Centro · $6`) |

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
