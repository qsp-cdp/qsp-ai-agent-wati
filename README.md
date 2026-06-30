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
  functions/copilot-webhook/index.ts       # la edge function (v41 en repo, incluye v40; v39 = lo desplegado, probando Sonnet 5)
  migrations/*.sql                          # esquema reproducible (8 migraciones)
deploy.ps1                                  # deploy byte-exacto por CLI + verificación de healthcheck
web/
  envios-interior-sucursal.html            # página de envíos al interior (45 sucursales)
```

## Estado
- Edge function `copilot-webhook` **v39 (`v39-thinking-off`), ACTIVE** — EN VIVO a todos.
  Coexistencia validada (v15) · visión (v19) · endurecimiento anti-duplicado / anti-carrera / MODE-seguro
  (v20). **Probando Claude Sonnet 5** (`COPILOT_MODEL=claude-sonnet-5`; revertir = flipear a 4.6).
  **v41 (`v41-trato-usted`) está en el repo, listo para `deploy.ps1`** — incluye el fix de inventario de v40
  (`.trim()` al token de Shopify) + trato de usted (sin voseo). Un solo deploy aplica ambos.
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
- **v41 (listo para desplegar):** trato de **usted**, español de Panamá amable y profesional, **sin voseo**
  (el bot salía con "vos/tenés/seguí", que no es de Panamá — más notorio con Sonnet 5). Regla de estilo
  explícita + limpieza del voseo en las instrucciones y textos fijos. Solo registro, no toca guardrails.
- Auditorías diarias: coexistencia perfecta (0 clientes pisados, 0 ecos falsos). ~$0.02/turno, ~8 s.

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
