# Conciencia de pedidos — contrato de la tabla `pedidos` (copiloto v48 ↔ despacho Shipday/Shopify)

> Objetivo: que el **copiloto de WATI** sepa "en qué va" el pedido de un cliente cuando lo pregunta
> (*"¿dónde está mi pedido?"*), sin adivinar. El copiloto **LEE**; las funciones de despacho **ESCRIBEN**.
> La tabla `public.pedidos` (migración `20260707120000_pedidos.sql`) es el **puente**, con llave natural
> `wa_id` (el teléfono), igual que `conversations`/`ref_codes`.

## Arquitectura

```
Shopify (pedido creado/pagado) ──► shopify-webhook  ─┐
Shipday (cambio de estado)     ──► shipday-status   ─┼─► upsert public.pedidos ◄── LEE ── copilot-webhook
WATI→Shipday (despacho)        ──► wati-order       ─┘        (RPC estado_pedido)   (tool estado_pedido)
```

- El copiloto llama al RPC `estado_pedido(p_wa_id)` (solo lectura), que **deduplica por número de pedido**,
  **fusiona campos no nulos** entre la fila `shopify` y la `shipday` del mismo pedido, y devuelve los 3 más
  recientes. El fraseo lo arma en código (`frasearPedido`, puro) — el bot **nunca inventa** estado/fecha/guía.
- Si no hay pedido visible, el bot **NO** afirma "usted no tiene pedidos" (su vista es parcial) → deriva a un
  asesor. `estado_pedido` **no** está disponible en MODO ASISTENCIA (ahí un humano lleva el caso).

## La tabla (resumen; el detalle está en la migración)

| columna | uso |
|---|---|
| `wa_id` | teléfono en **dígitos, sin `+`** (ej. `50761234567`). Debe coincidir con el `waId` de WATI. |
| `fuente` | `shopify` \| `wati` \| `shipday` \| `manual` |
| `pedido_ref` | número visible del pedido (ej. `#1001`) — **clave de convergencia** entre filas |
| `shopify_order_id` / `shipday_order_id` | id externo — **arbitro del upsert** de cada escritor (UNIQUE) |
| `estado` | **normalizado**: `nuevo`,`asignado`,`en_camino`,`entregado`,`fallido`,`cancelado`,`desconocido` |
| `estado_raw` | estado crudo del proveedor (no perder fidelidad) |
| `metodo` | `propia`\|`servientrega`\|`retiro_agente_verde`\|`asesor` (amarra al modelo de zonas) — nullable |
| `tracking` | guía Servientrega / link de seguimiento Shipday (si hay) |
| `total_usd`, `resumen` | opcionales, livianos (ej. `1x Epson L3250`) |

**Privacidad:** NO se guarda aquí dirección, cédula, RUC ni datos de pago (el bot no los necesita para decir
el estado). Retención: purga futura por `created_at` (entregados/cancelados viejos), como `ref_codes`.

## Implementación (v48 — YA CABLEADA en este repo)

Cada escritor llama al helper **`upsertPedido()`** (`supabase/functions/_shared/db.ts`), que hace el upsert por
**`(fuente, pedido_ref)`** vía PostgREST (`Prefer: resolution=merge-duplicates`, `on_conflict=fuente,pedido_ref`),
**best-effort y null-safe** (nunca lanza: un fallo aquí no rompe el despacho ni la notificación; con timeout para
no colgar la respuesta; solo envía los campos con valor, así una fila `shipday` no pisa el `metodo`/`total` de la
`shopify`). El teléfono se normaliza a dígitos con código de país (`normalizePhone` → strip `\D`) para cruzar con
el `waId` de WATI. Quedó cableado así:

- **`shopify-webhook`** (tras `createShipdayOrder` OK): `fuente:'shopify'`, `pedido_ref:String(order.orderNumber)`,
  `estado: cancelled_at ? 'cancelado' : 'nuevo'`, `metodo:'propia'` (pasó el filtro de entrega local → reparto
  propio), `total_usd`, `resumen` (líneas), `shopify_order_id`.
- **`shipday-status`** (tras parsear el evento): `fuente:'shipday'`, `pedido_ref:event.orderNumber`,
  `estado: estadoNormalizado(event.status)` (helper en `_shared/status.ts`), `estado_raw`, `tracking`, `metodo:'propia'`.
- **`wati-order`** (tras `createShipdayOrder` OK): `fuente:'wati'`, `pedido_ref:String(order.orderNumber)`,
  `estado:'nuevo'`, `metodo:'propia'`, `total_usd`, `resumen`.

El copiloto frasea el `estado` NORMALIZADO (no el crudo). `estadoNormalizado` (en `_shared/status.ts`) mapea el
vocabulario de Shipday (el mismo que `STATUS_MESSAGES`).

## Mapeos

**Estado de Shipday → normalizado** (`ESTADO_SHIPDAY`):
```ts
const ESTADO_SHIPDAY = {
  ORDER_ASSIGNED: "asignado", ACCEPTED: "asignado", STARTED: "asignado",
  PICKED_UP: "en_camino", ONTHEWAY: "en_camino",
  ALREADY_DELIVERED: "entregado", COMPLETED: "entregado",
  FAILED_DELIVERY: "fallido", INCOMPLETE: "fallido",
} as Record<string, string>; // ajustar a los estados EXACTOS que emita su cuenta Shipday
```

**Método** — en la implementación actual, todo pedido que llega a Shipday pasó el filtro de entrega local
(`shouldDispatchShopifyOrder` / `SHOPIFY_DELIVERY_FILTER`) → es reparto **propio**, así que los tres escritores
ponen `metodo:'propia'`. A futuro, si Shipday también rutea servientrega/retiro, la fuente única del método por
sector es el RPC `resolver_tarifa(lugar)` (data layer de zonas), para no duplicar la lógica.

**wa_id** — SIEMPRE dígitos sin `+`, con código de país (`normalizePhone` de `_shared/shipday.ts`, que ya
maneja Panamá +507). El RPC de lectura normaliza ambos lados, pero guardar normalizado mantiene el índice útil.

## Convergencia (⚠ dos reglas OBLIGATORIAS para los escritores)

Cada escritor hace upsert por **`(fuente, pedido_ref)`**: un mismo pedido real deja una fila `shopify` y una
`shipday` (el webhook de `shipday-status` NO trae un id interno de Shipday, así que el NÚMERO de pedido es la
llave común). El RPC las agrupa por `pedido_ref`, toma el estado de la fila de MAYOR avance de entrega (para
que un evento tardío no lo haga retroceder) y fusiona los campos estables no nulos (probado en Postgres
local). Para que la fusión sea correcta, los escritores DEBEN cumplir:

1. **`pedido_ref` COMPARTIDO (obligatorio, no opcional).** Ambos escritores deben poner el MISMO
   `pedido_ref` = el número de pedido de Shopify (`order.name`). Al crear el pedido Shipday desde
   `shopify-webhook`, pasa `order.name` como `orderNumber` de Shipday; así `shipday-status` lo devuelve en
   `ev.orderNumber` y las dos filas caen en el mismo grupo. Si NO comparten `pedido_ref`, el bot mostraría el
   mismo pedido dos veces con estados contradictorios (hallazgo de la revisión adversarial).
2. **`shopify-webhook` NO debe pisar `estado` con `'nuevo'` en eventos posteriores.** Escribe `estado` solo al
   CREAR (`'nuevo'`) y al CANCELAR (`'cancelado'`). Si te suscribes a `orders/updated`/fulfillment, en esos
   upserts NO incluyas `estado` (déjalo fuera del objeto), para no retroceder el estado de entrega que ya
   escribió `shipday-status`. El RPC además rankea el avance como segunda línea de defensa, pero un `'nuevo'`
   tardío con un `pedido_ref` distinto rompería la regla 1 igual: cumple las dos.

## Estado del cableado

- ✅ **Copiloto (lector):** tool `estado_pedido` + RPC + fraseo — **en este repo (v48)**, con golden tests.
- ✅ **Tabla + RPC:** migración `20260707120000_pedidos.sql` — validada en Postgres local; **falta aplicarla**
  en Supabase (SQL Editor).
- ✅ **Escritores (shopify-webhook / shipday-status / wati-order):** versionados en este repo (merge de la
  rama del puente Shipday) y CABLEADOS con `upsertPedido` (best-effort, no rompe el despacho). Node tests
  18/18, golden 172/172. Se despliegan con `--no-verify-jwt` (ver `docs/despliegue-supabase.md` + `config.toml`).

> Nota de despliegue: el lector (v48) es **seguro de desplegar aunque la tabla esté vacía** — si no hay filas,
> `estado_pedido` devuelve `sin_pedidos` y el bot deriva con calma. Para que aporte valor: (1) aplicar la
> migración `20260707120000_pedidos.sql`; (2) desplegar/re-desplegar las funciones de despacho (ya cableadas)
> y el `copilot-webhook`; (3) confirmar que el pedido de Shipday lleva `orderNumber` = el número de pedido de
> Shopify (convergencia). El escritor de mayor cobertura es `shopify-webhook`.
