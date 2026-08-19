# Payload real del webhook de estados de Shipday (capturado 2026-08-19, pedido 8848)

Capturado con un despliegue diagnóstico temporal de `shipday-status` (v59), forzando
eventos al asignar/recoger un pedido sombra en la app del conductor.

## Forma del payload (confirmada)

Los campos NO están donde el parser los buscaba. Estructura real:

- `event`            : string  — el evento (ver vocabulario abajo)
- `order_status`     : string  — estado alterno (NOT_ACCEPTED, STARTED, PICKED_UP, NOT_ASSIGNED…)
- `order.order_number`: string — NÚMERO del comercio ("8848") ← la llave que cruza con pedidos.pedido_ref
- `order.id`         : number  — id INTERNO de Shipday (51976719) ← NO es el order_number
- `delivery_details.phone`: string — TELÉFONO del cliente ("60902631", 8 dígitos sin +507)
- `delivery_details.name` / `.email` / `.address` / `.location.{lat,lng}`
- `carrier.name` / `.phone` / `.status`  — el repartidor
- `trackingUrl`      : string  — link de seguimiento

El parser actual (`parseShipdayStatusEvent`) buscaba:
- teléfono en `customer.phoneNumber || customer.phone || order.customerPhoneNumber`  → NO EXISTE `customer` → teléfono vacío → fila descartada
- estado en `payload.event` → SÍ lo encuentra (evento correcto), pero el vocabulario no mapea los valores reales
- orderNumber en `order.orderNumber || order.order_number || payload.orderNumber` → SÍ (`order.order_number`)

## Vocabulario de eventos REAL (capturado)

| event                        | order_status  | significado         | mapeo destino |
|------------------------------|---------------|---------------------|---------------|
| ORDER_ASSIGNED               | NOT_ACCEPTED  | asignado, sin aceptar | asignado    |
| ORDER_UNASSIGNED             | NOT_ASSIGNED  | desasignado         | (omitir estado) |
| ORDER_ACCEPTED_AND_STARTED   | STARTED       | aceptó y arrancó    | en_camino     |
| ORDER_PIKEDUP (sic)          | PICKED_UP     | recogió el paquete  | en_camino     |
| (esperados, no capturados)   | ORDER_COMPLETED / DELIVERED | entregado | entregado |
| (esperados, no capturados)   | ORDER_FAILED / INCOMPLETE   | fallido   | fallido   |

## Consecuencia

Dos bugs simultáneos, ambos confirmados con datos reales:
1. **Teléfono nunca encontrado** → `normalizePhone('')` → wa_id inválido → `upsertPedido` descarta la fila entera.
   Fix: leer `delivery_details.phone`; y como respaldo, recuperar el wa_id de la fila `shopify`
   existente por `pedido_ref` (order_number).
2. **Vocabulario incompleto**: ORDER_ACCEPTED_AND_STARTED, ORDER_PIKEDUP, ORDER_UNASSIGNED no estaban mapeados.
