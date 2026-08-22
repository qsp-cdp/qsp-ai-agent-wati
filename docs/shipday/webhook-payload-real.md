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
| Dirección nueva CON pin | recalcula provincia, distrito, corregimiento y zona contra los polígonos (`ubicacion_por_coordenadas`) |
| Dirección nueva sin pin, o el pin no resuelve | limpia provincia/distrito/corregimiento: describían el domicilio anterior |

**La jerarquía sigue la misma regla que el pin.** Provincia › distrito › corregimiento describen la
dirección VIEJA, y de ahí sale la tarifa que se le cotiza al cliente: dejarlos puestos hace que la ficha
afirme un corregimiento que ya no aplica. Con pin se resuelven contra los polígonos oficiales; sin pin se
ponen en nulo — "no sé" es cierto, el dato viejo sería una mentira. La siguiente captura los vuelve a llenar.

**Por qué una RPC nueva y no `zona_por_coordenadas`:** esa devuelve zona, tarifa y corregimiento, pero no
provincia ni distrito (los lee de columnas denormalizadas de `limites_admin` que solo están llenas en 35
de 635 filas). `ubicacion_por_coordenadas` la envuelve y añade los dos niveles sacándolos de los polígonos
(nivel 1 = provincia, 2 = distrito). Cuidado al leerla: un pin del **interior** devuelve `estado:sin_match`
—allá no hay zona de reparto propia, va por Servientrega— pero su jerarquía SÍ viene resuelta. Descartarla
por el `estado` borraría la geografía de todo el interior; solo la ZONA depende de ese campo.

**El espejo a WATI escribe TODOS los campos que la corrección toca**, y los vacíos van como `-` para pisar
el valor anterior (lección v75.1 del copiloto): `direccion_envio`, `pin_envio`, `maps_envio`, `zona_envio`,
`provincia_envio`, `distrito_envio`, `corregimiento_envio`, `envio_resumen`, `envio_estado`, `envio_fecha`.
Omitir un campo dejaba el pin y el corregimiento viejos junto a la dirección nueva.

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

**Trazabilidad en job_log:** `direccion_shipday_sincronizada` (ok) · `direccion_shipday_no_aplicada` ·
`espejo_wati_direccion` (resultado del espejo a la ficha) · `auditoria_direccion_fallo`.

---

## Prueba en vivo con una orden creada A MANO en Shipday (22-ago-2026, pedido 12)

Primera vez que se ejerce el camino "el asesor crea la tarea directo en Shipday" — hasta ese día los 11
pedidos que Shipday nos había mandado existían TAMBIÉN como pedido de Shopify, o sea que todos habían
nacido de nuestro propio flujo.

**Funcionó de punta a punta:** el evento entró, `pedidos` recibió la fila (`pedido_ref` 12, estado
`en_camino`), la libreta se actualizó con la dirección y el pin de Shipday, y `job_log` registró
`direccion_shipday_sincronizada ok=true`.

**Dos fallos que solo se ven con la prueba real:**

1. **`direcciones_hist` seguía en cero** pese al `ok=true`. Causa: `service_role` no tenía INSERT sobre
   la tabla (la misma trampa de permisos de `impresoras_specs`/`servientrega_agencias`: en este proyecto
   una tabla creada por migración solo hereda TRUNCATE/REFERENCES/TRIGGER). El POST rebotaba con 401
   dentro de un `catch {}` mudo. Arreglado con la migración `20260822150000_direcciones_hist_grants`
   (INSERT + USAGE sobre la secuencia, que es SERIAL) y el fallo ya deja rastro en `job_log`.
2. **El espejo a WATI no dejaba rastro alguno** — iba en otro `catch` mudo, así que un espejo fallido era
   indistinguible de uno exitoso. Y `updateWatiAttributes` solo miraba el status HTTP, cuando WATI
   responde 200 con `{"result":false}` si el contacto no existe o el atributo no está creado en su panel
   (lección v86 del copiloto). Ambos arreglados.

**Hueco que sigue abierto:** si el teléfono de la orden no está en `contacts`, la sincronización se sale
sin hacer nada — ni libreta ni WATI. Es el caso probable de una tarea creada a mano para un cliente que
nunca escribió por WhatsApp.

### Lo que la ficha de WATI mostró tras esa prueba (y por qué)

La prueba corrió a las 14:39 UTC y el arreglo se desplegó a las 14:50 — o sea que la ficha quedó
retratando el comportamiento VIEJO, que solo escribía cuatro campos. Así se veía:

| Atributo | Quedó | Debía quedar |
|---|---|---|
| `direccion_envio` | La Gloria, Betania, Bethania ✅ | — |
| `maps_envio` | pin nuevo ✅ | — |
| `envio_resumen` | Romeral, Chanis… › Parque Lefevre ❌ | la dirección nueva › Betania |
| `corregimiento_envio` | Parque Lefevre ❌ | Betania |
| `zona_envio` | Z1 Centro · $6 · Parque Lefevre ❌ | Z1 Centro · $6 · Betania |
| `pin_envio` | vacío ❌ | el pin nuevo |

Todos esos campos entran ahora en el espejo. `pin_envio` es el único raro: el código viejo lo mandaba con
el MISMO valor que `maps_envio` y solo llegó uno — a vigilar en la próxima prueba, porque si vuelve a
pasar el problema está del lado de WATI (atributo mal declarado en su panel), no del nuestro.
