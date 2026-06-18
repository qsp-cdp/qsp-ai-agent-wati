# CLAUDE.md — Copiloto AI de WhatsApp (WATI) · Quick Service Panamá

> Contexto base para Claude Code trabajando en ESTE repo. Lee esto primero.
> Generado 2026-06-15; actualizado 2026-06-18 al estado real (edge function v18 +
> esquema del proyecto Supabase). Docs de diseño originales en el repo
> `qsp-cdp/qsp-cdp-docs` (`docs/design/2026-06-12-proyecto-copilot-wati.md` y
> `docs/design/2026-06-13-copilot-analisis-sombra-prompt-v2.md`).

## Qué es
Copiloto de IA dentro de **WATI** (WhatsApp, ~90% de las ventas de QSP). Apoya al
equipo humano: contesta preguntas generales, indica disponibilidad/stock y da precio
con certeza, y calla/deriva cuando es mejor que responda un humano. Tienda:
**quickservicepanama.com** (suministros de impresión y tecnología en Panamá).

## Estado actual (2026-06-18)
- **EN VIVO: `copilot-webhook` v18 (`v18-busqueda-guion`), ACTIVE.** Desplegado el
  2026-06-18 con `verify_jwt=false`. Healthcheck (GET, sin key) reporta
  `version/mode/model/llm_configured/wati_send_configured/live_targets`.
- **MODO: LIVE A TODOS.** `COPILOT_MODE=live` + `COPILOT_LIVE_ALLOWLIST=all`
  (`live_targets:"all"`). El piloto por allowlist (sombra → número por número) ya se
  completó; hoy el bot responde a todos los clientes. El default del CÓDIGO sigue
  siendo **sombra** (si faltara el secreto, no envía) — ver guardrails.
- **MODELO: `claude-sonnet-4-6`** (`COPILOT_MODEL`). Tras evaluar Haiku 4.5, Sonnet 4.6
  y Opus 4.8 sobre tráfico real, Sonnet quedó como el punto justo (ver abajo). Haiku es
  solo el FALLBACK del código si faltara el secreto.
- **Coexistencia con asesor humano: VALIDADA** (la razón por la que se había frenado el
  piloto). Fix v15: cuando el negocio escribe (`owner=true`), la conversación pasa a
  `status='handoff'` y el bot ya NO la retoma solo (antes volvía a los 45 min y se
  "robaba" ventas humanas). El bot solo atiende contactos nuevos / sin asignar.
- **v18 validado en producción (2026-06-18):** el cliente escribió `toner tn830xl` (sin
  guion) → el bot encontró el *TN-830XL ($116)* en vez de decir "no lo tengo". Fix del
  guion (con/sin) funcionando.
- `store_facts` **aplicada** con los **17 datos reales** de QSP (envío, pagos,
  ubicación, horario, devoluciones, contacto). Secretos WATI configurados
  (`wati_send_configured:true`).
- **Evaluación de modelos sobre tráfico real:** Haiku ~$0.0036/turno (4.2 s, ~21%
  grounding) · Sonnet ~$0.017/turno (8 s, ~51% grounding) · Opus ~$0.034/turno (7.2 s,
  ~39% grounding). Conclusión: **Opus no justifica el costo** (cuesta 2× Sonnet y
  aterriza MENOS); **Sonnet 4.6 es el punto justo**. Lección: los huecos de búsqueda se
  arreglan en CÓDIGO (determinista), no esperando que un LLM más caro adivine.

## Arquitectura
```
WATI (WhatsApp) ──webhook POST?key=──► Supabase Edge Function `copilot-webhook`
                                          │  (Deno/TS, verify_jwt=false; ACK rápido,
                                          │   trabajo lento en EdgeRuntime.waitUntil)
                                          ├─► Anthropic Messages API (Sonnet 4.6) + tool use
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
  `first_contact_at`. **v15:** cuando un humano del negocio escribe, pasa a
  `status='handoff'`; para devolverla al bot: `update … set status='bot'`.
- **messages** — `conversation_id` FK, `role` (user/assistant/tool/system),
  `content`, `tool_calls` jsonb, `mode` (**shadow**/live), `model`, `tokens_in/out`,
  `latency_ms`, `wati_message_id` (dedup de webhooks reintentados, índice único).
  Nota v13: los mensajes de un asesor humano se guardan con `role='assistant'` y
  `model='human-agent'` (contexto para el agente).
- **handoffs** — `conversation_id`, `motivo`, `resuelto`.
- **job_log** — `function_name`, `action`, `ok`, `detail` jsonb (telemetría;
  "nunca romper"). Acciones clave: `mensaje_humano`, `abstencion_interrupcion`,
  `contacto_nuevo`, `tope_turnos`, `evento_sin_texto`, `error`.
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
4. **`owner=true` (mensaje del negocio):** si coincide con un envío propio reciente del
   bot (<5 min, mismo texto) → se ignora (**anti-eco**, v13); si es un asesor humano real
   → se guarda en el hilo (`model='human-agent'`), se pone la conversación en
   `status='handoff'` (**v15**: el bot no la retoma solo) y se registra `mensaje_humano`.
   Retorna.
5. Filtra: sin `waId`/sin texto/`type!=text` → skip. `upsert_conversation` → inserta msg
   de usuario (dedup por `wati_message_id`, síncrono).
6. Cortes: si `status=handoff` → skip (cubre la atención humana de v15); si
   `turns_today>40` → skip. **Anti-interrupción 2:** si el texto matchea `INTERRUPT_RE`
   (RUC/cédula/razón social/pago/comprobante/mensajero…) → ABSTENERSE (no llama al LLM).
   Si matchea `HANDOFF_RE` (humano|asesor|reclamo|…) → handoff. (La vieja regla de "humano
   hace <45 min" vía job_log se RETIRÓ en v15; ahora la cubre `status='handoff'`.)
7. **(v14) Trabajo lento en SEGUNDO PLANO** (`EdgeRuntime.waitUntil`): el webhook ya
   respondió 200 a WATI (evita su timeout/`Err`). En background: trae historial (últimos
   10 user/assistant; los de asesor van etiquetados `[Asesor del equipo]:`) →
   `responderLLM` (Sonnet + loop de tool use, máx 4 iter). **Forzado de tool (v12):** si
   el texto matchea `NEEDS_TOOL_RE` (catálogo/tienda/reparación) se fuerza
   `tool_choice:"any"` en la 1ª iteración → grounding garantizado.
8. **(v16)** Antes de enviar, `limpiarWhatsApp` convierte links markdown `[txt](url)` →
   URL pelada y `**` → `*` (WhatsApp los muestra literales). Inserta respuesta del
   assistant con `mode` shadow|live. Envía por WATI **solo si `liveAllowed(waId)`**
   (MODE=live Y el número en el allowlist/`all`); si no, queda en sombra.

## System prompt (íntegro — es el corazón del comportamiento)
Reglas clave (texto completo en `index.ts`, const `SYSTEM_PROMPT`):
- **MISIÓN (v10):** apoyar al equipo humano; responder con certeza lo que se pueda y
  callar/derivar ante la duda o si puede comprometer a la empresa. Mejor no responder
  que responder mal.
- **ESTILO:** mensajes cortos (1-3 oraciones), tono panameño, **negrita con UN
  solo asterisco** `*así*` (NUNCA `**` — en WhatsApp se ve literal), sin Markdown, URLs
  peladas (NUNCA `[texto](url)`).
- **REGLA DE ORO (v11/v12):** precio/stock/promos SOLO vía `buscar_producto` EN EL
  MISMO TURNO; nunca inventar ni nombrar modelos sin haber buscado. Reforzada en
  código con forzado de tool (`NEEDS_TOOL_RE` → `tool_choice:"any"`).
- **BÚSQUEDA (v10):** términos concisos (marca+modelo; el modelo es la señal más fuerte);
  sinónimos/línea (Pixma↔Canon…); reformular si no encuentra; preguntas de categoría con
  1-2 ejemplos; NO afirmar compatibilidad sin evidencia del catálogo.
- **MODELO EXACTO (v17):** usar el TÍTULO tal cual lo devuelve `buscar_producto`; si el
  modelo pedido NO aparece en el título, decirlo y ofrecerlo como alternativa — NUNCA
  poner el modelo pedido junto al precio/link de otro producto (corrige el caso del
  monitor 322pv respondido con el link de otro modelo).
- **SOPORTE/REPARACIONES (v17):** QSP NO repara ni da soporte técnico; ante "reparar /
  no enciende / no imprime" usar `info_tienda` y sugerir la empresa de la marca que
  figure ahí; nunca inventar teléfonos/empresas; si no hay dato, derivar.
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
  reintenta por número/código de modelo (G2170, 954…). **v18:** cada código de modelo se
  prueba CON y SIN guion (`TN830XL` ↔ `TN-830XL`, `GI11` ↔ `GI-11`) porque Shopify no
  matchea una forma contra la otra; las variantes se generan EN CÓDIGO (`variantesModelo`)
  y se deduplican los intentos. El prompt maneja sinónimos/línea y preguntas de categoría.
- **`info_tienda(tema?)`** (Fase 1.5, desplegada) — lee `store_facts` y devuelve TODOS
  los pares `key→value` con valor (omite vacíos); si no hay datos, el bot deriva a un asesor.

## Variables de entorno / secretos (en Supabase Edge Function secrets — NO en el repo)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WATI_API_TOKEN`,
`WATI_API_BASE`, `COPILOT_MODE` (shadow|live, default **shadow**),
`COPILOT_LIVE_ALLOWLIST` (`wa_id` permitidos en live; vacío = nadie, `all`/`*` = todos),
`COPILOT_MODEL` (default del código `claude-haiku-4-5`; en producción `claude-sonnet-4-6`),
`COPILOT_WEBHOOK_KEY` (guard del `?key=`).

> ⚠️ **OJO — no cruzar `COPILOT_MODE` con `COPILOT_MODEL`** (pasó 3 veces): el ID del
> modelo (`claude-…`) va SIEMPRE en `COPILOT_MODE**L**` (la L = modeLo). `COPILOT_MODE`
> es solo `live` o `shadow`. Si se cruzan, `MODE` deja de ser `live` y el bot queda
> mudo (`live_targets:0`). Verificar siempre con el healthcheck GET tras tocar secretos.

## Guardrails (NO romper)
- **MODO SOMBRA es el default del código.** Hoy el secreto está en `live`+`all`, pero si
  faltara `COPILOT_MODE` el código cae a sombra (no envía). Cualquier cambio que pueda
  alterar a quién/si se le manda = avisar antes.
- **Anti-interrupción es sagrada:** mejor no contestar que cortar una venta humana.
  (1) **v15:** owner=true → `status='handoff'`, el bot no retoma solo. (2) Guardrail
  PRE-LLM `INTERRUPT_RE` que ABSTIENE ante trámites/pagos/datos fiscales. El bot NUNCA
  captura ni repite RUC/datos de factura/pago.
- **Anti-eco (v13):** un `owner=true` que sea el eco de un envío propio del bot NO se
  trata como humano (evita que el bot se auto-abstenga / se ponga en handoff en live).
- **Auto-expose OFF** en este proyecto → toda tabla nueva necesita `GRANT` manual a
  `service_role` (si no, la función da `permission denied`).
- **RLS on sin policies** = solo `service_role`. El `?key=` es obligatorio.
- Dedup por `wati_message_id`; tope `MAX_TURNS_DIA=40`.
- Deploy con `verify_jwt=false` (es un webhook público guardado por `?key=`).

## Despliegue
`mcp__Supabase__deploy_edge_function(project_id=jbigmlcalcwiphqeudxd, ...)` con
`verify_jwt:false`, o `supabase functions deploy copilot-webhook --no-verify-jwt`.
(Nota: el MCP de Supabase está gated por aprobación en esta sesión; ruta usada en la
práctica: copiar el `index.ts` desde el raw de GitHub → editor del dashboard →
Verify JWT OFF → deploy → verificar healthcheck. El SQL lo corre el usuario en el SQL
Editor; los deploys los hace el browse agent.)
El webhook de WATI apunta a:
`https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<COPILOT_WEBHOOK_KEY>`.
Eventos WATI suscritos (necesarios): **Message Received**, **Session Message Sent**
(owner=true para detectar al asesor) y **New Contact Message Received**.

## Roadmap (próximas fases)
1. **Fase 1.5 — `info_tienda`: ✅ desplegada y `store_facts` aplicada** (17 datos reales).
   Opción futura: re-apuntar la fuente a un metaobjeto/páginas de Shopify para unificar
   con el "single source of truth" del proyecto SEO (qsp-cdp-docs).
2. **v19 — Visión / imágenes (PRÓXIMO):** clientes mandan capturas (del ecommerce, de
   Instagram, "¿es este?"). Manejar `type:image`, descargar de WATI, clasificar con
   Claude vision (producto vs pago/dato fiscal → abstenerse), buscar en catálogo; NUNCA
   cotizar precio desde una imagen. Pendiente: confirmar el mecanismo de entrega de media
   de WATI.
3. **Enriquecer con descripción/tags/variantes** vía `products/{handle}.json` público
   (en vivo, sin réplica ni token) para que el bot no adivine compatibilidad. Se decidió
   NO hacer réplica completa de Shopify en Supabase (riesgo de datos viejos para un bot
   "no inventar"; el precio/stock se mantienen en vivo; FTS/trigram antes que pgvector).
4. **Debounce / anti-repetición** para mensajes en ráfaga (saludos dobles, "un asesor"
   triplicado) — afecta a todos los modelos, es arreglo de arquitectura, no de prompt.
5. **Página web "Envíos al interior y recogida en sucursal"** (`web/envios-interior-sucursal.html`,
   45 sucursales con data propia) → publicar en Shopify y poner su URL en el `store_facts`
   `sucursales_interior`. Correr la SQL `soporte_reparaciones` (feature v17).
6. **Recall de productos:** ante combo agotado, ofrecer variantes/tintas individuales en
   stock en vez de derivar.
7. **Reseñas por WhatsApp** (generar volumen; tie-in con Klaviyo/CDP).
8. Omnichannel / cruce con identidad del CDP por `wa_id`. (Orquestador multi-modelo:
   evaluado y descartado por ahora — prematuro; un router por reglas solo si hace falta.)

## Cómo leer el estado real (debugging)
- Código en vivo: `get_edge_function` o healthcheck GET. Esquema: `list_tables`.
- Calidad/telemetría: `select mode, model, tokens_in, tokens_out, latency_ms from
  public.messages order by created_at desc` y `select * from public.job_log order
  by created_at desc`.
- Devolver una conversación del humano al bot: `update public.conversations set
  status='bot' where wa_id='<numero>';`.
- Análisis de sombra (categorías de mensajes, prompt v2): doc
  `2026-06-13-copilot-analisis-sombra-prompt-v2.md` en qsp-cdp-docs.
