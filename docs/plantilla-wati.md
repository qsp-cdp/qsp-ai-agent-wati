# Flujo WATI: captura de dirección, atributos y despacho a Shipday

Diseño del flujo de compra asistida por WhatsApp:

```
1. CAPTURA    El flujo pide dirección (+ referencia y mapa opcionales)
              → POST wati-address → guarda en Supabase
              → refleja como ATRIBUTOS del contacto en WATI
2. VISIBILIDAD El agente ve en el perfil del contacto si ya tiene datos
              de envío completos (atributo envio_datos = "completo")
3. DESPACHO   El agente confirma la venta → POST wati-order
              → crea la orden en Shipday (dirección desde la libreta)
              → anuncia al cliente: "tu pedido va a preparación para envío"
              → Shipday envía luego su tracking cuando el repartidor sale
```

URLs (project ref `jbigmlcalcwiphqeudxd`), siempre con header `x-wati-token`:

| Acción | Endpoint |
|---|---|
| Guardar/actualizar dirección | `POST /functions/v1/wati-address` |
| Consultar si hay dirección | `GET /functions/v1/contacts-lookup?phone={{waId}}` |
| Despachar pedido a Shipday | `POST /functions/v1/wati-order` |

---

## Paso 0 — Crear los atributos en WATI (una vez)

WATI → **Contactos → Atributos de contacto → Agregar atributo** (tipo texto):

- `direccion_envio` — dirección completa de entrega
- `referencia_envio` — punto de referencia
- `maps_envio` — link de Google Maps
- `envio_datos` — "completo" cuando ya se capturó todo
- `envio_fecha` — fecha de la última actualización

Con esto, el agente abre cualquier chat y ve de un vistazo en el panel derecho si el cliente tiene datos de envío y cuáles son.

## Paso 1 — Flujo de captura «Dirección de envío»

WATI → Chatbots/Flow Builder → nuevo flujo:

1. *(Opcional)* **Webhook GET** a `contacts-lookup?phone={{waId}}`: si responde `found:true`, preguntar «¿Entregamos en *{{contact.address}}* como la vez pasada?» (botones **Sí** → saltar a despacho / **Actualizar** → seguir).
2. Pregunta → variable `direccion`: «📍 ¿Cuál es la dirección exacta de entrega? (calle, edificio, piso/apto, barrio)»
3. Pregunta → variable `referencia`: «🏠 ¿Alguna referencia? (frente a qué queda, color del edificio…)» — puede responder "ninguna".
4. Pregunta → variable `maps` (opcional): «🗺️ Si quieres, pégame el link de Google Maps de tu ubicación (o escribe "no")». Si el cliente comparte ubicación de WhatsApp, WATI la entrega como link.
5. **Webhook POST** a `.../wati-address`
   - Headers: `x-wati-token: <WATI_WEBHOOK_TOKEN>` · `Content-Type: application/json`
   - Body:
     ```json
     {
       "waId": "{{waId}}",
       "nombre": "{{name}}",
       "direccion": "{{direccion}}",
       "referencia": "{{referencia}}",
       "maps_url": "{{maps}}"
     }
     ```
6. Mensaje de cierre: «¡Listo! Guardamos tu dirección de entrega ✅».

La función guarda el contacto en la libreta y actualiza los atributos; si el link de Maps trae coordenadas, también las guarda (y luego viajan a Shipday para clavar el pin del repartidor).

## Paso 2 — Plantilla HSM para iniciar la captura (fuera de 24 h)

> **Nombre:** `captura_direccion_envio` · Categoría: *Utility* · Idioma: `es`
>
> Hola {{1}} 👋 Para coordinar la entrega de tu pedido necesitamos confirmar tu dirección. ¿Me la compartes por aquí? Solo toma un minuto:
> 📍 Dirección exacta · 🏠 Referencia · 🗺️ Ubicación (opcional)

(Dentro de la ventana de 24 h no hace falta plantilla: el flujo pregunta directo.)

## Paso 3 — Despacho (agente o bot)

Cuando la venta está confirmada, un flujo corto «Despachar pedido» (o un botón que el agente dispara) hace **Webhook POST** a `.../wati-order`:

```json
{
  "waId": "{{waId}}",
  "pedido": "{{resumen_pedido}}",
  "total": "{{total}}"
}
```

No hace falta mandar la dirección: la función la toma de la libreta (la que capturó `wati-address`). Si el cliente no tiene dirección registrada, responde 400 con el mensaje claro — señal para correr primero el flujo de captura.

La función entonces:
1. Crea la orden en **Shipday** (con referencia, link de mapa en las instrucciones del repartidor y coordenadas si las hay).
2. Envía al cliente el anuncio automático:
   > 🛠️ {nombre}, tu pedido ya está en preparación para envío 📦
   > Entregaremos en: {dirección}
   > Te avisaremos por aquí cuando salga en camino. 🚚
   (desactivable con `"notificar": false`)
3. Devuelve `orderNumber` por si el flujo quiere mostrárselo al cliente.

Después, cuando el repartidor toma la orden, **Shipday** manda su propio WhatsApp con el link de tracking en vivo (Branded Premium) — el ciclo queda: *preparación (nuestro mensaje) → en camino (Shipday) → entregado (Shipday)*.

## Prueba end-to-end

```bash
# 1. Capturar dirección (simulando el flujo)
curl -X POST https://jbigmlcalcwiphqeudxd.supabase.co/functions/v1/wati-address \
  -H "x-wati-token: <TOKEN>" -H "Content-Type: application/json" \
  -d '{"waId":"507XXXXXXXX","nombre":"Prueba","direccion":"PH Prueba, Calle 50","referencia":"frente al banco","maps_url":"https://maps.google.com/?q=8.98,-79.52"}'
# → {"ok":true,"guardado":true,"atributos_wati":true}
#   y en WATI el contacto muestra los atributos llenos

# 2. Despachar (sin mandar dirección: la toma de la libreta)
curl -X POST https://jbigmlcalcwiphqeudxd.supabase.co/functions/v1/wati-order \
  -H "x-wati-token: <TOKEN>" -H "Content-Type: application/json" \
  -d '{"waId":"507XXXXXXXX","pedido":"1x Tinta HP 954","total":"32.10"}'
# → orden en Shipday + WhatsApp "en preparación" al cliente
```
