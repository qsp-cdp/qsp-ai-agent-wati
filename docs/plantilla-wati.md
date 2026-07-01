# Plantilla WATI: captura de dirección para Shipday

Flujo para cuando el prospecto/cliente pide que lo ayudemos a completar la compra por WhatsApp. El bot captura los datos mínimos que Shipday necesita y dispara la orden vía `POST /webhooks/wati/order`.

## Campos que captura el flujo

| Variable WATI | Pregunta sugerida | Obligatorio |
|---|---|---|
| `nombre` | ¿A nombre de quién entregamos el pedido? | Sí |
| `telefono` | ¿Número de contacto para el repartidor? (si es el mismo WhatsApp, usar `{{waId}}`) | Sí |
| `direccion` | ¿Cuál es la dirección exacta de entrega? (calle, edificio, apto, ciudad) | Sí |
| `referencia` | ¿Alguna referencia? (color de la casa, frente a qué queda) | No |
| `pedido` | Resumen del pedido (lo llena el agente o el bot con lo cotizado) | No |
| `total` | Total a cobrar (si es contra entrega) | No |

## Cómo armarlo en WATI

1. **Chatbot / Flow Builder** → crear flujo «Captura dirección delivery».
2. Antes de preguntar la dirección, agregar un paso **Webhook (GET)** a
   `https://TU-SERVICIO/contacts/lookup?phone={{waId}}` con header `x-wati-token`.
   - Si responde `found: true`, el bot confirma: «¿Entregamos en *{{contact.address}}* como la vez pasada?» (botones Sí/No). Con «Sí» se salta la captura manual.
3. Preguntas de captura con **Save response to variable** para cada campo de la tabla.
4. Paso final **Webhook (POST)** a `https://TU-SERVICIO/webhooks/wati/order`:
   - Header: `x-wati-token: <el valor de WATI_WEBHOOK_TOKEN>`
   - Body (JSON):
     ```json
     {
       "nombre": "{{nombre}}",
       "telefono": "{{telefono}}",
       "direccion": "{{direccion}}",
       "referencia": "{{referencia}}",
       "pedido": "{{pedido}}",
       "total": "{{total}}"
     }
     ```
5. Mensaje de cierre: «¡Listo {{nombre}}! Tu pedido va en camino. Te avisaremos cuando el repartidor salga.» (Shipday envía su propio link de tracking por SMS/WhatsApp si activas las notificaciones en Shipday → Settings → Notifications).

## Plantilla de mensaje (HSM) sugerida para iniciar la captura

> **Nombre:** `captura_direccion_delivery` · Categoría: *Utility* · Idioma: `es`
>
> Hola {{1}} 👋 Para coordinar la entrega de tu pedido necesito confirmar unos datos:
> 📍 Dirección exacta de entrega
> 🏠 Alguna referencia del lugar
> 📞 Número de contacto para el repartidor
> ¿Me los compartes por aquí?

La plantilla HSM sirve para iniciar la conversación fuera de la ventana de 24 h; dentro de la ventana el flujo del chatbot hace las preguntas una por una.
