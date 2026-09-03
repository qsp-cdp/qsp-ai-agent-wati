# Flujo de despliegue — regla anti-deriva (repo-first)

> **Por qué existe este doc.** Dos veces la deriva "prod ≠ repo" costó caro:
> 1. El **v52 de `shopify-webhook`** se aplicó a mano en prod pero no se commiteó → un redeploy desde el
>    repo lo habría **revertido en silencio** (lo rescatamos en jul-2026 capturándolo de prod).
> 2. Un deploy por **MCP/dashboard con contenido inline truncó** el `index.ts` y **tumbó prod** (el fix fue
>    volver al CLI byte-exacto).
> La regla que evita ambos: **repo-first**. Todo cambio nace en el repo y de ahí se despliega; **nunca se edita
> prod a mano** (ni el código de una función, ni el SQL de la base).

Todo el proyecto vive en **un solo repo** (`qsp-cdp/qsp-ai-agent-wati`): el copiloto, el puente de despacho y
el cron. No hay repos paralelos.

## Regla de oro

**El repo es la única fuente de verdad de lo desplegado.** Si algo corre en prod, tiene que existir —idéntico—
en el repo. El orden SIEMPRE es: **(1) cambio en el repo → (2) commit → (3) deploy byte-exacto**. Nunca al revés.

## Flujo por tipo de cambio

### 1. Código de una Edge Function (TS)
1. Editá el archivo en el repo (`supabase/functions/<fn>/index.ts` o `_shared/*.ts`).
2. Corré las pruebas: `node tests/golden.mjs` (copiloto) y/o `npm test` (puente Node, `test/*.test.js`).
3. `git commit` + push.
4. `git pull` en la máquina de despliegue → **`.\deploy.ps1 <fn>`** (PowerShell, desde la raíz del repo).
   - `.\deploy.ps1` sin argumentos = las **7 funciones**; con nombre = solo esa.
   - El CLI sube el archivo **byte-exacto desde disco**. **NUNCA** pegues código en el dashboard ni por MCP
     (pasan el contenido por un editor que puede truncarlo — ya tumbó prod una vez).
   - **`--no-verify-jwt` es obligatorio** (el script ya lo pasa): son webhooks públicos guardados por `?key=`
     / HMAC / token propio. Si queda en true, WATI/Shopify/Shipday reciben 401.
   - Las funciones que importan `_shared/` (`shopify-webhook`, `shipday-status`, `wati-order`, `wati-address`,
     `contacts-lookup`, `reengage-expired`) **solo se despliegan por CLI** — el dashboard no empaqueta los
     imports.
5. Verificá el **healthcheck** (el `deploy.ps1` lo hace para `copilot-webhook`): la `version` esperada, `mode`,
   `verify_jwt=OFF`. Las de despacho son POST (sin GET); se verifican con un evento real / los logs.

Las 7 funciones: `copilot-webhook` · `wati-address` · `contacts-lookup` · `shopify-webhook` · `shipday-status`
· `wati-order` · `reengage-expired`.

### 2. Cambio de base de datos (esquema o datos "de sistema")
**Todo cambio de esquema o de datos que el código asume va como MIGRACIÓN versionada** en
`supabase/migrations/AAAAMMDDHHMMSS_nombre.sql`, commiteada. Nunca se corre DDL/DML suelto en prod sin que una
migración lo capture.
- Idempotente siempre que se pueda (`create … if not exists`, `create or replace`, upsert / delete-then-insert).
- **RLS + grants:** este proyecto tiene **auto-expose OFF** → toda tabla nueva necesita `enable row level
  security` **y** `grant … to service_role` (RLS on sin policies = solo `service_role`; el resto queda fuera).
  Sin el grant, las funciones dan *permission denied*.
- Validá local antes de aplicar (patrón usado en el repo): levantá un Postgres temporal, corré la cadena de
  migraciones que toca esas tablas + la nueva, y probá el resultado. (Ej. real: se validó `resolver_tarifa` v2
  + sectores en PG16 local antes de commitear.)
- Se aplica en el **SQL Editor** de Supabase. Si el cambio ya está en prod (hotfix manual), la migración es solo
  para fidelidad del repo — **no se re-aplica**, pero se commitea igual (y se marca "YA en prod" en el header).

**Datos editables de negocio** (`store_facts`, zonas/sectores): también por migración. Ojo — `store_facts` es un
**espejo del metaobjeto Shopify** `store_facts/datos-tienda`: si se cambia el valor por SQL, hay que **espejarlo
en el metaobjeto** o un re-sync desde Shopify lo revierte.

### 3. Secretos
Los secretos **NO van al repo** (por diseño). Se setean con `supabase secrets set …` (o el dashboard) y se
**documentan por NOMBRE** (nunca el valor) en `CLAUDE.md`. Un secreto nuevo requiere setearlo antes de que el
deploy que lo usa sirva tráfico. Verificá el healthcheck (expone flags como `…_configured`) tras tocarlos.

## Antes de cada deploy (checklist)
- [ ] `node tests/golden.mjs` verde (copiloto).
- [ ] `npm test` verde si tocaste el puente Node (`src/` / `_shared/shipday.ts`).
- [ ] Si tocaste esquema/datos: la migración está commiteada (y validada local si es no trivial).
- [ ] Sé qué `version` string espero en el healthcheck.

## Si YA hubo un cambio manual en prod (hotfix de emergencia)
Pasa. La regla no es "nunca toques prod", es **"back-porteá enseguida"**:
1. Capturá el estado real de prod: código de la función (o `pg_get_functiondef` / dump de la tabla para SQL).
2. Reproducilo idéntico en el repo (código y/o migración), validá, commiteá.
3. Marcá en el header "aplicado a mano el <fecha>, YA en prod; esta migración es para fidelidad del repo".
Hasta que ese back-port esté commiteado, **NO redespliegues esa función desde el repo** (borrarías el hotfix).

## Quién es qué (todo en este repo)
- **Copiloto:** `copilot-webhook` (+ `tests/golden.mjs`).
- **Despacho (puente Shipday):** `shopify-webhook` / `shipday-status` / `wati-order` / `wati-address` /
  `contacts-lookup` + `_shared/` + el servicio Node espejo en `src/` con `test/*.test.js`.
- **Cron:** `reengage-expired`.
Contratos entre piezas: `docs/handoff-pedidos-conciencia.md`, `docs/shipday-bridge.md`,
`docs/handoff-cdp-ref-code-bridge.md`.
