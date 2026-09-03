# Frente B — Puente de despacho (Shopify/WATI → Shipday) y funciones satélite

Auditoría de solo lectura · 27-ago-2026 · proyecto `jbigmlcalcwiphqeudxd`
Worktree auditado: `/tmp/claude-0/-home-user-qsp-ai-agent-wati/b94bdfcc-2aed-533f-a369-8bf885eb0a6f/scratchpad/audit-v119` (rama desplegada `claude/supabase-agent-review-tvvg61`, HEAD `d33e539` "despacho v68") · Rama histórica: `/home/user/qsp-ai-agent-wati` (`claude/exciting-galileo-2yuz1s`, HEAD `7d87e74` v73.1)

## 1 · Veredicto

**Drift rama↔prod: CERO** — las 3 funciones del puente desplegadas hoy/esta semana son byte-idénticas al worktree, el círculo de pedidos está vivo en las 3 patas y v67/v68 están correctos en lo esencial. **El riesgo dominante no está en el código sino en la operación:** la rama vieja (v73.1) sigue viva en origin con un `deploy.ps1` que en un solo comando pisaría 8 funciones de prod con código de hace 2 semanas — y nada lo previene. Segundo riesgo: la trampa v68 (`hmac_rechazado`) registra pero **ninguna alarma la lee**, y el único test commiteado del puente **no corre** (importa un helper que nunca se versionó).

## 2 · Drift rama ↔ prod (código desplegado descargado por MCP y diffeado)

| Función | Prod | Desplegada | Veredicto |
|---|---|---|---|
| `shopify-webhook` | v74 | 27-ago 13:42 UTC (CI, entrypoint `/home/runner/...`) | **IDÉNTICO** — `index.ts` + `_shared/shipday.ts` + `_shared/db.ts`, diff vacío |
| `shipday-status` | v69 | 25-ago 20:03 UTC (CI) | **IDÉNTICO** — `index.ts` + `_shared/{shipday,status,watiapi,db}.ts`, diff vacío |
| `wati-order` | v69 | 25-ago 20:04 UTC (CI) | **IDÉNTICO** — `index.ts` + `_shared/{shipday,db,watiapi}.ts`, diff vacío |

Los `_shared` empaquetados en los 3 bundles son idénticos entre sí (mismo sha256 por archivo: `shipday.ts` 985c9a5d…, `db.ts` 9e862a2f…, `watiapi.ts` b979779c…) — sin deriva interna entre bundles. La regresión tipo ~06-ago (perder `upsertPedido` en prod) **no está presente hoy**: prod corre exactamente la rama nueva, desplegada por GitHub Actions.

Nota: los commits v67 (`e61a532`, 26-ago) y v68 (`d33e539`, 27-ago) tocan solo `supabase/functions/shopify-webhook/index.ts`; no hay commits del puente posteriores al 25-ago sin desplegar.

## 3 · Hallazgos

### ✅ Verificado en verde (contexto para los hallazgos)

- **Círculo de pedidos INTACTO.** Los 3 escritores hacen `upsertPedido()` por `(fuente, pedido_ref)` vía PostgREST `on_conflict=fuente,pedido_ref` (`_shared/db.ts:173-199`): `shopify-webhook/index.ts:271-286` (todo pedido) y `:352-357` (marca shipday_order_id), `wati-order/index.ts:116-129`, `shipday-status/index.ts:254-262`. **Pata `wati` ENCENDIDA**: 11 filas (8 en los últimos 7 días, última 26-ago 14:44). Prod hoy: shopify 141 filas · shipday 56 · wati 11; 32 de 176 `pedido_ref` convergen con ≥2 fuentes y 9/11 pedidos WATI tienen su pata shipday convergida. El lector del copiloto existe y calza: RPC `estado_pedido(p_wa_id text)` en prod (security definer, dedup por `pedido_ref`), 20 referencias a `estado_pedido/frasearPedido` en el `copilot-webhook/index.ts` del worktree. Contrato intacto.
- **Fail-closed correcto en los 3 webhooks**: `shipday-status/index.ts:223-225` (sin `SHIPDAY_WEBHOOK_TOKEN` → 401, con `.trim()`); `wati-order/index.ts:27-30` (sin token → 401); `shopify-webhook/index.ts:131-148` (sin secreto → `sin_secreto` → 401, y desde v68 con registro).
- **v67 validado en código y en datos**: `dirZona` (`shopify-webhook/index.ts:203-210`) agrega `address2` SOLO al input del resolver de zonas; `customerAddress` para el geocodificador de Shipday sigue sin `address2` (`_shared/shipday.ts:97-100`, el detalle de unidad va a instrucciones vía `detallesDeUnidad`). Los dos consumidores quedan separados como el commit describe.
- **v68 en su lugar**: rechazos HMAC ahora dejan `job_log hmac_rechazado` con motivo (`ok|sin_secreto|sin_cabecera|no_cuadra`), número de pedido si el cuerpo se pudo leer, topic y bytes (`shopify-webhook/index.ts:154-171`) — sin volcar el cuerpo (PII). Cero filas desde el deploy de hoy (la trampa está armada, sin disparos). Estados desconocidos de Shipday: `estadoNormalizado` → `'desconocido'` → NO toca `estado` (solo refresca `estado_raw`/`tracking`), y el rank evita degradar ante webhooks fuera de orden (`shipday-status/index.ts:249-252`, `_shared/status.ts:32-52`).
- **Telemetría v52-v68 fluyendo en prod (últimos 10 días)**: `direccion_shipday_sincronizada` 32 · `espejo_wati_direccion` 31 · `direccion_shipday_no_aplicada` 12 · `pedido_flag` 4 · `envio_gratis_rescatado` 2 · `zona_por_pin_shopify` 1 · `despacho_duplicado_evitado` 1. Los 2 `error` de wati-order son 400 benignos (despacho sin dirección capturada).

### 🔴 P0

**P0-1 · La rama vieja viva + `deploy.ps1` = retroceso total de prod con un comando, y nada lo previene.**
- Evidencia: `/home/user/qsp-ai-agent-wati/deploy.ps1:25-28` — lista default de **8 funciones** (`copilot-webhook, wati-address, contacts-lookup, shopify-webhook, shipday-status, wati-order, reengage-expired, watchdog`) contra `--project-ref jbigmlcalcwiphqeudxd`. Las dos ramas tienen **historias no relacionadas** (merge-base vacío; 76 commits solo en la vieja, 135 solo en la nueva — la nueva nació el 19-ago desde el init vacío) y ambas existen en origin.
- Escenario: alguien en la PC de la oficina hace `git pull` + `.\deploy.ps1` (el hábito documentado durante meses en el CLAUDE.md de esa rama) → copilot v119.1 vuelve a v73, `shopify-webhook` pierde v63-v68 (pin del checkout, provincia, address2, traza HMAC), **resucita `wati-address`** (la captura retirada el 21-ago que duplica atributos y borra pines con `es_correccion`) y pisa `contacts-lookup` v2 con la v1 de 22 líneas (sin `envio_texto`/zona) rompiendo el flujo de WATI que hoy la consume. La protección de rama de GitHub no aplica: `supabase functions deploy` solo necesita el login CLI del usuario.
- Fix de una línea: en la rama vieja, reemplazar `deploy.ps1` por un abort (`Write-Error "Esta rama ya no despliega: prod se publica por CI desde claude/supabase-agent-review-tvvg61"; exit 1`) — y/o archivar la rama y revocar el access token CLI viejo.

### 🟠 P1

**P1-1 · La trampa v68 avisa… a nadie: `hmac_rechazado` no tiene consumidor.**
- Evidencia: `shopify-webhook/index.ts:168` escribe el log, pero el RPC `resumen_diario` en prod cuenta solo `respuesta_respaldo, envio_fallido, audio_stt_fallo, busqueda_mcp_fallo, audios_transcritos, error` (verificado en `pg_get_functiondef`), y el semáforo del watchdog arma 🔴/🟡 solo con esas llaves + `pedido_flag` (`watchdog/index.ts:193-207`).
- Escenario: se rota el secreto en Shopify y no en Supabase → **todo pedido rebota 401**, `job_log` se llena de `hmac_rechazado`… y el correo del día sale 🟢. Es exactamente el modo de falla "pedido 8888" que v68 quiso cazar — ahora visible, pero solo para quien grep-ee `job_log` a mano.
- Fix de una línea: agregar `'hmac_rechazado', count(*) filter (where action='hmac_rechazado')` a `v_inc` del RPC y pintarlo 🔴 en `decidirSemaforo` cuando > 0.

**P1-2 · El único test del puente no corre: importa un helper que nunca se commiteó.**
- Evidencia: `tests/test_shipday_campos.mjs:1` importa `./_unidad.mjs`, que **no existe en ninguna rama** (roto desde su commit de origen `1cf664c`). `node tests/test_shipday_campos.mjs` → `ERR_MODULE_NOT_FOUND`. Ejecutado en esta auditoría con un shim que re-extrae `detallesDeUnidad`/`RE_UNIDAD` reales de `_shared/shipday.ts`: **6/6 OK** — la lógica está sana; el candado no existe. Además el workflow de CI **no corre ningún test** antes de desplegar (la disciplina "golden antes de deploy" de la rama vieja no cruzó a la nueva).
- Fix de una línea: commitear `tests/_unidad.mjs` (extractor estilo golden) + un paso `node tests/test_shipday_campos.mjs` en el workflow antes del deploy.

**P1-3 · El workflow diffea SOLO el último commit del push → deploy parcial silencioso.**
- Evidencia: `.github/workflows/deploy-copilot.yml:65` (`git diff --name-only HEAD^ HEAD`, con `fetch-depth: 2` en :44).
- Escenario: push de 2 commits — el 1º toca `wati-order`, el 2º toca `copilot-webhook` → solo se despliega el copiloto; `wati-order` queda atrás **sin ningún aviso**. Es la misma clase de drift que en ~06-ago costó el `upsertPedido` de wati-order. (No mordió con v67/v68 porque ambos commits tocaron el mismo archivo.)
- Fix de una línea: `CAMBIOS=$(git diff --name-only ${{ github.event.before }} ${{ github.sha }} -- supabase/functions/)` con `fetch-depth: 0`.

### 🟡 P2

**P2-1 · Un pedido `fallido` no puede llegar a `entregado`.** `_shared/status.ts:47-49` da rank 3 a los tres terminales y `shipday-status/index.ts:250` exige `>` estricto. Escenario: entrega falla (ORDER_FAILED → `fallido`), el repartidor reintenta y entrega (ORDER_COMPLETED) → `estado` queda `fallido` para siempre y el copiloto le dice al cliente que su entrega falló teniendo el paquete en la mano (`estado_raw` sí dice COMPLETED). Fix: `entregado: 4` (o permitir explícitamente `fallido→entregado`).

**P2-2 · v67: "sumar texto solo puede ayudar" es empírico, no estructural.** `shopify-webhook/index.ts:203-210`: el resolver rankea por frontera de palabra/longitud; un `address2` que nombre un corredor multi-zona (Transístmica, Domingo Díaz) puede volver `ambiguo` (con opciones mixtas) un pedido que con solo `address1` era `ok propia` → `esFlotaPropia(ambiguo)` exige TODAS propias → deja de despacharse. La medición sobre 29 pedidos históricos lo respalda hoy; no hay guardia estructural. Fix: log de regresión (comparar zona con/sin `address2` en background y registrar cuando difieren), o resolver ambas y despachar si CUALQUIERA da propia.

**P2-3 · `hmac_rechazado` sin muestreo = escritura en `job_log` por POST anónimo.** `shopify-webhook/index.ts:166-171`: cualquier ruido de internet (motivo `sin_cabecera`) inserta una fila. Fix: registrar `sin_cabecera` muestreado (o solo cuando el cuerpo parsea como pedido Shopify); `no_cuadra`/`sin_secreto` sí siempre.

**P2-4 · `wati-order` deriva a un flujo muerto y no `.trim()`ea su token.** `wati-order/index.ts:65` dice "captura la dirección primero (flujo wati-address…)" — retirada el 21-ago (hoy responde 410); el asesor que siga esa instrucción cae en un callejón. Y `:27` lee `WATI_WEBHOOK_TOKEN` sin `.trim()` (lección v40; `shipday-status:223` sí lo hace) — un secreto re-pegado con espacio deja el despacho en 401 silencioso. Fix: actualizar el mensaje a la captura del copiloto (`?captura=1`) y `.trim()` al leer el secreto.

**P2-5 · Las huérfanas activas corren con `_shared` congelado y el CI no puede re-desplegarlas.** Verificado en los bundles: `contacts-lookup` empaqueta un `db.ts` recortado y un `shipday.ts` viejo (sin timeout de Shipday, con la referencia pegada a la dirección); `reengage-expired` empaqueta el `db.ts` pre-F4. Hoy es inofensivo (solo usan `findContactByPhone/logJob/resolverTarifa/reengage*`), pero un cambio de contrato en los RPC/tablas las rompería sin que el workflow pueda tocarlas (regla en `deploy-copilot.yml:66-68`: un cambio de `_shared` redespliega solo las funciones que viven en el repo). Fix: respaldar sus `index.ts` en `docs/legacy/` (como se hizo con wati-address) o re-incorporarlas al repo.

**P2-6 · Workflow, dos filos menores.** (a) Borrar el directorio de una función rompe la corrida: el diff lista sus archivos, el loop intenta `supabase functions deploy <borrada>` y `set -e` aborta dejando el resto sin desplegar (`deploy-copilot.yml:84-90`). (b) `workflow_dispatch` sin input despliega `copilot-webhook` por default (`:23`) aunque no haya cambiado — footgun benigno. (c) Las keys de disparo de los cron viven en texto plano en `cron.job.command` (inherente a pg_cron+net.http_post; visible a quien lea esa tabla) — expuestas en `cron.job`, no las cito.

## 4 · Funciones huérfanas (desplegadas sin fuente en la rama nueva)

24 funciones ACTIVE en prod; 9 viven en el repo nuevo (`copilot-webhook, shopify-webhook, wati-order, shipday-status, watchdog, geo-fallback, ph-loader, ficha-pdf, specs-centinela`). Las otras 15:

| Función | Últ. deploy | Clase | Detalle |
|---|---|---|---|
| `reengage-expired` v49 | 17-jul | **(a)** fuente en rama vieja | `supabase/functions/reengage-expired/index.ts` + `_shared/{db,watiapi,panama}.ts` (marcadores idénticos: `reengage-v1`, DEADLINE 120s, fix `?whatsappNumber=`). **PRODUCTIVA**: cron `reengage-lunes-9am-pa` activo (jobid 4); `reengage_run` corrió el 24-ago. La única fuente está en la rama que P0-1 propone congelar → respaldarla antes |
| `wati-address` v65 | 21-ago | **(b)** retirada, respaldada | En prod es un **stub 410 Gone**; el código original (108 líneas, `es_correccion`) está respaldado en `docs/legacy/wati-address.index.ts` del worktree. ⚠️ La rama vieja conserva la versión VIVA — `deploy.ps1` la resucitaría (parte del P0-1) |
| `contacts-lookup` v60 | 14-ago | **(c) GRAVE** | **PRODUCTIVA** (flujo de WATI; `direccion_lookup` ×5 hasta el 17-ago) y la **v2 desplegada** (SIN_PIN, `envio_texto`, zona/tarifa, ~135 líneas) **no está en ningún repo**: la rama vieja solo tiene la v1 de 22 líneas (solo nombre+dirección). Bundle con `_shared` recortado a mano (deploy por MCP). Código rescatado en esta auditoría (`scratchpad/prod-download/`) |
| `cotizador` v32 | 07-ago | **(c) GRAVE** | **PRODUCTIVA**: cotizador de envíos de la página oculta de la tienda (CORS a quickservicepanama.com, clave en `store_facts.cotizador_key`); `cotizador_consulta` ×24 hasta el 17-ago. Sin fuente en ningún repo — el README de legacy la documenta pero no respalda el código. Rescatada en esta auditoría |
| `wati-classify` v35 | 19-ago | **(c)** leve | Clasificador de direcciones (LLM claude-sonnet-4-6 extrae; `resolver_tarifa_v2` decide; corregimiento solo de respaldo). Token-gated, solo lectura, no escribe nada. **El copiloto v119.1 NO la llama** (grep en el worktree: 0 usos; solo la menciona `docs/legacy/README.md:24`), sin cron, **0 invocaciones en las últimas 24 h** — su único caller conocido es `wati-verify` (arnés de validación). Sin fuente en git |
| `wati-mirror` v34 | 12-ago | **(c)** leve | Espejo manual EN LOTE libreta→atributos WATI (token-gated, throttle 45 ms). Herramienta operativa sin fuente en git; de aquí salió el formato `envio_resumen` que el copiloto adoptó |
| `wati-verify` v45 | 12-ago | **(b)** sonda | Arnés de validación del clasificador (llama a `wati-classify` con muestras de la libreta y mide alucinación). Token-gated |
| `wati-attr-audit` v30 | 11-ago | **(b)** por README | Auditoría de atributos WATI (no descargada; clasificada por `docs/legacy/README.md`) |
| `tookan-probe` v33 | 10-ago | **(b)** migración cumplida | Sonda solo-lectura de coordenadas Tookan (token-gated, solo agregados). Candidata a retirar |
| `tookan-backfill` v30 | 10-ago | **(b)** migración cumplida | Backfill de pines Tookan→libreta (token-gated, dry-run, reversible). Candidata a retirar |
| `geo-loader` v33 | 10-ago | **(b)** migración cumplida | Cargador de polígonos COD-AB (OCHA/ITOS) a `limites_admin` (token-gated). Candidata a retirar |
| `shipday-probe` v31 | 10-ago | **(b)** sonda | Descubrimiento de la forma del GET /orders de Shipday (token-gated, solo nombres de campos). Candidata a retirar |
| `ph-probe` v5 | 19-ago | **(b)** stub 410 | Retirada ("ver ph-loader"); inerte |
| `code-host` v5 | 20-ago | **(b)** stub 410 | Puente de despliegue fallido, retirado; conserva un `?purge=` con clave embebida (expuesta en el fuente desplegado de code-host) que solo borra su propio bucket de prueba |
| `bridge-test` v3 | 19-ago | **(b)** stub 410 | Prueba del puente de despliegue; inerte |

Actividad real (edge logs, últimas 24 h): copilot 2035 · shipday-status 58 · watchdog 17 · shopify-webhook 9 · geo-fallback 5 · wati-order 1 · **todas las huérfanas: 0** (coherente: el cron de reengage es lunes y cotizador/lookup se usan esporádicamente).

`docs/legacy/README.md` (21-ago) es el mapa correcto de esto pero quedó desactualizado: dice "22 funciones / 8 en el repo" (hoy 24 / 9 + `_shared`), no lista `ficha-pdf`/`specs-centinela` como del repo y no menciona `ph-probe`/`code-host`/`bridge-test`.

## 5 · Workflow `.github/workflows/deploy-copilot.yml`

- **Qué despliega**: en push, las funciones cuyo directorio cambió; si cambia `_shared/**`, TODAS las del repo (9). En `workflow_dispatch`, la del input (default `copilot-webhook`). Siempre `--no-verify-jwt` (correcto: son webhooks con guard propio) contra `PROJECT_REF: jbigmlcalcwiphqeudxd`.
- **Trigger**: push a **`claude/supabase-agent-review-tvvg61` únicamente**, paths `supabase/functions/**` + el propio workflow. Concurrency serializada. Sin secreto configurado → warning y no despliega (fail-safe).
- **¿Push accidental pisa prod?** Dentro de esa rama, sí — cualquier push que toque `supabase/functions/**` despliega directo, sin tests ni aprobación (P1-2/P1-3). Desde otras ramas, el workflow no dispara… pero el camino paralelo real es `deploy.ps1` en la rama vieja (P0-1), que ignora por completo a GitHub.
- **Cobertura**: cubre el puente completo del repo (shopify-webhook, shipday-status, wati-order) además del copiloto y satélites del repo. NO cubre (ni puede) las huérfanas: `reengage-expired`, `contacts-lookup`, `cotizador`, `wati-*` quedan congeladas fuera del CI (P2-5).

## 6 · Test `tests/test_shipday_campos.mjs`

- Tal como está commiteado: **NO CORRE** — `ERR_MODULE_NOT_FOUND: tests/_unidad.mjs` (el helper nunca se versionó; tampoco existe en la rama vieja). Hallazgo P1-2.
- Ejecutado con shim de auditoría (extrae `detallesDeUnidad` real de `_shared/shipday.ts`, sin tocar el worktree): **6/6 OK** (`#8871 Shopify` → "Oficina 46 · 3er Piso", casa/apto/sin-unidad/vacío/nulo correctos). La lógica que separa dirección (geocodificador) de instrucciones (repartidor) se comporta como se diseñó.

## 7 · Qué NO pude verificar y por qué

1. **Byte-exactitud prod↔rama-vieja de `reengage-expired`**: verificada por marcadores fuertes (versión, deadline, fix del endpoint de plantilla, fecha de deploy 17-jul) — no hice el diff completo del bundle contra la rama vieja.
2. **`wati-attr-audit`**: no descargada; clasificada por el README de legacy y por el patrón de su familia (todas las `wati-*` descargadas resultaron token-gated).
3. **El lado WATI**: qué flujos/automations de WATI llaman hoy a `contacts-lookup` (y si algo llama a `wati-classify`) vive en la configuración de WATI, fuera del alcance Supabase de este frente; me quedé con la evidencia de `job_log` (lookups reales hasta el 17-ago) y edge logs (0 en 24 h).
4. **El pedido 8888 (26-ago)**: la traza v68 se desplegó hoy 13:42 UTC; no hay filas `hmac_rechazado` desde entonces, y el rechazo original (si lo fue) no dejó huella por diseño del código anterior. La causa sigue sin demostrarse — la trampa está armada.
5. **Equivalencia semántica completa del RPC `estado_pedido`** contra la migración v48: confirmé que existe, es security definer y deduplica por `pedido_ref` (fragmento de `pg_get_functiondef`); no comparé el cuerpo completo línea a línea.
6. **Secretos**: ninguno se cita en este reporte. Los observados expuestos: keys de disparo en `cron.job.command` (inherente a pg_cron) y la clave de purga embebida en el fuente de `code-host` (solo borra su bucket de prueba).
