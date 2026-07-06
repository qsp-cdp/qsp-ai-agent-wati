# qsp-ai-agent-wati — Copiloto AI de WhatsApp (WATI) · Quick Service Panamá

Asistente de IA dentro de **WATI** (WhatsApp, ~90% de las ventas de QSP). Apoya al
equipo humano: contesta preguntas generales, indica disponibilidad/stock y da precio,
y calla/deriva cuando es mejor que responda un humano. **EN VIVO a todos los clientes**
(`COPILOT_MODE=live`, `COPILOT_LIVE_ALLOWLIST=all`); el default del código sigue siendo
sombra por seguridad.

> **Lee `CLAUDE.md`** para el contexto completo (arquitectura, decisiones,
> guardrails, roadmap). Es la fuente de verdad para trabajar este repo.

## Stack
- **Supabase** proyecto `jbigmlcalcwiphqeudxd` (qsp-wati-copilot) — separado del
  CDP. Edge function Deno/TS + Postgres.
- **Anthropic** Claude Sonnet 4.6 (chat + tool use + visión; evaluado contra Haiku 4.5 y Opus 4.8).
- **Shopify** — storefront `suggest.json` (búsqueda) + Admin GraphQL (`totalInventory` = stock real).
- **WATI** (webhooks de WhatsApp; envío + descarga de imágenes).

## Estructura
```
CLAUDE.md                                  # contexto autoritativo (leer primero)
docs/base-conocimiento-qsp.md              # base de conocimiento del negocio (fuente → prompt + store_facts)
supabase/
  functions/copilot-webhook/index.ts       # la edge function (v46 en repo; v45 EN VIVO, probando Sonnet 5)
tests/golden.mjs                            # golden tests (regex + helpers, extraídos del index.ts real) — node tests/golden.mjs
  migrations/*.sql                          # esquema reproducible (8 migraciones)
deploy.ps1                                  # deploy byte-exacto por CLI + verificación de healthcheck
web/
  envios-interior-sucursal.html            # página de envíos al interior (45 sucursales)
```

## Estado
- Edge function `copilot-webhook` **v45 (`v45-endurecimiento-quirurgico`), ACTIVE** — EN VIVO a todos (incluye
  v40–v44: `.trim()` a secretos, trato de usted, guardrails, sucursales del interior, autotest de inventario,
  guard anti-fuga). Coexistencia validada (v15) · visión (v19) · endurecimiento anti-duplicado / anti-carrera /
  MODE-seguro (v20). **Probando Claude Sonnet 5** (`COPILOT_MODEL=claude-sonnet-5`; revertir = flipear a 4.6).
  **Inventario RESUELTO (01-jul):** confirmado con clientes reales. **`COPILOT_WEBHOOK_KEY` endurecida (02-jul):**
  secreto real + WATI actualizado, verificado con tráfico en vivo. **v46 en repo, listo para desplegar.**
- **v21:** ITBMS (precio + 7% + total, calculado en código) + inventario real (Shopify Admin
  `totalInventory`; ≤3 → "un asesor verifica") + anti-eco duro (se acabaron los handoffs falsos).
- **v22:** conciencia de horario (atención Lun-Vie 9am-5pm, Panamá) — fuera de horario aclara
  cuándo responde un asesor.
- **v23:** resiliencia ante fallos de API (reintentos + respuesta de respaldo; no deja al cliente en silencio).
- **v24:** venta consultiva (asesora con preguntas de intake, sin aflojar la regla de oro).
- **v25:** buscar antes de negar (catálogo completo, no solo impresión) + captura de lead pasiva (`guardar_lead` → atributos de WATI).
- **v26:** conciencia de canal (no redirige al cliente a WhatsApp; ya está ahí).
- **v27:** captura también nombre y apellido (atributos de WATI), además de correo y empresa.
- **v28–v30:** puente WhatsApp→web por `ref_code` (link de producto con apex + UTMs + code opaco;
  tabla `ref_codes` + endpoint de resolución por `Bearer` para el CDP). Ver `docs/handoff-cdp-ref-code-bridge.md`.
- **v31:** ciclo de vida del handoff — el bot deja de quedarse mudo para siempre. Tras ≥15 min sin asesor
  ASISTE con info básica de tienda (sigue en handoff); tras >24 h RETOMA la conversación (`status→bot`).
  Reactivo, con la anti-interrupción intacta (pago/fiscal nunca lo dispara).
- **v32:** conciencia temporal — el bot sabe la fecha/hora actual y cada mensaje del historial viene
  marcado (`[hoy …]`/`[ayer …]`); ya no mezcla lo de ayer con lo de hoy (no más "le esperamos mañana"
  cuando el cliente viene hoy).
- **v33:** extracción de modelo robusta — captura códigos que empiezan con dígito (140XL, 3253ci) y los
  multi-segmento con guion (PT-H110 → prueba PTH110); arregla búsquedas que fallaban por el guion.
- **v34:** la búsqueda lee los **tags de compatibilidad** de Shopify (`fields=…,tag`) → el bot encuentra
  el consumible por el modelo de la impresora (ej. "3253ci" → tóner TK-8337). Probado contra la tienda.
- **v35:** prompt caching — el `system` se parte en un bloque estático cacheado (`SYSTEM_PROMPT` + tools,
  `cache_control:ephemeral`) y un 2º bloque volátil sin cachear (la hora actual de v32, contexto de turno).
  Abarata el input sin cambiar el comportamiento. **Confirmado en prod: `avg(tokens_in)` ~9.554 → ~2.337 (−75%).**
- **v36:** el "próximo horario hábil" se calcula en código (`proximoHorarioHabil`) en vez de pedírselo al
  LLM — arregla el bug de que a la 1am del martes derivaba a "mañana" (1 de julio) en vez de "hoy" (martes 30)
  a las 9am. Determinista, cubre antes/después de horario, fin de semana y rollover.
- **v37:** feriados nacionales de Panamá en la lógica de horario. Fijos por mes/día +
  Carnaval/Viernes Santo calculados desde la Pascua (Meeus/Jones/Butcher) → correcto cualquier año, sin
  mantenimiento. En un feriado la tienda está cerrada y el "próximo horario hábil" salta al siguiente día
  laborable (incluye feriados consecutivos como Carnaval). Probado contra la lista oficial 2026 (14/14).
- **v38:** telemetría de prompt caching — persiste `cache_read_input_tokens` / `cache_creation_input_tokens`
  por turno en `messages` (solo medición). **Confirmado en prod: ~−69% de costo de input real** (lecturas de
  caché a 0.1×).
- **v39:** prep para probar **Claude Sonnet 5** — fija `thinking:{type:"disabled"}` (no-op en 4.6; evita que
  Sonnet 5 encienda adaptive thinking solo). Se prueba cambiando solo `COPILOT_MODEL=claude-sonnet-5` (intro
  $2/$10 hasta 2026-08-31, tokenizer +30%; A/B con la telemetría de v38).
- **v40 (en v41):** `.trim()` defensivo a los secretos que se pegan a mano
  (`SHOPIFY_ADMIN_TOKEN`/`SHOPIFY_ADMIN_API_BASE`/`COPILOT_MODEL`). Fix del inventario: un espacio en el token
  de Shopify lo hacía rechazar (401) → el bot derivaba en vez de dar la cantidad real.
- **v41:** trato de **usted**, español de Panamá amable y profesional, **sin voseo** (el bot salía con
  "vos/tenés/seguí", que no es de Panamá — más notorio con Sonnet 5). Regla de estilo explícita + limpieza del
  voseo en las instrucciones y textos fijos.
- **v42 (en v43):** endurecimiento de guardrails tras **auditar tráfico real en Sonnet 5**
  (grounding/coexistencia sólidos). Cierra 3 huecos: (1) no ofrecer genéricos/alternativas que la búsqueda no
  devolvió; (2) no inventar specs (rendimiento/velocidad) que la tool no trae; (3) anti-interrupción ante
  intención de pagar/transferir/coordinar entrega. Solo prompt + `INTERRUPT_RE` (probado 22/22).
- **v43:** tool `sucursales_interior(lugar)` con las **45 sucursales del interior**
  (red Servientrega, provincia/nombre/teléfono/horario del listado oficial) → el bot da el punto de recogida
  **grounded** en vez de adivinar; el modelo enruta la geografía (David→Chiriquí), los datos salen de la lista.
- **v44 (desplegado 01-jul):** (a) **autotest de inventario** — `GET ?key=…&selftest=inventario` corre la
  consulta Admin `totalInventory` desde adentro y reporta por qué el stock no aparece (token inválido vs falta
  el scope `read_inventory` vs base mal), sin exponer el token; **confirmó el fix** (`ok_inventario_visible`,
  PG-145XL=87 → el problema era un token viejo; el nuevo + el restart del deploy lo resolvió). (b) **guard
  anti-fuga de tool-call** — si el modelo escribe la llamada como texto (visto en Sonnet 5), no se envía el
  XML: va la respuesta de respaldo.
- **v45 (desplegado 02-jul):** endurecimiento quirúrgico (auditoría 02-jul + consultoría externa
  contrastada): fix del eco de la despedida de handoff (asesor fantasma), políticas comerciales sin fuente ni
  se afirman ni se niegan, SKU sueltos (W1105A, BA1U5LA#ABM…) fuerzan `buscar_producto`, garantía/devolución
  GENERAL → `info_tienda` (el reclamo sigue a humano, sesgo conservador), `.trim()` a todos los secretos,
  menos PII en `job_log`, tope de payload, `tests/golden.mjs`. Endurecido con una revisión
  adversarial pre-deploy (2 regresiones mayores halladas y corregidas).
- **v46 (listo para desplegar):** un cliente en Santiago preguntó por sucursal y el bot dijo *"tenemos el
  punto CDS Santiago…"* — sonaba a tienda propia de QSP en vez de explicar el envío por Servientrega. Fix de
  PROMPT (no de código: la tool ya traía todo): arma la respuesta como "puede enviarlo a [ciudad] y
  retirarlo en el punto Servientrega [nombre]"; prohíbe explícitamente "tenemos el punto/sucursal en…". De
  paso, la página `web/envios-interior-sucursal.html` tenía el mismo "tenemos 45 puntos" → corregido.
  `tests/golden.mjs` (112 casos verdes, 2 nuevos que guardan esta regresión). Correr `node tests/golden.mjs`
  antes de cada deploy.
- Auditorías diarias: coexistencia perfecta (0 clientes pisados, 0 ecos falsos). Con Sonnet 5 + caching:
  ~$0.01/turno, ~8 s (02-jul: 119 turnos = $1.17).

## Desarrollo / deploy
- Secretos van en **Supabase Edge Function secrets** (NO en el repo): `ANTHROPIC_API_KEY`,
  `WATI_API_TOKEN`, `WATI_API_BASE`, `COPILOT_MODE` (shadow|live),
  `COPILOT_LIVE_ALLOWLIST` (vacío = nadie, `all` = todos), `COPILOT_MODEL`,
  `COPILOT_WEBHOOK_KEY`, (v21) `SHOPIFY_ADMIN_TOKEN` + `SHOPIFY_ADMIN_API_BASE` (inventario real),
  (v28) `RESOLVE_SECRET` (guard del endpoint `?ref_code=` para el CDP), y (v31, opcionales)
  `COPILOT_HANDOFF_ASSIST_MIN` (15) + `COPILOT_HANDOFF_COLD_HOURS` (24).
- Deploy: `supabase functions deploy copilot-webhook --no-verify-jwt` (o vía MCP
  de Supabase con `verify_jwt:false`; si está gated, copiar el `index.ts` desde el raw
  de GitHub al editor del dashboard con Verify JWT OFF).
- Webhook WATI →
  `https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<COPILOT_WEBHOOK_KEY>`.

## Guardrails (no romper)
**Modo sombra por defecto** (no enviar a clientes sin encender `COPILOT_MODE=live`
a propósito; en live, el `COPILOT_LIVE_ALLOWLIST` limita a quién se envía) ·
anti-interrupción (no cortar ventas humanas) · anti-eco (no confundir el envío propio
con un humano) · GRANT manual a `service_role` en tablas nuevas (auto-expose OFF) ·
guard `?key=` obligatorio.

## Procedencia
Paquete base generado el 2026-06-15 desde el estado real en producción. Docs de
diseño y bitácora en el repo `qsp-cdp/qsp-cdp-docs` (`docs/design/2026-06-12-proyecto-copilot-wati.md`,
`docs/design/2026-06-13-copilot-analisis-sombra-prompt-v2.md`).
