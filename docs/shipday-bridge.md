# QSP Delivery Bridge — Migración Tookan → Shipday

Servicio puente para Quick Service Panama que reemplaza Tookan (JungleWorks) por **Shipday** como app de mensajería/entregas. Cubre tres frentes:

1. **Shopify → Shipday**: los pedidos de la tienda disparan la orden de entrega en Shipday.
2. **WATI → Shipday**: cuando un prospecto/cliente compra por WhatsApp, el bot captura la dirección con una plantilla y este servicio crea la orden en Shipday.
3. **Migración de contactos desde Tookan**: script que exporta las direcciones de clientes de Tookan a una libreta local que el bot de WATI consulta para clientes recurrentes.

> **¿Repo nuevo, Drive o aquí?** Aquí. El código y los scripts de migración deben vivir en GitHub (versionado, historial, PRs). Google Drive solo sirve para guardar el CSV exportado de Tookan como respaldo documental. No hace falta otro repositorio: este ya está dedicado a la integración WATI/entregas de QSP.

---

## 1. Shopify → Shipday (sin fricción)

**Vía recomendada: la integración nativa de Shipday — no requiere código.**

1. En el panel de Shipday: **Integrations → Shopify → Connect**.
2. Autoriza la app de Shipday en tu tienda Shopify.
3. En la configuración de la integración elige qué pedidos se envían (todos, o solo los marcados para delivery local) y el momento del disparo (al crear el pedido o al marcarlo *fulfilled*).
4. Haz un pedido de prueba y verifica que aparece en el dashboard de Shipday.

Con eso, cada pedido de Shopify crea automáticamente la orden de entrega en Shipday con nombre, teléfono, dirección e ítems. **Es la opción sin fricción: úsala primero.**

**Vía alternativa (este servicio):** si necesitas personalizar el mapeo (por ejemplo, agregar referencias de dirección o filtrar productos), este repo incluye el endpoint `POST /webhooks/shopify/orders-create`:

1. Despliega este servicio (Render, Railway, Fly.io o un VPS) con las variables de `.env.example`.
2. En Shopify Admin: **Settings → Notifications → Webhooks → Create webhook**, evento `Order creation`, formato JSON, URL `https://TU-SERVICIO/webhooks/shopify/orders-create`.
3. Copia el *signing secret* que muestra Shopify a `SHOPIFY_WEBHOOK_SECRET` (el servicio valida la firma HMAC de cada llamada).

## 2. WATI → Shipday (compra asistida por WhatsApp)

Cuando el cliente quiere que lo ayudemos a comprar por WhatsApp, el flujo de WATI captura los datos con la plantilla de dirección (ver [`docs/plantilla-wati.md`](docs/plantilla-wati.md)) y al final llama a este servicio:

```
POST https://TU-SERVICIO/webhooks/wati/order
Header: x-wati-token: <WATI_WEBHOOK_TOKEN>
Body JSON:
{
  "nombre":     "Carlos Jordán",
  "telefono":   "6111-2233",
  "direccion":  "Vía España, Edif. Roma, piso 3",
  "referencia": "frente al banco",        // opcional
  "pedido":     "1x Impresora Epson L3250", // opcional, texto libre
  "total":      "289.00"                   // opcional
}
```

El servicio normaliza el teléfono (agrega `+507` si viene local), arma la orden y la inserta en Shipday. Antes de pedir la dirección, el bot puede consultar la libreta migrada de Tookan para pre-llenarla:

```
GET /contacts/lookup?phone=61112233   (mismo header x-wati-token)
→ { "found": true, "contact": { "name": "...", "address": "...", ... } }
```

## Estados de entrega (Shipday → este servicio)

Shipday puede avisar cada cambio de estado (asignado, en camino, entregado, fallido). En el panel de Shipday: **Integraciones → API → Configuración de Webhook → + Agregar Enlace API** y registra:

```
https://TU-SERVICIO/webhooks/shipday/status?token=<SHIPDAY_WEBHOOK_TOKEN>
```

El servicio registra cada evento en los logs. Si además quieres que el cliente reciba el aviso por el WhatsApp de WATI (en lugar de las notificaciones nativas de Shipday), configura `WATI_NOTIFY=true` junto con `WATI_API_ENDPOINT` y `WATI_API_TOKEN`. Por defecto está apagado para no duplicar mensajes, porque el plan Branded Premium de Shipday ya notifica por WhatsApp.

## 3. Migración de contactos (direcciones) desde Tookan

Shipday no tiene libreta de contactos por API: las direcciones viajan dentro de cada orden. Por eso la libreta migrada vive en `data/contacts.json` y la consulta el bot de WATI (endpoint `/contacts/lookup`).

**Opción A — Export CSV del panel de Tookan (recomendada):**

1. Tookan Dashboard → **Customers → Export** (descarga el CSV).
2. `node scripts/migrate-tookan.js --csv export-tookan.csv`

**Opción B — API de Tookan:**

1. Tookan Dashboard → Settings → API Keys → copia la key a `TOOKAN_API_KEY`.
2. `node scripts/migrate-tookan.js --api`

Ambas generan `data/contacts.json` (usado por el servicio) y `data/contacts.csv` (copia para revisar en Excel o respaldar en Drive). El script deduplica por teléfono y conserva latitud/longitud cuando Tookan las tiene.

> Nota: el endpoint del API de Tookan para listar clientes (`/v2/get_all_customers`) puede variar según el plan; si devuelve error, usa la Opción A, que siempre funciona. Verifica el nombre exacto en https://tookanapi.docs.apiary.io/.

## Despliegue

**Vía recomendada: Supabase** (Edge Functions + Postgres) — siempre despierto, contactos en base de datos permanente, dentro del tier gratuito y sin cuentas nuevas. Guía completa: [`docs/despliegue-supabase.md`](docs/despliegue-supabase.md).

Alternativa: Render con el servicio Express de `src/` ([`docs/despliegue-render.md`](docs/despliegue-render.md)). La lógica es la misma en ambas versiones; las Edge Functions (`supabase/functions/`) son el port Deno del código de `src/`, que conserva las pruebas unitarias.

## Puesta en marcha

```bash
npm install
cp .env.example .env   # completa las claves
npm test               # pruebas de mapeo y migración
npm start              # levanta el servicio en :3000
```

## Checklist de migración (apagar Tookan sin cortes)

1. [x] Cuenta Shipday (Branded Premium) con API key generada. *(01-jul)*
2. [x] Shopify → Shipday **por webhook propio** (la app nativa se descartó y desinstaló por la fricción de su widget; ver `docs/despliegue-supabase.md`). Pedidos de prueba #8635/#8636 verificados. *(03-jul)*
3. [x] 5,276 clientes de Tookan migrados a la tabla `contacts` de Supabase, lookup por teléfono verificado. *(02-jul)*
4. [x] Webhook de estados de Shipday activo (`ORDER_INSERTED` verificado en logs). *(03-jul)*
5. [x] Repartidores con la app Shipday Driver y simulacro de entrega completado. *(03-jul)*
6. [x] Backend del flujo WATI desplegado y probado end-to-end (04-jul): captura de
   dirección con atributos en el perfil (`wati-address`), despacho que toma la
   dirección de la libreta + anuncio al cliente + orden en Shipday (`wati-order`).
   Pendiente: armar el flujo/plantilla en el panel de WATI (ver `docs/plantilla-wati.md`).
7. [x] ~5,100 clientes de Tookan enriquecidos en Shopify (dirección + etiquetas
   `tookan/delivery`) para pedidos asistidos por asesor (04-jul).
8. [ ] Tras unos días estables, cancelar la suscripción de Tookan/JungleWorks.

## Estructura

```
src/server.js            Express: webhooks Shopify y WATI, lookup de contactos
src/shipday.js           Cliente Shipday + mapeos Shopify/WATI → orden Shipday
src/contacts.js          Libreta de direcciones migrada (búsqueda por teléfono)
scripts/migrate-tookan.js  Migración de clientes Tookan (CSV o API)
docs/plantilla-wati.md   Plantilla y flujo de captura de dirección en WATI
data/                    contacts.json / contacts.csv generados (no se versionan)
```
