# CLAUDE.md — Copiloto AI de WhatsApp (WATI) · Quick Service Panamá

> Contexto base para Claude Code trabajando en ESTE repo. Lee esto primero.
> Generado 2026-06-15; actualizado 2026-06-16 al estado real (edge function v13 +
> esquema del proyecto Supabase). Docs de diseño originales en el repo
> `qsp-cdp/qsp-cdp-docs` (`docs/design/2026-06-12-proyecto-copilot-wati.md` y
> `docs/design/2026-06-13-copilot-analisis-sombra-prompt-v2.md`).

## Qué es
Copiloto de IA dentro de **WATI** (WhatsApp, ~90% de las ventas de QSP). Apoya al
equipo humano: contesta preguntas generales, indica disponibilidad/stock y da precio
con certeza, y calla/deriva cuando es mejor que responda un humano. Tienda:
**quickservicepanama.com** (suministros de impresión y tecnología en Panamá).

## Estado actual (2026-06-16)
- **EN VIVO: `copilot-webhook` v13 (`v13-contexto-piloto`), ACTIVE.** Desplegado el
  2026-06-16 con `verify_jwt=false`. Healthcheck (GET, sin key) reporta
  `version/mode/model/llm_configured/wati_send_configured/live_targets`.
- **MODO: piloto live por allowlist.** Por defecto sigue en **sombra** (registra lo
  que respondería, NO envía). En `live`, SOLO se envía a los `wa_id` de
  `COPILOT_LIVE_ALLOWLIST` (vacío = nadie; `all`/`*` = todos). Encender live es
  deliberado y arranca número por número.
- **Smoke test (2026-06-16): 7/7 OK** con un número propio en el allowlist —
  **primer envío real por WATI verificado**. Casos: saludo a conocido, categoría
  Epson (aterrizada, sin inventar), tinta G2170→GI-11, envíos/Yappy vía `info_tienda`
  (sin números de cuenta), abstención por RUC, handoff. **Pendiente:** validar
  coexistencia con asesor humano real (anti-interrupción 45 min + contexto) antes de
  ampliar el allowlist.
- `store_facts` **aplicada** con los **17 datos reales** de QSP (envío, pagos,
  ubicación, horario, devoluciones, contacto). Secretos WATI configurados
  (`wati_send_configured:true`).
- Tráfico histórico de sombra: ~**102 conversaciones / 865 mensajes**. Verificado:
  **Claude Haiku 4.5**, ~**$0.003/turno**, ~**4 s** de latencia.

## Arquitectura
```
WATI (WhatsApp) ──webhook POST?key=──► Supabase Edge Function `copilot-webhook`
                                          │  (Deno/TS, verify_jwt=false)
                                          ├─► Anthropic Messages API (Haiku 4.5) + tool use
                                          │      ├─ tool buscar_producto → Shopify search/suggest.json
                                          │      └─ tool info_tienda     → Postgres store_facts
                                          ├─► Postgres (conversations/messages/handoffs/job_log)
                                          └─► WATI sendSessionMessage (solo si liveAllowed:
                                                 MODE=live Y wa_id en allowlist) ◄─ ventana 24h
```
- **Proyecto Supabase:** `jbigmlcalcwiphqeudxd` (**qsp-wati-copilot**). Es
  **SEPARADO** del CDP `tuyheailysudfxiuppmg` (qsp-data-hub) — decisión de
  aislamiento. Comparten la **llave natural `wa_id`** (teléfono) para poder
  cruzar con el CDP más adelante.
- **Deps:** `npm:@anthropic-ai/sdk@0.39.0`, `npm:@supabase/supabase-js@2.45.4`.
- Código canónico: `supabase/functions/copilot-webhook/index.ts` (en este repo) =
  lo desplegado. Para verificar lo que está EN VIVO:
  `mcp__Supabase__get_edge_function(project_id=jbigmlcalcwiphqeudxd, slug=copilot-webhook)`,
  o el healthcheck GET `https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook`.

## Modelo de datos (schema `public`, RLS on, solo service_role)
- **conversations** — `id`, `wa_id` (unique, = teléfono), `sender_name`,
  `status` (`bot`/`handoff`/`cerrada`), `turns_today`/`turns_date` (tope
  anti-costos), `last_message_at`, `confirmed_new` (bool — del evento newContact),
  `first_contact_at`.
- **messages** — `conversation_id` FK, `role` (user/assistant/tool/system),
  `content`, `tool_calls` jsonb, `mode` (**shadow**/live), `model`, `tokens_in/out`,
  `latency_ms`, `wati_message_id` (dedup de webhooks reintentados, índice único).
  Nota v13: los mensajes de un asesor humano se guardan con `role='assistant'` y
  `model='human-agent'` (contexto para el agente).
- **handoffs** — `conversation_id`, `motivo`, `resuelto`.
- **job_log** — `function_name`, `action`, `ok`, `detail` jsonb (telemetría;
  "nunca romper"). Acciones clave: `mensaje_humano`, `abstencion_humano_reciente`,
  `abstencion_interrupcion`, `contacto_nuevo`, `tope_turnos`, `error`.
- **store_facts** (Fase 1.5) — `key`/`value` (vacío = no disponible). Espejo
  (snapshot) del metaobjeto Shopify `store_facts/datos-tienda` (canónico, 17 campos:
  envío, pagos, ubicación, horario, devoluciones, contacto). Fuente única de `info_tienda`.
- **RPC `upsert_conversation(p_wa_id, p_sender_name)`** — upsert atómico por
  `wa_id` + incremento del contador diario de turnos. `security definer`, solo
  `service_role`.

Migraciones (ver `supabase/migrations/`):
`copilot_schema_inicial`, `rpc_upsert_conversation`, `fix_grant_service_role`,
`grants_service_role_tablas`, `conversations_confirmed_new`,
`store_facts` (Fase 1.5 — **aplicada**, 17 datos reales).

## Flujo del webhook (resumen de index.ts)
1. **GET** = healthcheck (status/version/mode/model/live_targets).
2. **POST**: valida `?key=` (guard, porque `verify_jwt=false`) → parse JSON.
3. Si `eventType` incluye `newcontact` (evento WATI `newContactMessageReceived`,
   sin texto): marca `confirmed_new=true` + `first_contact_at`, loggea y retorna.
4. Filtra: sin `waId`/sin texto/`type!=text` → skip. **`owner=true` (mensaje del
   negocio, v13):** si coincide con un envío propio reciente del bot (<5 min, mismo
   texto) → se ignora (**anti-eco**); si es un asesor humano real → se guarda en el
   hilo (`model='human-agent'`) y se registra `mensaje_humano` en job_log
   (anti-interrupción). Retorna.
5. `upsert_conversation` → inserta msg de usuario (dedup por `wati_message_id`).
6. Cortes: si `status=handoff` → skip; si `turns_today>40` → skip. **Anti-interrupción
   (v9):** si un humano atendió hace <45 min (job_log `mensaje_humano`) o el texto
   matchea `INTERRUPT_RE` (RUC/cédula/razón social/pago/comprobante/mensajero…) →
   ABSTENERSE (no llama al LLM). Si matchea `HANDOFF_RE` (humano|asesor|reclamo|…) → handoff.
7. Trae historial (últimos 10 user/assistant; los de asesor van etiquetados
   `[Asesor del equipo]:`) → `responderLLM` (Haiku + loop de tool use, máx 4 iter).
   **Forzado de tool (v12):** si el texto matchea `NEEDS_TOOL_RE` (catálogo/tienda) se
   fuerza `tool_choice:"any"` en la 1ª iteración → grounding garantizado.
8. Inserta respuesta del assistant con `mode` shadow|live. Envía por WATI **solo si
   `liveAllowed(waId)`** (MODE=live Y el número en el allowlist); si no, queda en sombra.

## System prompt (íntegro — es el corazón del comportamiento)
Reglas clave (texto completo en `index.ts`, const `SYSTEM_PROMPT`):
- **MISIÓN (v10):** apoyar al equipo humano; responder con certeza lo que se pueda y
  callar/derivar ante la duda o si puede comprometer a la empresa. Mejor no responder
  que responder mal.
- **ESTILO:** mensajes cortos (1-3 oraciones), tono panameño, **negrita con UN
  solo asterisco** `*así*` (NUNCA `**` — en WhatsApp se ve literal), sin Markdown.
- **REGLA DE ORO (v11/v12):** precio/stock/promos SOLO vía `buscar_producto` EN EL
  MISMO TURNO; nunca inventar ni nombrar modelos sin haber buscado. Reforzada en
  código con forzado de tool (`NEEDS_TOOL_RE` → `tool_choice:"any"`).
- **BÚSQUEDA (v10):** términos concisos (marca+modelo; el modelo es la señal más fuerte);
  sinónimos/línea (Pixma↔Canon…); reformular si no encuentra; preguntas de categoría con
  1-2 ejemplos; NO afirmar compatibilidad sin evidencia del catálogo.
- **CONTACTO NUEVO vs CONOCIDO:** bienvenida+presentación una sola vez al nuevo;
  al conocido ir al grano.
- **REGLA ANTI-INTERRUPCIÓN:** si un humano está atendiendo (datos de trámite,
  pago en curso, comprobante, etc.) → ABSTENERSE y derivar. Ante la duda, NO
  interrumpir. Acks sueltos ("ok","gracias") no requieren respuesta.
- **LOGÍSTICA/PAGOS (v11):** vía tool `info_tienda` (single source = `store_facts`);
  no inventar montos/horarios ni compartir números de cuenta; si falta el dato, derivar.
- **HANDOFF** y **LÍMITES** (no legal/médico, nada fuera de la tienda).

## Tools
- **`buscar_producto(consulta)`** — `GET ${STORE}/search/suggest.json?q=...`
  (`STORE=https://www.quickservicepanama.com`). Devuelve `{titulo, precio_usd,
  disponible, marca, tipo, url}` (máx 5). v10: si la consulta libre no encuentra,
  reintenta por número/código de modelo (G2170, 954…); el prompt maneja sinónimos/línea
  (Pixma↔Canon, EcoTank↔Epson) y preguntas de categoría, y el LLM puede reformular.
- **`info_tienda(tema?)`** (Fase 1.5, desplegada) — lee `store_facts` y devuelve TODOS
  los pares `key→value` con valor (omite vacíos); si no hay datos, el bot deriva a un asesor.

## Variables de entorno / secretos (en Supabase Edge Function secrets — NO en el repo)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WATI_API_TOKEN`,
`WATI_API_BASE`, `COPILOT_MODE` (shadow|live, default **shadow**),
`COPILOT_LIVE_ALLOWLIST` (piloto: `wa_id` permitidos en live; vacío = nadie, `all`/`*` =
todos), `COPILOT_MODEL` (default `claude-haiku-4-5`), `COPILOT_WEBHOOK_KEY` (guard del `?key=`).

## Guardrails (NO romper)
- **MODO SOMBRA por defecto.** No enviar a clientes hasta encender `COPILOT_MODE=live`
  a propósito. **Piloto gradual:** aun en live, `COPILOT_LIVE_ALLOWLIST` limita el
  envío (vacío = nadie). Cualquier cambio que pueda mandar mensajes reales = avisar antes.
- **Anti-interrupción es sagrada:** mejor no contestar que cortar una venta humana.
  Reforzada en v9 con guardrail PRE-LLM en código (`INTERRUPT_RE` + humano reciente vía
  job_log) que ABSTIENE al bot ante trámites/pagos/datos fiscales. El bot NUNCA captura ni
  repite RUC/datos de factura/pago.
- **Anti-eco (v13):** un `owner=true` que sea el eco de un envío propio del bot NO se
  trata como humano (evita que el bot se auto-abstenga en live).
- **Auto-expose OFF** en este proyecto → toda tabla nueva necesita `GRANT` manual a
  `service_role` (si no, la función da `permission denied`).
- **RLS on sin policies** = solo `service_role`. El `?key=` es obligatorio.
- Dedup por `wati_message_id`; tope `MAX_TURNS_DIA=40`.
- Deploy con `verify_jwt=false` (es un webhook público guardado por `?key=`).

## Despliegue
`mcp__Supabase__deploy_edge_function(project_id=jbigmlcalcwiphqeudxd, ...)` con
`verify_jwt:false`, o `supabase functions deploy copilot-webhook --no-verify-jwt`.
(Nota: el MCP de Supabase puede estar gated por aprobación en esta sesión; ruta
alterna usada: copiar el `index.ts` desde el raw de GitHub → editor del dashboard →
Verify JWT OFF → deploy → verificar healthcheck.)
El webhook de WATI apunta a:
`https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<COPILOT_WEBHOOK_KEY>`.

## Roadmap (próximas fases)
1. **Fase 1.5 — `info_tienda`: ✅ desplegada (v8→v13) y `store_facts` aplicada** con los
   17 datos reales. Opción futura: re-apuntar la fuente a un metaobjeto/páginas de
   Shopify para unificar con el "single source of truth" del proyecto SEO (qsp-cdp-docs).
2. **Recall de productos (#2):** ante combo agotado, ofrecer variantes/tintas
   individuales en stock en vez de derivar (detectado en el smoke test del 2026-06-16).
3. **Atención diferenciada a contacto nuevo** (bienvenida proactiva requiere una
   plantilla de WhatsApp; el evento ya se captura en `confirmed_new`).
4. **Piloto de activación (EN CURSO):** sombra → live gradual vía `COPILOT_LIVE_ALLOWLIST`,
   con métricas de `messages`. Smoke test propio OK; falta validar coexistencia con asesor.
5. **Reseñas por WhatsApp** (generar volumen de reseñas; tie-in con Klaviyo/CDP).
6. Omnichannel / cruce con identidad del CDP por `wa_id`.

## Cómo leer el estado real (debugging)
- Código en vivo: `get_edge_function` o healthcheck GET. Esquema: `list_tables`.
- Calidad/telemetría: `select mode, model, tokens_in, tokens_out, latency_ms from
  public.messages order by created_at desc` y `select * from public.job_log order
  by created_at desc`.
- Análisis de sombra (categorías de mensajes, prompt v2): doc
  `2026-06-13-copilot-analisis-sombra-prompt-v2.md` en qsp-cdp-docs.
