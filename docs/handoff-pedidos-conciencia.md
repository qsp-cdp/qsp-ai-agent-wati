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
| `pedido_ref` | número del pedido, canónico (se le quita el `#`: `#1001`→`1001`) — **clave de convergencia** y ARBITRO del upsert junto con `fuente` (UNIQUE `(fuente, pedido_ref)`) |
| `shopify_order_id` / `shipday_order_id` | id externo, solo REFERENCIA (nullable; `shopify-webhook` graba `shopify_order_id`; `shipday_order_id` hoy no se usa — el webhook de Shipday no lo trae) |
| `estado` | **normalizado**: `nuevo`,`asignado`,`en_camino`,`entregado`,`fallido`,`cancelado`,`desconocido` |
| `estado_raw` | estado crudo del proveedor (no perder fidelidad) |
| `metodo` | `propia`\|`servientrega`\|`retiro_agente_verde`\|`asesor` (amarra al modelo de zonas) — nullable |
| `tracking` | guía Servientrega / link de seguimiento Shipday (si hay) |
| `total_usd`, `resumen` | opcionales, livianos (ej. `1x Epson L3250`) |
| `zona` | (F4/v31 de shopify-webhook, 13-ago) zona resuelta legible: `Z1`/`Z4a` (metro) o `INT Chiriquí · David` (interior) — nullable |
| `zona_estado` | estado del resolver: `ok`\|`ambiguo`\|`sin_match`\|`sin_servicio` |
| `zona_ambito` | `metro`\|`interior` (solo cuando el resolver dio `ok`) |
| `tarifa_zona_usd` | tarifa de la zona SOLO metro con `ok` (la del interior la define Servientrega) |
| `envio_flag` | venta imposible/mal ruteada: `direccion_no_reconocida`\|`sin_servicio_comarca`\|`eligio_ciudad_siendo_interior`\|`eligio_interior_siendo_ciudad`\|`domicilio_imposible_z4a` |

**Privacidad:** NO se guarda aquí dirección, cédula, RUC ni datos de pago (el bot no los necesita para decir
el estado). Retención: purga futura por `created_at` (entregados/cancelados viejos), como `ref_codes`.

## Implementación (v48 — YA CABLEADA en este repo)

Cada escritor llama al helper **`upsertPedido()`** (`supabase/functions/_shared/db.ts`), que hace el upsert por
**`(fuente, pedido_ref)`** vía PostgREST (`Prefer: resolution=merge-duplicates`, `on_conflict=fuente,pedido_ref`),
**best-effort y null-safe** (nunca lanza: un fallo aquí no rompe el despacho ni la notificación; con timeout para
no colgar la respuesta; solo envía los campos con valor, así una fila `shipday` no pisa el `metodo`/`total` de la
`shopify`). El teléfono se normaliza a dígitos con código de país (`normalizePhone` → strip `\D`) para cruzar con
el `waId` de WATI. Quedó cableado así:

- **`shopify-webhook`** (F4/v31, back-porteado de prod el 13-ago — el upsert corre para **TODO pedido**, ya no
  solo los despachados, y ANTES de `createShipdayOrder`): `fuente:'shopify'`, `pedido_ref:String(order.orderNumber)`,
  `estado: cancelled_at ? 'cancelado' : 'nuevo'`, **`metodo` REAL** — con veredicto `ok`: interior→`servientrega`,
  metro→el `metodo` de la zona; sin veredicto: `propia` solo si se despacha (si no, se omite el campo) —
  `total_usd`, `resumen` (líneas), `shopify_order_id`, **+ `zona`/`zona_estado`/`zona_ambito`/`tarifa_zona_usd`/
  `envio_flag`** (retiro en tienda → sin zona ni flag: no hay dirección de entrega que clasificar).
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

**Método** — **`shopify-webhook` (v52) ya resuelve el método REAL** con el RPC `resolver_tarifa(dirección)` (fuente
única = data layer de zonas): para pedidos de Shopify el `metodo` de `pedidos` puede ser `servientrega`,
`retiro_agente_verde`, `asesor` o `propia` (cae a `propia` si el resolver no da veredicto `ok`). **El copiloto LEE
ese campo** (`frasearPedido`) → ya no asume flota propia para Shopify. `shipday-status` y `wati-order` **siguen** con
`metodo:'propia'` hardcodeado (pendiente: cuando haya asignaciones / tráfico real, resolverlos igual con
`resolver_tarifa`, para no duplicar la lógica).

**wa_id** — SIEMPRE dígitos sin `+`, con código de país (`normalizePhone` de `_shared/shipday.ts`, que ya
maneja Panamá +507). El RPC de lectura normaliza ambos lados, pero guardar normalizado mantiene el índice útil.

## Convergencia (⚠ dos reglas OBLIGATORIAS para los escritores)

Cada escritor hace upsert por **`(fuente, pedido_ref)`**: un mismo pedido real deja una fila `shopify` y una
`shipday` (el webhook de `shipday-status` NO trae un id interno de Shipday, así que el NÚMERO de pedido es la
llave común). El RPC las agrupa por `pedido_ref`, toma el estado de la fila de MAYOR avance de entrega (para
que un evento tardío no lo haga retroceder) y fusiona los campos estables no nulos (probado en Postgres
local). Para que la fusión sea correcta, los escritores DEBEN cumplir:

1. **`pedido_ref` COMPARTIDO.** Las dos filas deben caer en el mismo `pedido_ref`. En la implementación actual
   (webhook propio de Shopify, la app nativa de Shipday está desinstalada — ver `docs/shipday-bridge.md`),
   `shopify-webhook` crea la orden Shipday con `orderNumber = String(order.order_number)` (ej. `1001`), y
   `shipday-status` recibe ese mismo `orderNumber` de vuelta → convergen. **Blindaje:** `upsertPedido`
   CANONIZA el `pedido_ref` quitándole el `#` inicial, así aunque la app NATIVA de Shipday devolviera `#1001`,
   ambas filas caen en `1001`. Si un día se reactiva la integración nativa, verifica que el `orderNumber` que
   Shipday reporta canonice igual que el `order_number` de Shopify (si no, el bot mostraría el pedido dos veces).
2. **Un evento NO mapeado no degrada el estado (ya cableado).** `shipday-status` OMITE `estado` cuando
   `estadoNormalizado` da `'desconocido'` (evento de edición/reasignación tras `'en_camino'`) para no pisar un
   estado bueno; el `estado_raw`/`tracking` sí se actualizan. Y `shopify-webhook` escribe `estado` solo al
   CREAR (`'nuevo'`)/CANCELAR (`'cancelado'`); si a futuro se suscribe a `orders/updated`, que NO incluya
   `estado` en esos upserts. El RPC además rankea el avance como segunda línea de defensa.

## Estado del cableado

- ✅ **Copiloto (lector):** tool `estado_pedido` + RPC + fraseo — **en este repo (v48)**, con golden tests.
- ✅ **Tabla + RPC:** migración `20260707120000_pedidos.sql` + `20260707130000_contacts_grant.sql` — **APLICADAS
  el 07-jul** (verificado: `has_table_privilege` ok en `pedidos`/`contacts`, y `estado_pedido('…')` → `sin_pedidos`).
- ✅ **Escritores (shopify-webhook / shipday-status / wati-order):** versionados en este repo (merge de la
  rama del puente Shipday) y CABLEADOS con `upsertPedido` (best-effort, no rompe el despacho). Node tests
  18/18, golden 172/172. Se despliegan con `--no-verify-jwt` (ver `docs/despliegue-supabase.md` + `config.toml`).

> Nota de despliegue: el lector (v48) es **seguro de desplegar aunque la tabla esté vacía** — si no hay filas,
> `estado_pedido` devuelve `sin_pedidos` y el bot deriva con calma. Para que aporte valor: (1) aplicar la
> migración `20260707120000_pedidos.sql`; (2) desplegar/re-desplegar las funciones de despacho (ya cableadas)
> y el `copilot-webhook`; (3) confirmar que el pedido de Shipday lleva `orderNumber` = el número de pedido de
> Shopify (convergencia). El escritor de mayor cobertura es `shopify-webhook`.
