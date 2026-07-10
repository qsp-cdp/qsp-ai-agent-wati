# Despliegue en Render + corte de la app de Shipday en Shopify

Guía para pasar del app nativa de Shipday (con su widget de fecha/hora en el carrito) al webhook directo de este servicio: cero elementos visuales en la tienda, cero fricción para el cliente.

## 1. Desplegar el servicio en Render (~10 min)

1. Crea la cuenta en https://render.com (con tu Google/GitHub del negocio).
2. **New → Blueprint** → conecta GitHub y elige el repo `qsp-cdp/qsp-ai-agent-wati`. Render lee `render.yaml` y crea el servicio `qsp-delivery-bridge`.
3. En el paso de variables, pega:
   - `SHIPDAY_API_KEY`: cópiala de Shipday → Integraciones → Credenciales de API → Mostrar (la que empieza por `oLMX`).
   - `SHOPIFY_WEBHOOK_SECRET`: déjala vacía por ahora; se llena en el paso 3.
   - `PICKUP_PHONE`: teléfono del negocio para el repartidor.
   - `WATI_WEBHOOK_TOKEN` y `SHIPDAY_WEBHOOK_TOKEN`: Render los genera solos; cópialos, los necesitas en los pasos 4 y 5.
4. Deploy. Tu URL base queda como `https://qsp-delivery-bridge.onrender.com` (verifícala con `/health`).

> **Nota del plan free**: el servicio se duerme tras 15 min sin tráfico y el primer webhook puede tardar ~50 s en despertarlo (Shopify reintenta, no se pierde). Si quieres respuesta inmediata, sube al plan Starter ($7/mes).

## 2. Desinstalar la app de Shipday en Shopify

Shopify Admin → **Apps → Shipday → Desinstalar**. Con esto desaparece el widget de "Entrega Local" del carrito. (Hazlo después de tener el paso 3 listo si no quieres ventana sin cobertura; por ahora no hay pedidos fluyendo, así que el orden no es crítico.)

## 3. Crear el webhook en Shopify

Shopify Admin → **Configuración → Notificaciones → Webhooks → Crear webhook**:

- Evento: **Creación de pedidos** (`orders/create`). Si prefieres disparar al preparar el pedido, usa **Preparación de pedidos** (`orders/fulfilled`) — el endpoint acepta ambos payloads.
- Formato: JSON
- URL: `https://qsp-delivery-bridge.onrender.com/webhooks/shopify/orders-create`
- Versión del API: la última estable.

Al crearlo, Shopify muestra la clave de firma ("Your webhooks will be signed with…"): cópiala a `SHOPIFY_WEBHOOK_SECRET` en Render (Environment → editar → Save; el servicio se redespliega solo).

**Filtro de entregas**: la variable `SHOPIFY_DELIVERY_FILTER` (ya configurada como `entrega local,local delivery`) hace que solo los pedidos cuyo método de envío contenga esos textos generen viaje en Shipday. Retiro en tienda o envíos nacionales se omiten. Ajusta los textos si tu método de envío se llama distinto (deben coincidir con el nombre de la tarifa en Shopify → Configuración → Envío).

## 4. Cargar la libreta de contactos migrada de Tookan

Los contactos no viven en git (datos personales). Después de cada despliegue desde cero, cárgalos con:

```bash
curl -X POST https://qsp-delivery-bridge.onrender.com/contacts/import \
  -H "x-wati-token: <WATI_WEBHOOK_TOKEN>" \
  -H "Content-Type: application/json" \
  --data-binary @data/contacts.json
# → {"ok":true,"count":5276}
```

> El disco del plan free es efímero: si Render reinicia el servicio, repite este comando. Cuando el volumen crezca movemos la libreta a una base de datos (Supabase) y esto deja de ser necesario.

## 5. Registrar el webhook de estados en Shipday

Shipday → **Integraciones → API → Configuración de Webhook → + Agregar Enlace API**:

```
https://qsp-delivery-bridge.onrender.com/webhooks/shipday/status?token=<SHIPDAY_WEBHOOK_TOKEN>
```

## 6. Prueba end-to-end

1. Pedido de prueba en Shopify con método "Entrega Local" → debe aparecer en Shipday → Órdenes con nombre, teléfono y dirección.
2. Pedido de retiro en tienda → NO debe aparecer en Shipday (revisa en Render → Logs la línea "omitido").
3. `GET /contacts/lookup?phone=61308311` con el header `x-wati-token` → debe devolver al cliente de prueba de la libreta.
4. Asigna un repartidor a la orden de prueba en Shipday → en Render → Logs debe aparecer el evento de estado.
