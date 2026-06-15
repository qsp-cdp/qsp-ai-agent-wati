# CLAUDE.md — Copiloto AI de WhatsApp (WATI) · Quick Service Panamá

> Contexto base para Claude Code trabajando en ESTE repo. Lee esto primero.
> Generado 2026-06-15 desde el estado real en producción (edge function v7 +
> esquema del proyecto Supabase). Docs de diseño originales en el repo
> `qsp-cdp/qsp-cdp-docs` (`docs/design/2026-06-12-proyecto-copilot-wati.md` y
> `docs/design/2026-06-13-copilot-analisis-sombra-prompt-v2.md`).

## Qué es
Copiloto de IA dentro de **WATI** (WhatsApp, ~90% de las ventas de QSP). Contesta
preguntas generales, indica disponibilidad/stock y da precio — empezando por lo
básico y sumando capacidades. Tienda: **quickservicepanama.com** (suministros de
impresión y tecnología en Panamá).

## Estado actual (2026-06-15)
- **EN VIVO: `copilot-webhook` v7, ACTIVE, MODO SOMBRA.** (En el repo: **v8** con
  Fase 1.5 / tool `info_tienda`, pendiente de desplegar + aplicar la migración
  `store_facts`.) "Sombra" = registra lo que respondería pero **NO envía nada al
  cliente**. Cambiar a "live" es una decisión deliberada (env `COPILOT_MODE=live`).
- Tráfico real loggeado: **102 conversaciones, 865 mensajes**. Verificado:
  modelo **Claude Haiku 4.5**, ~**$0.003/turno**, ~**4 s** de latencia.
- Evento de contacto nuevo de WATI ya cableado (v7).

## Arquitectura
```
WATI (WhatsApp) ──webhook POST?key=──► Supabase Edge Function `copilot-webhook`
                                          │  (Deno/TS, verify_jwt=false)
                                          ├─► Anthropic Messages API (Haiku 4.5) + tool use
                                          │      └─ tool buscar_producto → Shopify search/suggest.json
                                          ├─► Postgres (conversations/messages/handoffs/job_log)
                                          └─► (solo en live) WATI sendSessionMessage  ◄─ ventana 24h
```
- **Proyecto Supabase:** `jbigmlcalcwiphqeudxd` (**qsp-wati-copilot**). Es
  **SEPARADO** del CDP `tuyheailysudfxiuppmg` (qsp-data-hub) — decisión de
  aislamiento. Comparten la **llave natural `wa_id`** (teléfono) para poder
  cruzar con el CDP más adelante.
- **Deps:** `npm:@anthropic-ai/sdk@0.39.0`, `npm:@supabase/supabase-js@2.45.4`.
- Código canónico: `supabase/functions/copilot-webhook/index.ts` (en este repo) =
  lo desplegado. Para verificar lo que está EN VIVO:
  `mcp__Supabase__get_edge_function(project_id=jbigmlcalcwiphqeudxd, slug=copilot-webhook)`.

## Modelo de datos (schema `public`, RLS on, solo service_role)
- **conversations** — `id`, `wa_id` (unique, = teléfono), `sender_name`,
  `status` (`bot`/`handoff`/`cerrada`), `turns_today`/`turns_date` (tope
  anti-costos), `last_message_at`, `confirmed_new` (bool — del evento newContact),
  `first_contact_at`.
- **messages** — `conversation_id` FK, `role` (user/assistant/tool/system),
  `content`, `tool_calls` jsonb, `mode` (**shadow**/live), `model`, `tokens_in/out`,
  `latency_ms`, `wati_message_id` (dedup de webhooks reintentados, índice único).
- **handoffs** — `conversation_id`, `motivo`, `resuelto`.
- **job_log** — `function_name`, `action`, `ok`, `detail` jsonb (telemetría;
  "nunca romper").
- **store_facts** (Fase 1.5) — `key` (envios/pagos/ubicacion/horarios), `label`,
  `value` (vacío = no disponible). Fuente única que lee la tool `info_tienda`.
- **RPC `upsert_conversation(p_wa_id, p_sender_name)`** — upsert atómico por
  `wa_id` + incremento del contador diario de turnos. `security definer`, solo
  `service_role`.

Migraciones (ver `supabase/migrations/`):
`copilot_schema_inicial`, `rpc_upsert_conversation`, `fix_grant_service_role`,
`grants_service_role_tablas`, `conversations_confirmed_new`,
`store_facts` (Fase 1.5 — pendiente de aplicar).

## Flujo del webhook (resumen de index.ts)
1. **GET** = healthcheck (status/version/mode/model).
2. **POST**: valida `?key=` (guard, porque `verify_jwt=false`) → parse JSON.
3. Si `eventType` incluye `newcontact` (evento WATI `newContactMessageReceived`,
   sin texto): marca `confirmed_new=true` + `first_contact_at`, loggea y retorna.
4. Filtra: sin `waId`/sin texto/`owner=true` (mensaje del negocio)/`type!=text` → skip.
5. `upsert_conversation` → inserta msg de usuario (dedup por `wati_message_id`).
6. Cortes: si `status=handoff` → skip; si `turns_today>40` → skip; si el texto
   matchea `HANDOFF_RE` (humano|asesor|reclamo|garantía|devolución|…) → handoff.
7. Trae historial (últimos 8 user/assistant) → `responderLLM` (Haiku + loop de
   tool use, máx 4 iteraciones).
8. Inserta respuesta del assistant con `mode` shadow|live. En **live** además
   envía por WATI; en **shadow** solo registra.

## System prompt v2 (íntegro — es el corazón del comportamiento)
Reglas clave (texto completo en `index.ts`, const `SYSTEM_PROMPT`):
- **ESTILO:** mensajes cortos (1-3 oraciones), tono panameño, **negrita con UN
  solo asterisco** `*así*` (NUNCA `**` — en WhatsApp se ve literal), sin Markdown.
- **REGLA DE ORO:** precio/stock/promos SOLO vía tool `buscar_producto`; nunca
  inventar.
- **CONTACTO NUEVO vs CONOCIDO:** bienvenida+presentación una sola vez al nuevo;
  al conocido ir al grano.
- **REGLA ANTI-INTERRUPCIÓN:** si un humano está atendiendo (datos de trámite,
  pago en curso, comprobante, etc.) → ABSTENERSE y derivar. Ante la duda, NO
  interrumpir. Acks sueltos ("ok","gracias") no requieren respuesta.
- **LOGÍSTICA/PAGOS:** aún NO hay tool → no inventar montos/horarios; derivar
  honesto. (→ se reemplaza en Fase 1.5 con la tool `info_tienda`.)
- **HANDOFF** y **LÍMITES** (no legal/médico, nada fuera de la tienda).

## Tools
- **`buscar_producto(consulta)`** — `GET ${STORE}/search/suggest.json?q=...`
  (`STORE=https://www.quickservicepanama.com`). Devuelve `{titulo, precio_usd,
  disponible, url}` (máx 5).
- **`info_tienda(tema)`** (Fase 1.5) — lee la tabla `store_facts` y devuelve
  `{tema, titulo, info}` para `envios|pagos|ubicacion|horarios|todos`. Omite los
  vacíos; si no hay dato, el bot deriva a un asesor.

## Variables de entorno / secretos (en Supabase Edge Function secrets — NO en el repo)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WATI_API_TOKEN`,
`WATI_API_BASE`, `COPILOT_MODE` (shadow|live, default **shadow**), `COPILOT_MODEL`
(default `claude-haiku-4-5`), `COPILOT_WEBHOOK_KEY` (guard del `?key=`).

## Guardrails (NO romper)
- **MODO SOMBRA por defecto.** No enviar a clientes hasta encender `COPILOT_MODE=live`
  a propósito. Cualquier cambio que pueda mandar mensajes reales = avisar antes.
- **Anti-interrupción es sagrada:** mejor no contestar que cortar una venta humana.
- **Auto-expose OFF** en este proyecto → toda tabla nueva necesita `GRANT` manual a
  `service_role` (si no, la función da `permission denied`).
- **RLS on sin policies** = solo `service_role`. El `?key=` es obligatorio.
- Dedup por `wati_message_id`; tope `MAX_TURNS_DIA=40`.
- Deploy con `verify_jwt=false` (es un webhook público guardado por `?key=`).

## Despliegue
`mcp__Supabase__deploy_edge_function(project_id=jbigmlcalcwiphqeudxd, ...)` con
`verify_jwt:false`, o `supabase functions deploy copilot-webhook --no-verify-jwt`.
El webhook de WATI apunta a:
`https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<COPILOT_WEBHOOK_KEY>`.

## Roadmap (próximas fases)
1. **Fase 1.5 — tool `info_tienda`: ✅ implementada en el repo (v8).** Lee de la
   tabla `store_facts` (fuente única dentro del proyecto copilot). Pendiente:
   aplicar la migración, rellenar `store_facts` con datos reales y desplegar.
   Opción futura: re-apuntar la fuente a un metaobjeto/páginas de Shopify para
   unificar con el "single source of truth" del proyecto SEO (qsp-cdp-docs).
2. **Atención diferenciada a contacto nuevo** (bienvenida proactiva requiere una
   plantilla de WhatsApp; el evento ya se captura en `confirmed_new`).
3. **Piloto de activación** (sombra → live gradual, con métricas de `messages`).
4. **Reseñas por WhatsApp** (generar volumen de reseñas; tie-in con Klaviyo/CDP).
5. Omnichannel / cruce con identidad del CDP por `wa_id`.

## Cómo leer el estado real (debugging)
- Código en vivo: `get_edge_function`. Esquema: `list_tables`. 
- Calidad/telemetría: `select mode, model, tokens_in, tokens_out, latency_ms from
  public.messages order by created_at desc` y `select * from public.job_log order
  by created_at desc`.
- Análisis de sombra (categorías de mensajes, prompt v2): doc
  `2026-06-13-copilot-analisis-sombra-prompt-v2.md` en qsp-cdp-docs.
