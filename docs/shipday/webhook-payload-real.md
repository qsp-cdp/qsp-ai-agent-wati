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

---

## Pierna de vuelta de direcciones (Shipday → Supabase → WATI)

Añadida el 21-ago-2026. **No requiere registrar ningún webhook nuevo**: los eventos de estado que ya
recibimos traen `delivery_details.address` y `delivery_details.location`, así que si un asesor corrige
la dirección en Shipday, la versión corregida llega en el **siguiente evento de esa orden**.

**Fuente de verdad: `contacts` en Supabase.** Es la única candidata: WATI solo guarda atributos planos
(sin lat/lng ni historial) y Shipday guarda una copia *por orden*, no por cliente. WATI es la vista del
asesor; Shipday, una copia por orden.

**Anti-loop por diseño:** Supabase escribe hacia Shipday SOLO al crear la orden, nunca después;
Shipday escribe hacia Supabase SOLO desde este webhook. No hay tercer camino.

**Reglas** (`sincronizarDireccionDesdeShipday`):

| Situación | Qué hace |
|---|---|
| Shipday manda una dirección distinta a la de la libreta | sincroniza, audita y espeja a la ficha de WATI |
| Misma dirección (evento repetido o reenviado) | nada — la dedup es por texto normalizado |
| **La libreta se tocó hace menos de 10 min** | **NO pisa**, solo audita: ese cambio puede ser más nuevo que el de Shipday y los eventos llegan fuera de orden |
| El evento no trae dirección | no toca nada (nunca degrada) |
| Dirección nueva sin coordenadas | limpia el pin viejo: apuntaba al domicilio anterior |

La ventana de 10 minutos es deliberadamente conservadora: perder una corrección es recuperable (llega
en el siguiente evento), pisar la dirección buena del cliente no lo es.

**Auditoría:** cada cambio detectado —aplicado o no— deja fila en `public.direcciones_hist`
(valor anterior, nuevo, origen, orden, si se aplicó y por qué no). Responde "¿por qué el repartidor
fue a esa dirección?".

```sql
select created_at, origen, address_ant, address_nueva, aplicado, motivo
from direcciones_hist order by created_at desc limit 20;
```

**Límite conocido:** si el asesor edita la dirección y la orden ya no emite más eventos, el cambio no
viaja. El evento de entrega (`ORDER_COMPLETED`) cubre la mayoría de los casos.

**Trazabilidad en job_log:** `direccion_shipday_sincronizada` (ok) · `direccion_shipday_no_aplicada`.
