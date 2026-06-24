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
  functions/copilot-webhook/index.ts       # la edge function (v27, = lo desplegado)
  migrations/*.sql                          # esquema reproducible (6 migraciones)
web/
  envios-interior-sucursal.html            # página de envíos al interior (45 sucursales)
```

## Estado
- Edge function `copilot-webhook` **v27 (`v27-nombre-apellido`), ACTIVE** — EN VIVO a todos, en
  Sonnet 4.6. Coexistencia validada (v15) · visión (v19) · endurecimiento anti-duplicado /
  anti-carrera / MODE-seguro (v20).
- **v21:** ITBMS (precio + 7% + total, calculado en código) + inventario real (Shopify Admin
  `totalInventory`; ≤3 → "un asesor verifica") + anti-eco duro (se acabaron los handoffs falsos).
- **v22:** conciencia de horario (atención Lun-Vie 9am-5pm, Panamá) — fuera de horario aclara
  cuándo responde un asesor.
- **v23:** resiliencia ante fallos de API (reintentos + respuesta de respaldo; no deja al cliente en silencio).
- **v24:** venta consultiva (asesora con preguntas de intake, sin aflojar la regla de oro).
- **v25:** buscar antes de negar (catálogo completo, no solo impresión) + captura de lead pasiva (`guardar_lead` → atributos de WATI).
- **v26:** conciencia de canal (no redirige al cliente a WhatsApp; ya está ahí).
- **v27:** captura también nombre y apellido (atributos de WATI), además de correo y empresa.
- Auditorías diarias: coexistencia perfecta (0 clientes pisados, 0 ecos falsos). ~$0.02/turno, ~8 s.

## Desarrollo / deploy
- Secretos van en **Supabase Edge Function secrets** (NO en el repo): `ANTHROPIC_API_KEY`,
  `WATI_API_TOKEN`, `WATI_API_BASE`, `COPILOT_MODE` (shadow|live),
  `COPILOT_LIVE_ALLOWLIST` (vacío = nadie, `all` = todos), `COPILOT_MODEL`,
  `COPILOT_WEBHOOK_KEY`, y (v21) `SHOPIFY_ADMIN_TOKEN` + `SHOPIFY_ADMIN_API_BASE` (inventario real).
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
