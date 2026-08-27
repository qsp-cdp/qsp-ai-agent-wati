# Frente C — Seguridad del sistema y estado de las pruebas (auditoría v119, 2026-08-27)

## 1. Veredicto en 3 líneas

El P0-1 está **completo en prod** (ninguna RPC propia ejecutable por PUBLIC/anon) y las 9 funciones del worktree están guardadas fail-closed, con las allowlists y el enmascarado histórico conservados. Los dos problemas grandes son **nuevos hábitos, no huecos puntuales**: 4 funciones llevan su llave de guard **hardcodeada en git**, y prod corre **24 Edge Functions de las que el repo nuevo solo versiona 9** (deriva estructural, la lección v52/v65 a escala). La red de regresión pasó de **667 golden + 29 node a UNA prueba que ni siquiera corre** (importa un archivo que nunca se commiteó), y la CI **despliega sin ejecutar prueba alguna**; el golden viejo es re-adoptable: con ~5 parches de harness ya pasan **629/667** contra el index v119.1.

---

## 2. Hallazgos de seguridad

### P1

**P1-a — Llaves de guard hardcodeadas en el código fuente (en git).**
- Evidencia: `supabase/functions/ficha-pdf/index.ts:18` (largo 17) · `geo-fallback/index.ts:14` (largo 16) · `ph-loader/index.ts:11` (largo 19) · `specs-centinela/index.ts:31` (largo 18). En prod además `code-host` (solo desplegada, largo 20). El cron 15 (`specs-centinela-lunes`) usa esa misma llave hardcodeada (largo 18 en `cron.job`).
- Escenario: cualquiera con acceso al repo (colaborador, fuga del repo, historial si se hace público) puede **escribir en `fichas_pdf` y `ph_directorio`** (envenenar la base de conocimiento: el bot citaría specs falsas "del folleto oficial" y resolvería zonas de entrega con un diccionario adulterado) y **quemar la cuota de Google Maps** de geo-fallback (hasta `GEO_MAX_24H`/día).
- Fix de una línea: mover las 4 llaves a secrets (`Deno.env.get(...)` fail-closed, patrón del watchdog `index.ts:30,561`) y rotarlas; borrar `code-host`.

**P1-b — 15 funciones ACTIVE en prod fuera del repo (deriva repo↔prod estructural).**
- Evidencia: `list_edge_functions` devuelve 24; el worktree versiona 9 (las desplegadas por GitHub Actions). Fuera del repo y vivas: `contacts-lookup`, `wati-address` (v65, la sigue usando el flujo de captura), `reengage-expired` (la dispara el cron 4), `cotizador`, `wati-mirror`, `wati-verify`, `wati-classify`, `wati-attr-audit`, `tookan-probe`, `tookan-backfill`, `shipday-probe`, `geo-loader`, `ph-probe`, `code-host`, `bridge-test`.
- Escenario doble: (a) ese código público (todas con `verify_jwt=false`) no está auditado ni versionado — muestreé 4: `cotizador` y `wati-mirror` están bien guardadas (llave en data rotable / token en env, fail-closed), `code-host` y `bridge-test` son cascarones 410 retirados; quedan ~10 sin leer; (b) un deploy "limpio" desde la rama nueva que retire lo que no está en el repo **rompería el re-enganche de los lunes y la captura de direcciones** sin que ningún test lo note.
- Fix de una línea: decidir función por función — versionarla en el repo o retirarla formalmente (borrar los cascarones y probes ya).

### P2

**P2-a — `anon`/`authenticated` tienen TRUNCATE (además de REFERENCES/TRIGGER) en las ~15 tablas del negocio.**
- Evidencia: `information_schema.role_table_grants` — `messages`, `conversations`, `contacts`, `pedidos`, `handoffs`, `job_log`, `store_facts`, `ref_codes`, `zonas_entrega`, `sectores_entrega`, `lugares_interior`, `limites_admin`, `ph_directorio`, `geocache`, `_stri_staging` con `TRUNCATE` para ambos roles.
- Escenario: RLS **no cubre TRUNCATE**. Hoy PostgREST no expone un verbo de truncate, así que no hay ruta directa con la anon key — es una mina latente: cualquier RPC futura SECURITY INVOKER que trunque, o un cambio de superficie, la activa vaciando `messages`/`contacts` completas.
- Fix de una línea: `revoke truncate, references, trigger on all tables in schema public from anon, authenticated;`

**P2-b — `spatial_ref_sys` sin RLS y ESCRIBIBLE por anon vía la Data API.**
- Evidencia: advisor `rls_disabled_in_public` (ERROR) + grants INSERT/UPDATE/DELETE a `anon`/`authenticated` en `spatial_ref_sys` (y en las vistas `geometry_columns`/`geography_columns`). El texto del advisor confirma que el schema `public` está expuesto a PostgREST.
- Escenario: con la anon key (pública por diseño en Supabase) se pueden corromper los SRID; `zona_por_coordenadas`/`resolver_ubicacion` dependen de PostGIS → tarifas y zonas mal resueltas de forma silenciosa (integridad, no confidencialidad).
- Fix de una línea: `revoke insert, update, delete on public.spatial_ref_sys from anon, authenticated;` (mover PostGIS de schema no es práctico).

**P2-c — Fail-open latente del copiloto: el default muerto de la webhook key sigue en el código.**
- Evidencia: `copilot-webhook/index.ts:425` — si `COPILOT_WEBHOOK_KEY` faltara (rotación fallida, restore de proyecto), la función cae a un default hardcodeado (largo 22) **publicado en el repo** desde 2026; el healthcheck delata ese estado (`webhook_key_es_default`) pero nadie lo mira solo. El CLAUDE.md histórico ya pedía retirarlo ("retirarlo del código en una versión futura para fail-closed").
- Escenario: el POST completo (incluidas las rutas `diag=` que leen WATI y `diag=no_es_cliente&seco=0` que ESCRIBE estado) quedaría abierto con una llave conocida.
- Fix de una línea: `const WEBHOOK_KEY = (Deno.env.get(...) ?? "").trim();` y responder 500 si está vacía (patrón watchdog).

**P2-d — `RESOLVE_SECRET` ahora también se acepta por query param.**
- Evidencia: `copilot-webhook/index.ts:3672` (`?key=` además del `Authorization: Bearer` histórico; el comentario lo justifica como "cómodo para probar en el navegador").
- Escenario: el secreto del puente CDP queda en historiales de navegador y logs de acceso intermedios cada vez que alguien lo "prueba cómodo".
- Fix de una línea: retirar la rama de query param (o aceptarla solo con `COPILOT_DIAG_KEY`).

**P2-e — La regla de prompt del DÍA DE LA SEMANA (v52) no existe en el prompt v119.**
- Evidencia: cero coincidencias de la regla ("no confirmar un día sin consultar `info_tienda`", caso real del sábado) en `copilot-webhook/index.ts`; el golden viejo la lockeaba y falla. Mitigante: el `NEEDS_TOOL_RE` v119 sigue forzando tool ante día+verbo de visita (esos casos del golden pasan), así que el riesgo es de calidad, no de silencio total.
- Fix de una línea: reponer la regla en el SYSTEM_PROMPT (o documentar que se retiró a propósito).

### P3 (notas)

- `ficha-pdf` descarga sin tope de bytes (`res.arrayBuffer()`, `index.ts:71`): un PDF gigante de un dominio permitido tumba la ejecución por memoria (DoS menor, requiere llave). El copiloto usa tope 4.5MB para folletos; igualarlo.
- Healthchecks GET sin llave (copiloto `index.ts:3729`, watchdog `index.ts:551`) exponen versión/modo/umbral/config booleana — patrón histórico aceptado, sin secretos ni PII; útil para reconocimiento de un atacante, tolerado por diseño.
- Advisors WARN: `function_search_path_mutable` en `normalizar_nombre_lugar`, `norm_lugar`, `normalizar_provincia`; extensiones `pg_net` y `postgis` en `public`. Funciones invoker con EXECUTE a PUBLIC: `es_ack`, `norm_lugar`, `resolver_ubicacion`, `normalizar_nombre_lugar`, `normalizar_provincia` (puras o bloqueadas por falta de SELECT del invocador; `contacts_enriquecer_ubicacion` es `returns trigger`, no invocable por REST). Riesgo bajo; revocables por prolijidad.
- `_stri_staging` (35 filas de límites administrativos, sin PII) sin RLS — habilitarla por higiene.

### Lo que se CONSERVÓ bien (verificado en el worktree)

- Allowlist `*.wati.io` en los 3 caminos de media (imagen/audio/PDF) con telemetría `media_host_rechazado` (`index.ts:3167,3237,3268`); folletos solo `cdn.shopify.com` (`:1489`); ficha-pdf con allowlist explícita de fabricantes + anti-SSRF comentado; Shipday host fijo `api.shipday.com`; geocoding con key en header a host fijo de Google.
- Enmascarado de secretos en errores: OpenAI (`:3212` — key + patrón `sk-*`), Resend en copiloto (`:3530`) y en `_shared/resend.ts:27`.
- `evento_sin_texto` sin payload (solo llaves/tipo/URL, `:4184-4192`), `lead_capturado` con email→dominio (`:3034`), rechazo HMAC de Shopify registra order/topic/bytes y explícitamente NO el cuerpo ("trae datos del cliente", `shopify-webhook/index.ts:163-170`). Tope de payload 256KB header+body (`:3891,3896`).
- Guards fail-closed: watchdog (`:561`), shipday-status (`:225`, v65 conservado), wati-order (`:28`), shopify-webhook HMAC constante-en-tiempo con motivo (`:131-148`), `?ref_code=` fail-closed sin `RESOLVE_SECRET` (`:3672-3673`).
- Correos: texto del cliente escapado en el resumen (watchdog `escapar`) y en el aviso de desatención del copiloto (`esc`, `:3551`); el aviso de facturación manda solo teléfono+minutos (no el RUC/texto). El resumen sí lleva teléfono+nombre+último mensaje — decisión de diseño documentada (v69.1/v72), PII que viaja a Resend: riesgo aceptado, vigilar `ALERTA_EMAILS`.

---

## 3. Estado del P0-1 en prod: **COMPLETO**

`pg_proc` (schema `public`): 769 funciones, 17 SECURITY DEFINER propias — **todas** con ACL `{postgres=X, service_role=X}`, ninguna con entrada PUBLIC (`=X`) ni `anon`:

| RPC SECURITY DEFINER | ACL |
|---|---|
| asistencia_pendientes(5 args) | postgres, service_role |
| backfill_pines | postgres, service_role |
| cargar_limites_admin / cargar_limites_cod | postgres, service_role |
| contactos_posibles_proveedores *(nueva, 25-ago)* | postgres, service_role |
| estado_pedido | postgres, service_role |
| geocache_llamadas_hoy / promover_geocache_al_diccionario *(nuevas, 20-ago)* | postgres, service_role |
| reengage_candidates | postgres, service_role |
| resolver_tarifa / _core / _v1_backup / _v2 | postgres, service_role |
| resumen_diario | postgres, service_role |
| ubicacion_por_coordenadas / zona_por_coordenadas *(nuevas, ago)* | postgres, service_role |
| upsert_conversation | postgres, service_role |

Las RPC creadas DESPUÉS del P0-1 (geocache, coordenadas, proveedores, specs) **nacieron ya revocadas** — el hábito quedó. El linter de Supabase (`get_advisors` security) solo marca como SECDEF ejecutable por anon a `st_estimatedextent` (función C de PostGIS, inocua). RLS: 18 tablas con RLS habilitado y **cero policies** (= solo service_role, el modelo histórico); sin RLS solo `spatial_ref_sys` (PostGIS) y `_stri_staging` (ver P2-b y P3).

## 4. Crons vivos (cron.job)

| jobid | jobname | schedule | destino | key |
|---|---|---|---|---|
| 4 | reengage-lunes-9am-pa | `0 14 * * 1` | /reengage-expired | env, largo 64 |
| 5 | watchdog-30min-habil-pa | `*/30 14-21 * * 1-5` | /watchdog | largo 23 (md5 …5a9a) |
| 12 | asistencia-sweep-20min | `*/20 14-21 * * 1-5` | /copilot-webhook?sweep=1 | env, largo 30 |
| 13 | watchdog-resumen-3x-pa | `0 16,21 * * 1-5` | /watchdog?resumen=1 | misma que 5 ✓ |
| 14 | watchdog-resumen-230-pa | `30 19 * * 1-5` | /watchdog?resumen=1 | misma que 5 ✓ |
| 15 | specs-centinela-lunes | `0 13 * * 1` | /specs-centinela | **la hardcodeada del repo** (largo 18) |

Todos activos; sin duplicados ni llaves desincronizadas entre jobs de la misma función (los 3 de watchdog comparten llave). Ningún cron huérfano hoy, PERO el 4 apunta a `reengage-expired`, que ya no está versionada en la rama nueva (ver P1-b).

## 5. Estado de las pruebas

**Lo que se perdió.** La rama nueva es **huérfana** (primer commit "chore: initialize repository"; 135 commits propios): nunca heredó `tests/golden.mjs` (667 casos, hoy verde 667/667 contra su propio árbol v73.1) ni `test/*.test.js` (7 archivos, 29 pruebas del puente — en este entorno no corren por `node_modules` ausente, cifra histórica). También quedó atrás `deploy.ps1` con su disciplina de "golden antes de cada deploy".

**Lo que hay.** UNA prueba: `tests/test_shipday_campos.mjs` (6 casos de `detallesDeUnidad`). **No corre**: importa `tests/_unidad.mjs`, que **nunca se commiteó** (el commit 1cf664c agregó solo el test). Nació rota — nadie la ejecutó jamás desde un checkout limpio.

**CI.** `.github/workflows/deploy-copilot.yml` despliega a prod en **cada push** que toque `supabase/functions/**` (checkout → guard del token → decidir funciones → CLI → deploy → curl de versión). **Cero pruebas en el pipeline**: despliega a ciegas.

**¿Es re-adoptable el golden viejo? SÍ, y barato.** Lo porté contra el árbol v119.1 en un directorio temporal (sin tocar ninguno de los dos árboles): tal cual **aborta** en la extracción (el strip de tipos no aguanta el TS del v119: `const x: string[] =`, casts `as any`) y en dos `readFileSync` (falta `wati-address/index.ts` y la migración `es_ack` vieja). Con **5 parches de harness** (2 regex de strip, blindaje try/catch de funciones extraídas, optional chaining en accesos, redirigir el lock de acks a la migración nueva): **629 OK / 38 FALLAS de 667**. Clasificación de las 38:
- ~14 **locks obsoletos por decisión deliberada de la rama nueva**: la asistencia ahora SÍ incluye `tarifa_entrega`, `guardar_datos_envio` y `consultar_folleto` (v74/v105 — captura de entrega); el guardrail fiscal (RUC/pagos) **sigue prohibido** en el `ASSIST_SUFFIX` nuevo, verificado. Exactamente el tipo de cambio de guardrail que el golden habría frenado para revisión consciente.
- ~12 **fallas de harness** (funciones extraídas que ya no son autónomas: `calcularCotizacion` v96, `tipoPedido`; renombres internos como media_url/ráfaga/healthcheck) — piden actualizar el extractor, no señalan bugs.
- ~9 **reglas de prompt movidas o reescritas**: "vista PARCIAL de pedidos" vive ahora en la descripción de la tool (`:868`, no en el SYSTEM_PROMPT); "tenemos el punto/sucursal", v58 interior, etc. requieren revisar fraseo por fraseo.
- 1 **regresión real de prompt**: la regla del día de la semana (P2-e). Y 2 locks de `es_ack` que apuntaban a la migración vieja — verifiqué aparte que el **vocabulario SQL↔TS está sincronizado palabra por palabra** en la rama nueva (el riesgo v72.4 no renació).
- 1 pérdida de cobertura sin reemplazo: los locks de `wati-address` (el código vive solo en prod).

**Costo estimado de re-adopción**: los 5 parches ya existen (los apliqué en `/…/scratchpad/golden-port/tests/golden.mjs`); revisar las 38 fallas una a una y decidir lock-por-lock (actualizar vs reponer regla) es ~medio día; cablear `node tests/golden.mjs` como paso previo al deploy en el workflow es 1 step de 4 líneas. Los 29 node tests del puente requieren re-apuntar imports de `src/*.js` a `_shared/*.ts` (el servicio Node ya no existe): esfuerzo mayor, priorizar los de `shipday`/`watchdog` cuya lógica sí vive en `_shared`.

## 6. Qué NO pude verificar y por qué

1. **La configuración de la Data API** (qué schemas expone PostgREST) no es legible por SQL; el advisor implica que `public` está expuesto, y en eso baso P2-b. Confirmarlo en el dashboard (Settings → API).
2. **~10 de las 15 funciones fuera del repo** (`wati-address`, `reengage-expired`, `contacts-lookup`, `wati-verify`, `wati-classify`, `wati-attr-audit`, probes, `geo-loader`, `tookan-backfill`): muestreé 4 (`code-host`, `bridge-test`, `cotizador`, `wati-mirror` — sin hallazgos graves); el resto queda sin leer por presupuesto. Son código público sin versionar: leerlas es parte del fix P1-b.
3. **El verde actual de los 29 node tests** de la rama vieja: en este entorno fallan al cargar módulos (sin `npm install`); la cifra es la documentada.
4. **Los secretos configurados en Supabase** (valores/presencia de `COPILOT_WEBHOOK_KEY`, `WATCHDOG_KEY`, etc.): no existe lectura de secrets (correcto que así sea); me apoyé en healthchecks del código y en las llaves embebidas en `cron.job` (longitud/hash, sin citarlas).
5. **Advisors de performance**: no corridos (fuera del alcance de seguridad del frente).
6. **PII en filas reales de `job_log`**: por regla del encargo solo consulté catálogos y estructura; la revisión de PII se hizo sobre QUÉ escribe el código, no sobre lo escrito históricamente (un `delete` de filas viejas con texto pre-v45 queda fuera de mi alcance de solo-lectura).
