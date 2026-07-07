# Despliegue en Supabase (Edge Functions + Postgres)

Vía recomendada: usa el proyecto de Supabase que ya tienes. Sin servidores que se duermen, contactos en una base de datos permanente, y dentro del tier gratuito (500 mil invocaciones/mes vs. ~300 pedidos/mes).

**URLs finales** (reemplaza `<REF>` por el ref de tu proyecto):

| Función | URL | Quién la llama |
|---|---|---|
| `shopify-webhook` | `https://<REF>.supabase.co/functions/v1/shopify-webhook` | Webhook de Shopify |
| `wati-order` | `https://<REF>.supabase.co/functions/v1/wati-order` | Flujo de WATI (crear pedido) |
| `contacts-lookup` | `https://<REF>.supabase.co/functions/v1/contacts-lookup?phone=...` | Flujo de WATI (pre-llenar dirección) |
| `shipday-status` | `https://<REF>.supabase.co/functions/v1/shipday-status?token=...` | Webhook de Shipday (estados) |

## 1. Preparar el CLI (una vez)

```bash
npm install -g supabase
supabase login                        # abre el navegador
supabase link --project-ref <REF>    # ref: Dashboard → Settings → General
```

Edita `supabase/config.toml` y pon tu `project_id` real.

## 2. Crear la tabla de contactos

```bash
supabase db push
```

Crea `public.contacts` con índice de búsqueda por los últimos 8 dígitos del teléfono y RLS activado (solo las funciones acceden; el API público no puede leer datos personales).

## 3. Configurar los secretos

```bash
supabase secrets set \
  SHIPDAY_API_KEY=<la key oLMX... del panel de Shipday> \
  SHOPIFY_WEBHOOK_SECRET=<se obtiene en el paso 5> \
  WATI_WEBHOOK_TOKEN=<inventa un token largo aleatorio> \
  SHIPDAY_WEBHOOK_TOKEN=<inventa otro token largo aleatorio> \
  SHOPIFY_DELIVERY_FILTER="entrega local,local delivery" \
  PICKUP_NAME="Quick Service Panama" \
  PICKUP_ADDRESS="Plaza Aventura Business Center, Vía Ricardo J. Alfaro, Panamá" \
  PICKUP_PHONE=<teléfono del negocio> \
  WATI_NOTIFY=false
```

Para generar tokens aleatorios: `openssl rand -hex 24` (dos veces).

## 4. Desplegar las funciones

```bash
supabase functions deploy shopify-webhook --no-verify-jwt
supabase functions deploy wati-order --no-verify-jwt
supabase functions deploy contacts-lookup --no-verify-jwt
supabase functions deploy shipday-status --no-verify-jwt
```

(`--no-verify-jwt` porque Shopify/Shipday/WATI no envían JWT de Supabase; la seguridad la dan la firma HMAC de Shopify y los tokens propios.)

## 5. Conectar Shopify por webhook (y quitar la app con fricción)

1. Shopify Admin → **Configuración → Notificaciones → Webhooks → Crear webhook**:
   - Evento: **Creación de pedidos** (o **Preparación de pedidos** si prefieres disparar al hacer fulfillment).
   - Formato: JSON. URL: la de `shopify-webhook` de la tabla de arriba.
2. Copia la clave de firma que muestra Shopify ("Your webhooks will be signed with...") y actualiza el secreto:
   ```bash
   supabase secrets set SHOPIFY_WEBHOOK_SECRET=<la clave>
   ```
3. Shopify Admin → **Apps → Shipday → Desinstalar** (adiós widget de fecha/hora del carrito).

`SHOPIFY_DELIVERY_FILTER` hace que solo los pedidos con método de envío "Entrega Local" generen viaje; retiros en tienda se omiten. El texto debe coincidir con el nombre de tu tarifa en Shopify → Configuración → Envío.

## 6. Subir los contactos migrados de Tookan

```bash
SUPABASE_URL=https://<REF>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<Dashboard → Settings → API keys → service_role> \
node scripts/upload-contacts-supabase.js data/contacts.json
# → Listo: 5276 contactos en Supabase
```

Re-ejecutable: reemplaza la carga anterior de Tookan sin tocar los contactos que WATI vaya creando (cada pedido por WATI guarda/actualiza la dirección del cliente automáticamente).

## 7. Registrar el webhook de estados en Shipday

Shipday → **Integraciones → API → Configuración de Webhook → + Agregar Enlace API**:

```
https://<REF>.supabase.co/functions/v1/shipday-status?token=<SHIPDAY_WEBHOOK_TOKEN>
```

## 8. Configurar el flujo de WATI

Sigue `docs/plantilla-wati.md` usando las URLs de `wati-order` y `contacts-lookup` con el header `x-wati-token: <WATI_WEBHOOK_TOKEN>`.

## 9. Prueba end-to-end

1. Pedido de prueba en Shopify con "Entrega Local" → debe aparecer en Shipday con nombre/teléfono/dirección.
2. Pedido de retiro en tienda → NO debe aparecer (Dashboard → Edge Functions → shopify-webhook → Logs: "omitido").
3. `curl -H "x-wati-token: <token>" "https://<REF>.supabase.co/functions/v1/contacts-lookup?phone=61308311"` → debe devolver un contacto migrado.
4. Simular pedido WATI con `curl -X POST .../wati-order` y el JSON de la plantilla → orden en Shipday + contacto guardado.
5. Asignar repartidor en Shipday → ver el evento en los logs de `shipday-status`.

Los logs de todo viven en Supabase Dashboard → **Edge Functions → (función) → Logs**.
