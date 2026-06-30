# CLAUDE.md — Copiloto AI de WhatsApp (WATI) · Quick Service Panamá

> Contexto base para Claude Code trabajando en ESTE repo. Lee esto primero.
> Generado 2026-06-15; actualizado 2026-06-30 (edge function v38 en el repo, listo para
> desplegar; v37 EN VIVO) + esquema del proyecto Supabase. Docs de diseño originales en el repo
> `qsp-cdp/qsp-cdp-docs` (`docs/design/2026-06-12-proyecto-copilot-wati.md` y
> `docs/design/2026-06-13-copilot-analisis-sombra-prompt-v2.md`).

## Qué es
Copiloto de IA dentro de **WATI** (WhatsApp, ~90% de las ventas de QSP). Apoya al
equipo humano: contesta preguntas generales, indica disponibilidad/stock y da precio
con certeza, y calla/deriva cuando es mejor que responda un humano. Tienda:
**quickservicepanama.com** (suministros de impresión y tecnología en Panamá).

## Estado actual (2026-06-30)
- **EN VIVO: `copilot-webhook` v37 (`v37-feriados`), ACTIVE.** Desplegado con
  `verify_jwt=false` (2026-06-30). Healthcheck (GET, sin key) reporta `version/mode/mode_raw/model/
  llm_configured/wati_send_configured/inventario_configurado/resolve_configured/
  handoff_assist_min/handoff_cold_hours/live_targets`. **Prompt caching (v35) confirmado en prod:** `avg(tokens_in)`
  cayó de ~9.554 a ~2.337 (−75% de input a 1×), sin cambio de comportamiento. v36 (horario hábil calculado)
  y v37 (feriados nacionales) también desplegados y verificados por healthcheck.
- **EN EL REPO, LISTO PARA DESPLEGAR: v38 (`v38-cache-metrics`).** Telemetría de prompt caching: persiste
  `cache_read_input_tokens`/`cache_creation_input_tokens` por turno en `messages` (solo medición, no cambia
  comportamiento). Requiere la migración `20260630160000_messages_cache_tokens.sql` (ADD COLUMN). Desplegar
  con `git pull` + `.\deploy.ps1` y correr el SQL; verificar `version:"v38-cache-metrics"`.
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
- **v19 (visión) validado en producción (2026-06-18):** caso A (foto de producto) → el
  bot identifica, busca con `buscar_producto` y da precio real; caso B (comprobante de
  pago / dato fiscal) → se ABSTIENE ("un asesor lo revisa"). Los dos caminos —el útil y
  el seguro— funcionando. El descubrimiento del shape de media de WATI se hizo con el
  diagnóstico v18.1 (la URL del archivo viene en el campo `data`).
- **v20 (endurecimiento) tras AUDITAR el 1er día live a todos (2026-06-18):** la auditoría
  (101 convs, 156 resp del bot, 88 con asesor) confirmó la coexistencia → **0 clientes
  reales pisados** (las 2 alarmas eran la línea de pruebas), 13 abstenciones, visión 15/15,
  grounding ~50%. Se hallaron 2 problemas NO de seguridad, arreglados en v20: (1) respuestas
  dobles/triples en ráfaga → **anti-duplicado** (solo el último mensaje contesta, chequeo
  pre/post LLM); (2) 23 errores `messages_mode_check` por cruzar `COPILOT_MODE`↔`COPILOT_MODEL`
  → **clamp de MODE** (inválido cae a `shadow`, no rompe inserts). Además **anti-carrera**
  (no pisar si un asesor entró durante el LLM) y **guard de prefill** (la conversación
  siempre termina en mensaje de usuario). Veredicto: **GO** para mantenerlo abierto a todos.
- **v21 (ITBMS + inventario real + anti-eco duro + prefill, 2026-06-19):** (1) **ITBMS** — los
  precios de Shopify son SIN impuesto; `buscar_producto` calcula en CÓDIGO y devuelve `precio_usd`
  + `itbms_7pct` + `total_con_itbms` (el LLM no hace aritmética). (2) **Inventario real** —
  `buscar_producto` consulta Shopify Admin (`totalInventory`) y devuelve un campo `stock` ya
  resuelto: >3 muestra el número, ≤3 (incl. 0) deriva a un asesor para verificar inventario físico
  (el bot nunca ve ni inventa el número); best-effort (sin token → "un asesor confirma"). (3)
  **Anti-eco duro** — la respuesta se inserta ANTES de enviarse por WATI → el eco no se guarda como
  asesor → se acabaron los handoffs falsos (eran ~5/día). (4) **Guard de prefill** endurecido.
  Validado en prod (Epson 544 → $10.00 + ITBMS = $10.70; plotter → "un asesor verifica stock").
- **v22 (conciencia de horario, 2026-06-19):** atención Lun-Vie **9:00am–5:00pm** (Panamá, UTC-5
  fijo). Fuera de horario el bot SIGUE respondiendo lo automático, pero al derivar aclara que un
  asesor responde en el próximo horario hábil (no promete humano inmediato); el handoff fijo
  también es consciente del horario. (Feriados: resueltos en v37.) Validado en prod.
- **v23 (resiliencia ante fallos de API, 2026-06-23):** tras una auditoría que halló un bache de
  Anthropic (`529 overloaded` / `500 internal`) de ~33 min que dejó ~21 turnos sin respuesta:
  `maxRetries=3` en el SDK + **respuesta de respaldo** (si la API falla y no se alcanzó a responder,
  en vez de silencio se manda "estamos con alto volumen, un asesor te ayuda…", consciente del
  horario; respeta live/anti-duplicado/handoff; `job_log` `respuesta_respaldo`, `model='fallback'`).
- **v24 (venta consultiva, 2026-06-24):** sección "VENTA CONSULTIVA" en el prompt — el bot asesora
  (intake antes de recomendar, se adapta al tipo de cliente, recomienda por necesidad, posiciona
  originales, usa la web como apoyo, B2B→deriva) sin aflojar la regla de oro ni la anti-interrupción.
  Destilado de la nueva `docs/base-conocimiento-qsp.md` (KB de negocio versionada).
- **v25 (captura de lead + buscar antes de negar, 2026-06-24):** (1) BUSCAR ANTES DE NEGAR: se amplió
  `NEEDS_TOOL_RE` al catálogo completo (monitores, escáneres, UPS, accesorios, laptops, cables…, no
  solo impresión) + regla "nunca niegues sin buscar" → se acabó el "no lo tenemos" de memoria que
  luego se corregía (validado en prod: "¿venden monitores?" → sí + modelos reales). (2) CAPTURA DE
  LEAD (pasiva): tool `guardar_lead` escribe en atributos de WATI; lee los que ya tenemos (del
  payload) para no repreguntar; respeta anti-interrupción (nunca RUC/factura). Validado en prod.
- **v26 (conciencia de canal, 2026-06-24):** el bot atiende POR WhatsApp → ya NO dice "escríbenos por
  WhatsApp" ni da el número de la tienda; al derivar dice "un asesor te responde por aquí".
- **v27 (nombre y apellido, 2026-06-24):** `guardar_lead` también captura `nombre` y `apellido`
  (atributos de WATI), además de `email` y `empresa`; el correo ya no es obligatorio (guarda lo que el
  cliente dé). Captura real validada en prod.
- **v28–v30 (puente WhatsApp→web por `ref_code`, 2026-06-24/25):** los links de producto que emite
  `buscar_producto` llevan tracking para atribución / identidad omnicanal en el CDP. (v28) URL **apex**
  (sin www) + UTMs + un `ref_code` opaco de 8 alfanuméricos (crypto) por producto; se guarda
  `{ref_code→wa_id,handle}` en la tabla **`ref_codes`** (best-effort; NUNCA se emite un code sin guardar)
  + endpoint **GET `?ref_code=`** que el CDP resuelve. (v29) fix DETERMINISTA: el LLM "limpiaba" el link
  (le quitaba el `?utm…&ref_code=`) → `reaplicarTracking` reaplica el tracking post-LLM. (v30) el endpoint
  acepta `Authorization: Bearer <RESOLVE_SECRET>` (el CDP lo lee por Bearer). Privacidad: nunca `wa_id`/PII
  en la URL, solo el `ref_code`. Contrato y verificación: `docs/handoff-cdp-ref-code-bridge.md`. Verificado
  end-to-end en prod.
- **v31 (ciclo de vida del handoff, 2026-06-26):** el bot deja de quedarse MUDO para siempre en
  `status='handoff'`. REACTIVO (lo gatilla un mensaje del cliente), midiendo el tiempo desde el **último
  mensaje del asesor** (`model='human-agent'`): (1) **ASISTENCIA** (≥15 min sin asesor) — si el cliente
  hace una pregunta BÁSICA de tienda (ubicación/horario/pago/envío/devolución; `BASIC_INFO_RE`), el bot
  adelanta SOLO esa info vía `info_tienda` (única tool, `modoAsistencia`), breve y deferente, y la
  conversación **SIGUE en handoff** (no le quita la venta al humano). (2) **COLD-RETURN** (>24 h sin asesor)
  — la atención humana se considera fría → el bot **RETOMA todo** (`status→'bot'`) y procesa como cualquier
  cliente. Umbrales configurables (`COPILOT_HANDOFF_ASSIST_MIN`/`COPILOT_HANDOFF_COLD_HOURS`). **Guardrails
  intactos:** `INTERRUPT_RE` (pago/fiscal/trámite) bloquea AMBOS caminos; si el asesor vuelve a escribir,
  `owner=true` regresa a handoff y el anti-carrera evita pisarlo; el anti-eco reconoce el envío propio
  (`model='assist-handoff'`, no resetea el reloj). Si NUNCA escribió un humano (handoff por keyword), se
  mantiene el comportamiento v30. Sin cambios de esquema. (Diseño acordado con Gerencia: 15 min / 24 h,
  reactivo, solo conversaciones activas.)
- **v32 (conciencia temporal, 2026-06-26):** el bot mezclaba el "ayer" con el "hoy" porque el historial
  se le pasaba SIN marca de tiempo y, dentro de horario, ni sabía la fecha. Caso real: ayer el cliente
  dijo *"mañana le paso"*; hoy escribió *"buenas tardes"* y el bot respondió *"le esperamos mañana"*
  (cuando venía HOY). Fix, todo CONTEXTO (no toca guardrails): (1) `CONTEXTO TEMPORAL` fijo con la
  fecha/hora actual de Panamá (antes solo se inyectaba fuera de horario); (2) cada mensaje ANTERIOR del
  historial se marca con cuándo se dijo (`[hoy …]`/`[ayer …]`/`[fecha …]`, hora de Panamá) — el
  último/actual va limpio (no interfiere con el caption de visión); (3) regla: los mensajes de días
  previos son contexto PASADO, no arrastrar "mañana/hoy/ahora" viejos, y un saludo nuevo tras un corte
  de día = visita nueva. Se agrega `created_at` al fetch del historial. Sin cambios de esquema.
- **v33 (extracción de modelo robusta, 2026-06-29):** `modelosEn` tenía 2 huecos que rompían búsquedas
  reales: (1) códigos que empiezan con dígito + sufijo (140XL, 141XL, 3253ci) no se extraían; (2) códigos
  de varios segmentos con guion (PT-H110) se partían mal (agarraba "H110"). Confirmado con tráfico real:
  la etiquetadora Brother existe como handle `…-brother-pth110` pero el bot buscaba "PT-H110" y no la
  hallaba. Fix: `modelosEn` toma cualquier token alfanumérico (con guiones) con ≥1 dígito y largo≥3;
  `variantesModelo` amplía las formas con/sin guion (multi-segmento). Probado en los casos que fallaban +
  regresión. NO resuelve "modelo de IMPRESORA → consumible" (Kyocera 3253ci → tóner TK-8337K): eso es
  brecha de DATOS de compatibilidad (roadmap #3), no de extracción.
- **v34 (la búsqueda lee los tags de compatibilidad, 2026-06-29):** la compatibilidad impresora→consumible
  YA está cargada en Shopify como **tags** del producto ("Canon PIXMA MG2110", "Kyocera TASKalfa 3253ci"…),
  pero `suggest.json` por defecto NO busca en los tags (solo title/product_type/variants.title/vendor). Fix
  de UNA línea: agregar `tag` a `resources[options][fields]`. **Probado contra la tienda real:** `q=3253ci`
  SIN tag → 0 resultados; CON tag → los 4 TK-8337 (C/M/Y/K), limpio. Resuelve la brecha del v33 (3253ci →
  TK-8337) reusando el dato que el equipo ya mantiene en tags. (Futuro opcional: sumar `body` para
  compatibilidad escrita solo en la descripción.)
- **v35 (prompt caching, 2026-06-30 — listo para desplegar):** el input subió (el prompt creció
  v24→v34 + el volumen del lunes/reactivación) y es **input-dominado** (~10k in / ~155 out por turno).
  Fix **sin cambiar comportamiento**: el `system` pasa de un string concatenado a un arreglo de 2 bloques
  → (1) `SYSTEM_PROMPT` estático con `cache_control:{type:"ephemeral"}` (cachea **tools + SYSTEM_PROMPT**,
  el prefijo estable; render order de la API: tools → system → messages) y (2) el contexto **VOLÁTIL**
  (el `CONTEXTO TEMPORAL` con la hora actual de v32, nuevo/en-curso, horario, datos del cliente o
  `ASSIST_SUFFIX`) en un 2º bloque **SIN** `cache_control`, DESPUÉS del breakpoint, para no invalidar el
  caché cada turno. Lectura de caché 0.1× / escritura 1.25×, TTL 5 min; el prefijo supera de sobra el
  mínimo de 2048 tokens de Sonnet 4.6. GA (sin header beta). Verificar con `usage.cache_read_input_tokens>0`
  y `avg(tokens_in)` cayendo (`input_tokens` NO incluye lo leído de caché). En MODO ASISTENCIA las tools
  difieren (solo `info_tienda`) → ese camino mantiene su propia entrada de caché (raro, no afecta el normal).
  Sin cambios de esquema. **Desplegado y confirmado en prod (2026-06-30):** `avg(tokens_in)` ~9.554 → ~2.337
  (−75% de input a 1×); turnos simples ~800–1.300 in (prefijo servido del caché), turnos con tool 2.7k–7.6k
  (el historial y el JSON de productos NO se cachean, por diseño).
- **v36 (próximo horario hábil calculado en código, 2026-06-30 — desplegado):** bug real en prod
  → a la 1:00am del martes 30/jun el bot derivó diciendo que un asesor respondería "desde el miércoles 1 de
  julio a las 9:00am" cuando lo correcto era **HOY** (martes 30) a las 9:00am (faltaban 8 h para abrir). v22
  le pedía al LLM "deducí cuál [es el próximo horario hábil]" y eso es lo que falla: trata la madrugada como
  si el día ya hubiera pasado. Fix **determinista** (no toca guardrails ni el caché de v35): nueva función
  `proximoHorarioHabil(ahoraMs)` que devuelve la apertura concreta ("hoy martes 30 de junio a las 9:00am" /
  "mañana …" / "el lunes 6 de julio …", Lun-Vie 9am) y se inyecta TAL CUAL en el CONTEXTO HORARIO con la
  orden de NO recalcularla. Casos cubiertos (probados): día hábil antes de las 9 → HOY; día hábil después de
  las 5 → próximo hábil; fin de semana → lunes; rollover de mes/año. Va en el bloque VOLÁTIL del system (no
  invalida el caché). Sin cambios de esquema.
- **v37 (feriados nacionales de Panamá, 2026-06-30 — desplegado):** v22/v36 solo conocían Lun-Vie
  9-5 + fines de semana → un feriado entre semana se trataba como día hábil (el bot daría a entender que un
  asesor responde "hoy", y al derivar apuntaría a un día cerrado). Fix determinista: se agregan los feriados
  nacionales. Los **FIJOS** (Año Nuevo 1/1, Mártires 9/1, Trabajo 1/5, los de noviembre 3/4/5/10/28, Madres
  8/12, Duelo Nacional 20/12, Navidad 25/12) van por mes/día. **Carnaval (lun/mar) y Viernes Santo son
  MÓVILES** (dependen de la Pascua) → se calculan con **Meeus/Jones/Butcher** (Carnaval = Pascua−48/−47,
  Viernes Santo = Pascua−2), correcto para CUALQUIER año, sin mantenimiento. En un feriado: `horarioPanama`
  marca cerrado y `proximoHorarioHabil` salta al próximo día hábil no feriado (incluye feriados consecutivos
  como Carnaval lun+mar); el CONTEXTO HORARIO aclara "hoy es feriado". Probado contra la lista oficial 2026
  (14/14) + verificación de Pascua 2027. No toca guardrails ni el caché de v35. Sin cambios de esquema.
- **v38 (telemetría de prompt caching, 2026-06-30 — listo para desplegar):** el caching de v35 abarató el
  input (`avg(tokens_in)` ~9.554 → ~2.337) pero `tokens_in` (= `usage.input_tokens`) NO incluye lo
  leído/escrito al caché → el ahorro $ exacto y el hit-rate quedaban como proxy. Fix: persistir por turno
  `usage.cache_read_input_tokens` y `usage.cache_creation_input_tokens` (sumados a través de las iteraciones
  del loop de tool-use) en dos columnas nuevas de `messages`. **SOLO telemetría** — no cambia comportamiento,
  prompt, tools ni system. **CAMBIO DE ESQUEMA:** migración `20260630160000_messages_cache_tokens.sql`
  (`ADD COLUMN`, idempotente, no requiere GRANT nuevo porque el grant a `service_role` es a nivel de tabla).
  Lectura de caché se factura 0.1×, escritura 1.25×, `tokens_in` 1× → con estas columnas se calcula el $
  real. Verás `cache_creation>0` en el 1er turno de cada ventana de 5 min y `cache_read>0` en los siguientes.
- **Despliegue por CLI (2026-06-26):** se agregó **`deploy.ps1`** (raíz del repo) — `git pull` + `.\deploy.ps1`
  hace `supabase functions deploy … --no-verify-jwt` (byte-exacto desde disco, sin re-escribir contenido)
  y verifica el healthcheck. Es la vía recomendada (ver Despliegue): evita el error de un agente que
  trunca el archivo al pegarlo (rompió prod una vez con el MCP).
- **Auditorías diarias (2026-06-19 y 06-23):** coexistencia perfecta (`bot_piso_a_humano=0`,
  `ecos_falsos=0`), anti-interrupción impecable (pago/fiscal/reembolso → humanos), ITBMS/inventario/
  visión funcionando. Los errores vistos eran **externos** (baches de Anthropic), no de nuestro código.
- `store_facts` **aplicada** con los datos reales de QSP (envío, pagos, ubicación, horario,
  devoluciones, contacto) + **`soporte_reparaciones`** (contactos de servicio técnico por marca,
  verificados — 2026-06-24) y la **URL real** en `sucursales_interior`. Secretos WATI configurados
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
                                          ├─► Anthropic Messages API (Sonnet 4.6, maxRetries=3) + tool use + visión
                                          │      ├─ imágenes del cliente → descarga de WATI (campo data) → base64
                                          │      ├─ tool buscar_producto → Shopify search/suggest.json (+ ITBMS en código)
                                          │      │                          + Shopify Admin GraphQL totalInventory (stock real)
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
  `status='handoff'`; para devolverla al bot: `update … set status='bot'`. **v31:** el bot ya gestiona
  el ciclo de vida del handoff solo (asiste a ≥15 min y retoma a >24 h sin asesor); el `update` manual
  sigue funcionando si se quiere forzar.
- **messages** — `conversation_id` FK, `role` (user/assistant/tool/system),
  `content`, `tool_calls` jsonb, `mode` (**shadow**/live), `model`, `tokens_in/out`,
  `cache_read_input_tokens`/`cache_creation_input_tokens` (v38 — telemetría de prompt caching; `tokens_in`
  NO los incluye), `latency_ms`, `wati_message_id` (dedup de webhooks reintentados, índice único).
  Nota v13: los mensajes de un asesor humano se guardan con `role='assistant'` y
  `model='human-agent'` (contexto para el agente).
- **handoffs** — `conversation_id`, `motivo`, `resuelto`.
- **job_log** — `function_name`, `action`, `ok`, `detail` jsonb (telemetría;
  "nunca romper"). Acciones clave: `mensaje_humano`, `abstencion_interrupcion`,
  `contacto_nuevo`, `tope_turnos`, `evento_sin_texto`, `error`, `descartado_superado` (v20
  anti-duplicado), `descartado_handoff_tardio` (v20 anti-carrera), `imagen_procesada`/
  `imagen_no_descargada` (v19), `respuesta_respaldo` (v23 fallback), `lead_capturado` (v25/v27 captura de lead),
  `ref_code_insert_error` (v28), `handoff_cold_return`/`asistencia_handoff` (v31 ciclo de vida del handoff).
- **store_facts** (Fase 1.5) — `key`/`value` (vacío = no disponible). Espejo
  (snapshot) del metaobjeto Shopify `store_facts/datos-tienda` (envío, pagos, ubicación, horario,
  devoluciones, contacto, **soporte_reparaciones**, **sucursales_interior**…). Fuente única de
  `info_tienda`. **v25/v27:** `guardar_lead` ESCRIBE en WATI (no en esta tabla) los atributos
  `email`/`nombre`/`apellido`/`empresa` del cliente.
- **ref_codes** (v28) — `ref_code` (PK, 8 alfanuméricos opacos), `wa_id`, `producto_handle`,
  `created_at`. Mapeo para el stitching WhatsApp→web: `buscar_producto` inserta una fila por link de
  producto emitido; el CDP resuelve `ref_code→wa_id` vía el endpoint GET `?ref_code=` (guard
  `RESOLVE_SECRET`). El `wa_id` vive SOLO aquí, nunca en la URL. Contrato: `docs/handoff-cdp-ref-code-bridge.md`.
- **RPC `upsert_conversation(p_wa_id, p_sender_name)`** — upsert atómico por
  `wa_id` + incremento del contador diario de turnos. `security definer`, solo
  `service_role`.

Migraciones (ver `supabase/migrations/`):
`copilot_schema_inicial`, `rpc_upsert_conversation`, `fix_grant_service_role`,
`grants_service_role_tablas`, `conversations_confirmed_new`,
`store_facts` (Fase 1.5 — **aplicada**, 17 datos reales),
`20260624180000_ref_codes` (v28 — **aplicada**, stitching WhatsApp→web),
`20260630160000_messages_cache_tokens` (v38 — **pendiente de aplicar**, 2 columnas de telemetría de caché).

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
5. Filtra: skip si falta `waId`. **v19:** una imagen de un cliente (`type:image`,
   `owner=false`) SÍ pasa (visión); el resto de no-texto (documento/audio/imagen del
   negocio) se registra (`evento_sin_texto.payload`, diagnóstico v18.1) y se salta.
   `upsert_conversation` → inserta msg de usuario (el caption o `[imagen]`; dedup por
   `wati_message_id`, síncrono).
6. **Ciclo de vida del handoff (v31):** si `status=handoff`, el bot ya NO se calla sin más. Lee el
   tiempo desde el último mensaje del asesor (`model='human-agent'`): **>24 h** (y el mensaje NO es
   INTERRUPT) → **cold-return** (`status→'bot'`, cae al flujo normal y retoma todo); **≥15 min** +
   pregunta básica (`BASIC_INFO_RE`) + no INTERRUPT + bajo el tope → **asistencia** (responde SOLO esa
   info vía `info_tienda` en una tarea aparte, sigue en handoff); si no, **skip** (como v30). Si nunca
   escribió un humano (handoff por keyword) → skip (v30). Luego: si `turns_today>40` → skip.
   **Anti-interrupción 2:** si el texto matchea `INTERRUPT_RE` (RUC/cédula/razón social/pago/comprobante/
   mensajero…) → ABSTENERSE (no llama al LLM). Si matchea `HANDOFF_RE` (humano|asesor|reclamo|…) →
   handoff. (La vieja regla de "humano hace <45 min" vía job_log se RETIRÓ en v15.)
7. **(v14) Trabajo lento en SEGUNDO PLANO** (`EdgeRuntime.waitUntil`): el webhook ya
   respondió 200 a WATI (evita su timeout/`Err`). En background: trae historial (últimos
   10 user/assistant; los de asesor van etiquetados `[Asesor del equipo]:`) →
   `responderLLM` (Sonnet + loop de tool use, máx 4 iter). **Forzado de tool (v12):** si
   el texto matchea `NEEDS_TOOL_RE` (catálogo/tienda/reparación) se fuerza
   `tool_choice:"any"` en la 1ª iteración → grounding garantizado. **(v22)** Fuera de horario
   (Lun-Vie 9-5 Panamá) se inyecta un CONTEXTO HORARIO para que el bot aclare cuándo responde un asesor.
8. **(v16)** Antes de enviar, `limpiarWhatsApp` convierte links markdown `[txt](url)` →
   URL pelada y `**` → `*` (WhatsApp los muestra literales). **(v20) Re-chequeos antes de
   enviar:** si llegó un mensaje de cliente más nuevo → descarta (`descartado_superado`); si
   pasó a `handoff` durante el LLM → no envía (`descartado_handoff_tardio`). **(v21)** la respuesta
   se INSERTA antes de enviarse por WATI (para que el eco no dispare un handoff falso), con `mode`
   shadow|live. Envía por WATI **solo si `liveAllowed(waId)`** (MODE=live Y el número en el
   allowlist/`all`); si no, queda en sombra. **(v23)** si el LLM falla y no se alcanzó a responder
   → respuesta de respaldo en vez de silencio (`respuesta_respaldo`, `model='fallback'`).

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
- **IMÁGENES (v19):** si llega una foto, mirarla: si es un PRODUCTO → identificar
  marca/modelo y buscar con `buscar_producto` (precio SOLO de la tool, nunca leído de la
  imagen); si es un COMPROBANTE/dato fiscal → abstenerse; si no se entiende → derivar.
- **PRECIO + ITBMS (v21):** los precios son SIN ITBMS; mostrar precio + ITBMS (7%) + total con los
  valores que devuelve la tool (`precio_usd`/`itbms_7pct`/`total_con_itbms`), NUNCA calcular de memoria.
- **STOCK (v21):** usar el campo `stock` de la tool tal cual (">N unidades", o "un asesor verifica el
  inventario físico" si ≤3); NUNCA inventar una cantidad.
- **HORARIO (v22):** fuera de Lun-Vie 9-5 (Panamá) ayudar igual con lo automático pero aclarar cuándo
  responde un asesor; no prometer humano inmediato (se inyecta como CONTEXTO HORARIO).
- **CONTACTO NUEVO vs CONOCIDO:** bienvenida+presentación una sola vez al nuevo;
  al conocido ir al grano.
- **REGLA ANTI-INTERRUPCIÓN:** si un humano está atendiendo (datos de trámite,
  pago en curso, comprobante, etc.) → ABSTENERSE y derivar. Ante la duda, NO
  interrumpir. Acks sueltos ("ok","gracias") no requieren respuesta.
- **LOGÍSTICA/PAGOS (v11):** vía tool `info_tienda` (single source = `store_facts`);
  no inventar montos/horarios ni compartir números de cuenta; si falta el dato, derivar.
- **VENTA CONSULTIVA (v24):** ante una recomendación, hace 1-2 preguntas de intake (uso, volumen,
  color/WiFi, presupuesto), se adapta al tipo de cliente y recomienda por necesidad — pero TODO
  modelo/precio sale de `buscar_producto` (regla de oro intacta); B2B/cotización formal → deriva.
- **BUSCAR ANTES DE NEGAR (v25):** NUNCA decir "no lo tenemos" de memoria; QSP vende más que impresión
  (monitores, escáneres, UPS, accesorios…). `NEEDS_TOOL_RE` ampliado + regla → siempre busca antes de negar.
- **CAPTURA DE DATOS (v25/v27, pasiva):** ante intención de cotizar/comprar y si no los tenemos, pide
  con naturalidad correo + nombre/apellido (y empresa si aplica) y los guarda con `guardar_lead`. No
  insiste, respeta el "no", no repregunta lo que ya tenemos. NUNCA pide RUC/cédula/factura (→ asesor).
- **CANAL (v26):** atiende POR WhatsApp → no manda al cliente a "escribir por WhatsApp" ni da el
  número de la tienda; al derivar, "un asesor te responde por aquí".
- **MODO ASISTENCIA (v31, se ANEXA al prompt vía `ASSIST_SUFFIX`):** cuando un asesor tiene el chat pero
  lleva rato sin responder y el cliente pregunta algo básico, el bot adelanta SOLO esa info de tienda
  (ubicación/horario/pago/envío/devolución) vía `info_tienda`, breve y deferente ("un asesor sigue con tu
  caso"); NO retoma la venta, NO da precios/productos, NO pide datos, NO toca pago/fiscal. La única tool
  disponible en este modo es `info_tienda`.
- **HANDOFF** y **LÍMITES** (no legal/médico, nada fuera de la tienda).

## Tools
- **`buscar_producto(consulta)`** — `GET ${STORE}/search/suggest.json?q=...`
  (`STORE=https://www.quickservicepanama.com`). **v21:** devuelve `{titulo, precio_usd,
  itbms_7pct, total_con_itbms, stock, marca, tipo, url}` (máx 5) — el **ITBMS (7%) se calcula en
  código** (el precio de Shopify es sin impuesto) y el **`stock`** se resuelve con **Shopify Admin
  GraphQL `totalInventory`** (>3 → "X unidades"; ≤3 → "un asesor verifica el inventario físico";
  sin token/falla → "un asesor confirma"). v10: si la consulta libre no encuentra, reintenta por
  número/código de modelo (G2170, 954…). **v18/v33:** cada código de modelo se prueba CON y SIN guion
  (`TN830XL` ↔ `TN-830XL`, `PT-H110` ↔ `PTH110`); `modelosEn` ahora capta también códigos que empiezan con
  dígito (140XL, 3253ci) y multi-segmento; intentos deduplicados. **v34:** la búsqueda incluye `tag` en
  `resources[options][fields]` → lee los **tags de compatibilidad** (impresora→consumible: "3253ci" →
  TK-8337). El prompt maneja sinónimos/línea, preguntas de categoría y **no inventa la marca** si no se la
  dieron (v33).
- **`info_tienda(tema?)`** (Fase 1.5, desplegada) — lee `store_facts` y devuelve TODOS
  los pares `key→value` con valor (omite vacíos); si no hay datos, el bot deriva a un asesor.
- **`guardar_lead(email?, nombre?, apellido?, empresa?)`** (v25/v27, desplegada) — captura de lead
  PASIVA: escribe los atributos del cliente en WATI vía `updateContactAttributes` (reusa `email`,
  `nombre`, `apellido`, `empresa`, que ya existen en WATI). Valida el formato del email; el número se
  toma del contexto (no del modelo); NO acepta RUC/datos fiscales (anti-interrupción). El bot lee los
  atributos existentes del payload de WATI para no repreguntar. Telemetría: `job_log` `lead_capturado`.
  El email enriquece el CDP y ayuda a los vendedores a cotizar más rápido.
- **Visión (v19, desplegada — no es una tool, es entrada multimodal):** las imágenes del
  cliente (`type:image`, `owner=false`) se descargan de WATI (`descargarMediaWati`: campo
  `data` + `Authorization: Bearer WATI_API_TOKEN`, base64, límite ~3.5 MB) y se adjuntan al
  último mensaje de usuario para Claude vision. Si la descarga falla → el bot pide el modelo
  o deriva. Telemetría: `job_log` `imagen_procesada` / `imagen_no_descargada`.

## Variables de entorno / secretos (en Supabase Edge Function secrets — NO en el repo)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WATI_API_TOKEN`,
`WATI_API_BASE`, `COPILOT_MODE` (shadow|live, default **shadow**),
`COPILOT_LIVE_ALLOWLIST` (`wa_id` permitidos en live; vacío = nadie, `all`/`*` = todos),
`COPILOT_MODEL` (default del código `claude-haiku-4-5`; en producción `claude-sonnet-4-6`),
`COPILOT_WEBHOOK_KEY` (guard del `?key=`), **`SHOPIFY_ADMIN_TOKEN`** + **`SHOPIFY_ADMIN_API_BASE`**
(v21 — inventario real vía Admin GraphQL; app de Shopify de **solo lectura** `read_products`+`read_inventory`;
base `https://quick-service-supplies.myshopify.com/admin/api/2025-10`; si faltan, el `stock` cae a
"un asesor confirma"). **`RESOLVE_SECRET`** (v28/v30 — guard del endpoint GET `?ref_code=`; el CDP lo lee
por `Authorization: Bearer`; si falta, el endpoint da 403). **`COPILOT_HANDOFF_ASSIST_MIN`** (v31, default
**15**) y **`COPILOT_HANDOFF_COLD_HOURS`** (v31, default **24**) — umbrales del ciclo de vida del handoff.
El healthcheck expone `inventario_configurado`, `resolve_configured`, `handoff_assist_min`, `handoff_cold_hours`.

> ⚠️ **OJO — no cruzar `COPILOT_MODE` con `COPILOT_MODEL`** (pasó 3 veces): el ID del
> modelo (`claude-…`) va SIEMPRE en `COPILOT_MODE**L**` (la L = modeLo). `COPILOT_MODE`
> es solo `live` o `shadow`. Si se cruzan, `MODE` deja de ser `live` y el bot queda
> mudo (`live_targets:0`). **(v20)** Ya no es catastrófico: un `COPILOT_MODE` inválido cae a
> `shadow` (no rompe los inserts como antes — eran 23 errores/día) y el healthcheck muestra
> `mode_raw` con el valor crudo para detectarlo. Verificar siempre el healthcheck tras tocar secretos.

## Guardrails (NO romper)
- **MODO SOMBRA es el default del código.** Hoy el secreto está en `live`+`all`, pero si
  faltara `COPILOT_MODE` el código cae a sombra (no envía). Cualquier cambio que pueda
  alterar a quién/si se le manda = avisar antes.
- **Anti-interrupción es sagrada:** mejor no contestar que cortar una venta humana.
  (1) **v15:** owner=true → `status='handoff'`, el bot no retoma solo. (2) Guardrail
  PRE-LLM `INTERRUPT_RE` que ABSTIENE ante trámites/pagos/datos fiscales. (3) **v20:**
  re-chequeo de `status='handoff'` JUSTO antes de enviar (anti-carrera: si un asesor entró
  durante los ~8s del LLM, el bot no la pisa). El bot NUNCA captura ni repite RUC/datos de
  factura/pago.
- **Ciclo de vida del handoff dentro de los límites (v31):** el bot puede asistir/retomar conversaciones
  en handoff, pero SIN romper la anti-interrupción. `INTERRUPT_RE` (pago/fiscal/trámite) bloquea TANTO la
  asistencia COMO el cold-return (un mensaje de trámite en handoff sigue silencioso). La asistencia solo
  responde info de tienda (única tool `info_tienda`), nunca retoma la venta ni saca de handoff. El reloj
  mide desde el último mensaje del asesor (`model='human-agent'`); si el asesor vuelve a escribir,
  `owner=true` regresa a handoff y el anti-carrera lo protege. La respuesta de asistencia se marca
  `model='assist-handoff'` para que el anti-eco la reconozca (no resetea el reloj, no dispara handoff falso).
- **Anti-duplicado (v20):** en ráfaga, solo el ÚLTIMO mensaje del cliente recibe respuesta
  (chequeo pre/post LLM de "¿hay uno más nuevo?") → no más respuestas dobles/triples.
- **MODE a prueba de typos (v20):** `COPILOT_MODE` inválido → `shadow` (no rompe los inserts);
  `mode_raw` en el healthcheck delata el cruce.
- **Resiliencia (v23):** ante fallo de la API (429/500/529), `maxRetries=3` + **respuesta de
  respaldo** (nunca dejar al cliente en silencio); respeta live/anti-duplicado/handoff.
- **Anti-eco (v13):** un `owner=true` que sea el eco de un envío propio del bot NO se
  trata como humano (evita que el bot se auto-abstenga / se ponga en handoff en live).
- **Captura de lead dentro de los límites (v25/v27):** `guardar_lead` solo guarda datos livianos
  (email/nombre/apellido/empresa); NUNCA RUC/factura (la tool ni los acepta como parámetros). Es
  pasiva (no insiste). **Canal (v26):** el bot no redirige al cliente a WhatsApp (ya está ahí).
- **Auto-expose OFF** en este proyecto → toda tabla nueva necesita `GRANT` manual a
  `service_role` (si no, la función da `permission denied`).
- **RLS on sin policies** = solo `service_role`. El `?key=` es obligatorio.
- Dedup por `wati_message_id`; tope `MAX_TURNS_DIA=40`.
- Deploy con `verify_jwt=false` (es un webhook público guardado por `?key=`).

## Despliegue
**Vía recomendada (CLI, byte-exacto desde disco):** desde la raíz del repo, en la máquina del usuario,
`git pull` + **`.\deploy.ps1`** (Windows) — corre `npx supabase functions deploy copilot-webhook
--project-ref jbigmlcalcwiphqeudxd --no-verify-jwt` y verifica el healthcheck. Requiere `npx supabase
login` una sola vez (access token de https://supabase.com/dashboard/account/tokens). **Por qué CLI:** sube
el archivo TAL CUAL; ni el MCP ni el dashboard hacen eso (ambos pasan el contenido por un agente/editor que
puede truncarlo — pasó: un deploy por MCP con contenido inline truncado tumbó prod; el fix fue el CLI).
Alternativas: `mcp__Supabase__deploy_edge_function(project_id=jbigmlcalcwiphqeudxd, …, verify_jwt:false)`
desde el Claude LOCAL del usuario (el MCP de Supabase está bloqueado por la policy de red en la sesión
remota — `mcp.supabase.com` da 403), o el dashboard (raw de GitHub → editor → Verify JWT OFF → deploy).
⚠️ **`--no-verify-jwt`/Verify JWT OFF es obligatorio** (webhook público guardado por `?key=`; si queda en
true, WATI recibe 401). El SQL lo corre el usuario en el SQL Editor.
El webhook de WATI apunta a:
`https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<COPILOT_WEBHOOK_KEY>`.
Eventos WATI suscritos (necesarios): **Message Received**, **Session Message Sent**
(owner=true para detectar al asesor) y **New Contact Message Received**.

## Roadmap (próximas fases)
1. **Fase 1.5 — `info_tienda`: ✅ desplegada y `store_facts` aplicada** (17 datos reales).
   Opción futura: re-apuntar la fuente a un metaobjeto/páginas de Shopify para unificar
   con el "single source of truth" del proyecto SEO (qsp-cdp-docs).
2. **v19 — Visión / imágenes: ✅ desplegada y validada (2026-06-18).** El bot maneja
   `type:image` de clientes: descarga de WATI (campo `data`), Claude vision clasifica
   (producto → buscar en catálogo; pago/dato fiscal → abstenerse), nunca cotiza precio
   desde la imagen. Pendiente menor: extender a `type:document` (PDF) si hace falta; hoy
   los documentos se registran y se saltan.
3. **Compatibilidad impresora→consumible: ✅ resuelto el lado búsqueda en v34.** La compatibilidad ya
   vive en los **tags** de Shopify ("Canon PIXMA MG2110", "Kyocera TASKalfa 3253ci"…); v34 hizo que
   `suggest.json` los lea (`fields=…,tag`) → el bot encuentra el consumible por el modelo de la impresora.
   Pendiente opcional: sumar `body` (compatibilidad escrita solo en la descripción) y/o enriquecer
   `products/{handle}.json` para specs. NO se hace réplica completa de Shopify en Supabase (riesgo de datos
   viejos para un bot "no inventar"; precio/stock se mantienen en vivo).
4. **Debounce / anti-repetición: ✅ hecho en v20.** En ráfaga, solo el último mensaje del
   cliente contesta (chequeo pre/post LLM) → mata las respuestas dobles/triples. Sin timers:
   si llega uno más nuevo, el viejo se descarta antes de enviar (`descartado_superado`).
5. **Página web "Envíos al interior y recogida en sucursal"** (`web/envios-interior-sucursal.html`,
   45 sucursales) → ✅ **publicada** en Shopify (`/pages/envios-al-interior`). ✅ **2026-06-24:** URL
   puesta en `store_facts.sucursales_interior` y `store_facts.soporte_reparaciones` cargada (contactos
   de servicio técnico por marca, verificados). Ambos pendientes de este punto: hechos.
6. **Recall de productos:** ante combo agotado, ofrecer variantes/tintas individuales en
   stock en vez de derivar.
7. **Reseñas por WhatsApp** (generar volumen; tie-in con Klaviyo/CDP).
8. Omnichannel / cruce con identidad del CDP por `wa_id`. (Orquestador multi-modelo:
   evaluado y descartado por ahora — prematuro; un router por reglas solo si hace falta.)
9. **Folletos/fichas de equipos** (solo equipos, NO consumibles): specs/compatibilidad como
   descripción/metafield en Shopify (ya hay token Admin) → tool `ficha_producto`. **Medir primero**
   la demanda (cuántas veces el bot deriva por specs/compatibilidad) antes de construir. (Discutido
   2026-06-24: el usuario tiene PDFs de equipos; EN PAUSA hasta decidir descripción vs metafield y
   cómo cargar el contenido.)
10. **Captura de lead** (correo/nombre/apellido/empresa) en atributos de WATI → ✅ **HECHA en v25/v27**
    (pasiva, dentro del agente actual, sin pedir datos fiscales; `guardar_lead`). Pendiente: el puente
    **WATI→CDP** (evaluando **Make**) para que el dato capturado enriquezca el CDP automáticamente.
11. **Feriados** en la lógica de horario: ✅ **HECHO en v37** (fijos por mes/día + Carnaval/Viernes Santo
    calculados desde la Pascua con Meeus/Jones/Butcher → correcto cualquier año, sin mantenimiento).
12. **Puente WhatsApp→web por `ref_code` (v28–v30): ✅ mitad del copiloto lista** (emite + guarda +
    expone). Pendiente del lado **CDP**: el resolver inverso (leer el endpoint → enriquecer `contacts`) +
    entregar `RESOLVE_SECRET` por canal seguro. Opcional copiloto: purga `pg_cron` de `ref_codes` ≥90 d.
    Contrato: `docs/handoff-cdp-ref-code-bridge.md`.
13. **Ciclo de vida del handoff (v31): ✅ hecho** (asistencia ≥15 min + cold-return >24 h, reactivo).
    Pendiente/futuro: (a) medir en prod (cuántas asistencias/cold-returns, falsos positivos) y calibrar
    umbrales; (b) extender cold-return a handoffs por keyword (hoy solo cuando hubo un asesor real);
    (c) afinar `BASIC_INFO_RE` según lo que pregunten de verdad.

## Cómo leer el estado real (debugging)
- Código en vivo: `get_edge_function` o healthcheck GET. Esquema: `list_tables`.
- Calidad/telemetría: `select mode, model, tokens_in, tokens_out, latency_ms from
  public.messages order by created_at desc` y `select * from public.job_log order
  by created_at desc`.
- Ahorro del prompt caching (v38): `select count(*) turnos, round(avg(tokens_in)) avg_in,
  round(avg(cache_read_input_tokens)) avg_cread, round(avg(cache_creation_input_tokens)) avg_cwrite,
  round(100.0*sum(cache_read_input_tokens)/nullif(sum(tokens_in+coalesce(cache_read_input_tokens,0)+coalesce(cache_creation_input_tokens,0)),0),1) pct_leido_de_cache
  from public.messages where model='claude-sonnet-4-6' and created_at >= now() - interval '1 day';`
  El **$ de input** ≈ `(tokens_in*1 + cache_read*0.1 + cache_creation*1.25)/1e6 * $3`.
- Devolver una conversación del humano al bot: `update public.conversations set
  status='bot' where wa_id='<numero>';` (v31: el bot ya lo hace solo tras 24 h sin asesor).
- Ciclo de vida del handoff (v31): `select * from public.job_log where action in
  ('handoff_cold_return','asistencia_handoff') order by created_at desc;` (el `detail` trae
  `horas_sin_humano` / `mins_sin_humano` / `enviado` / `motivo`).
- Análisis de sombra (categorías de mensajes, prompt v2): doc
  `2026-06-13-copilot-analisis-sombra-prompt-v2.md` en qsp-cdp-docs.
