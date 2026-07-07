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

## Contrato de ESCRITURA (lo que cada función de despacho debe hacer)

Cada escritor hace **un upsert** sobre SU id externo. Ejemplo con `@supabase/supabase-js` (el mismo cliente
`service_role` que ya usan las funciones); adaptar a su helper `_shared/db.ts` si usan PostgREST directo.

### 1) `shopify-webhook` — al recibir el pedido (orders/create o orders/paid)
```ts
const waId = normalizePhone(order.customer?.phone || order.shipping_address?.phone); // dígitos, sin '+'
const metodo = metodoDeShopify(order); // ver mapeo abajo (SHOPIFY_DELIVERY_FILTER / resolver_tarifa)
await sb.from("pedidos").upsert({
  wa_id: waId,
  fuente: "shopify",
  pedido_ref: order.name,                 // "#1001"
  shopify_order_id: String(order.id),     // arbitro del upsert
  estado: order.cancelled_at ? "cancelado" : "nuevo",
  estado_raw: order.financial_status,     // "paid" / "pending" …
  metodo,
  total_usd: Number(order.total_price) || null,
  resumen: (order.line_items || []).map(li => `${li.quantity}x ${li.title}`).slice(0,3).join(", ") || null,
  updated_at: new Date().toISOString(),
}, { onConflict: "shopify_order_id" });
```

### 2) `shipday-status` — al recibir el webhook de estado de Shipday
```ts
const ev = parseShipdayStatusEvent(body);          // ya existe en _shared/status.ts
const waId = normalizePhone(ev.customerPhone);      // dígitos, sin '+'
await sb.from("pedidos").upsert({
  wa_id: waId,
  fuente: "shipday",
  pedido_ref: ev.orderNumber,                       // idealmente = order.name de Shopify (converge)
  shipday_order_id: String(ev.shipdayOrderId),      // arbitro del upsert
  estado: ESTADO_SHIPDAY[ev.status] ?? "desconocido",
  estado_raw: ev.status,                            // ORDER_ASSIGNED / ONTHEWAY / …
  tracking: ev.trackingUrl ?? null,
  updated_at: new Date().toISOString(),
}, { onConflict: "shipday_order_id" });
```

### 3) `wati-order` — al despachar un pedido capturado por WATI hacia Shipday
Igual que (2) pero `fuente: "wati"`, con el `shipday_order_id` que devuelva `createShipdayOrder(...)` y el
`metodo` conocido (casi siempre `propia`). `pedido_ref` = el número/ref que se le asigne.

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

**Método (`metodoDeShopify`)** — el mismo criterio que ya usa `shouldDispatchShopifyOrder`
(`SHOPIFY_DELIVERY_FILTER` sobre `shipping_lines[].title/code`): si el envío es de reparto propio → `propia`;
si es Servientrega a domicilio → `servientrega`; si es retiro en agente verde → `retiro_agente_verde`. A
futuro, la fuente única del método por sector es el RPC `resolver_tarifa(lugar)` (data layer de zonas), para
no duplicar la lógica.

**wa_id** — SIEMPRE dígitos sin `+`, con código de país (`normalizePhone` de `_shared/shipday.ts`, que ya
maneja Panamá +507). El RPC de lectura normaliza ambos lados, pero guardar normalizado mantiene el índice útil.

## Convergencia (por qué puede haber 2 filas por pedido)

`shopify-webhook` inserta con `shopify_order_id`; `shipday-status` con `shipday_order_id`. Si no comparten un
id, quedan **2 filas** para el mismo pedido real. No es problema para la lectura: el RPC agrupa por
`pedido_ref` y devuelve el **estado más fresco** fusionando los campos no nulos (probado en Postgres local:
`#1001` sale `entregado` conservando `metodo=propia`/`total`/`resumen`). **Mejora opcional** cuando se cablee
el código real: que `shopify-webhook` pase `order.name` como `orderNumber` de Shipday → ambos escritores caen
en el mismo `pedido_ref` y la fusión es perfecta.

## Estado del cableado

- ✅ **Copiloto (lector):** tool `estado_pedido` + RPC + fraseo — **en este repo (v48)**, con golden tests.
- ✅ **Tabla + RPC:** migración `20260707120000_pedidos.sql` — validada en Postgres local; **falta aplicarla**
  en Supabase (SQL Editor).
- ⏳ **Escritores (shopify-webhook / shipday-status / wati-order):** viven en el proyecto Supabase
  `jbigmlcalcwiphqeudxd` y en un repo canónico Node (con pruebas). **Pendiente versionarlos en este repo** y
  agregarles el upsert de arriba. Para hacerlo con el código REAL (no reconstruido de memoria), traer los
  archivos vía una sesión con el MCP de GitHub/Supabase autorizado, o pegarlos por Browse.

> Nota de despliegue: el lector (v48) es **seguro de desplegar aunque la tabla esté vacía** — si no hay filas,
> `estado_pedido` devuelve `sin_pedidos` y el bot deriva con calma. Pero solo aporta valor una vez que exista
> al menos un escritor. Recomendado: aplicar la migración y cablear `shopify-webhook` (el escritor de mayor
> cobertura) antes o junto con el deploy de v48.
