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
- **Anthropic** Claude Sonnet 4.6 (chat + tool use; evaluado contra Haiku 4.5 y Opus 4.8).
- **WATI** (webhooks de WhatsApp).

## Estructura
```
CLAUDE.md                                  # contexto autoritativo (leer primero)
supabase/
  functions/copilot-webhook/index.ts       # la edge function (v20, = lo desplegado)
web/
  envios-interior-sucursal.html            # página de envíos al interior (45 sucursales)
  migrations/*.sql                          # esquema reproducible (6 migraciones)
```

## Estado
- Edge function `copilot-webhook` **v20 (`v20-endurecimiento`), ACTIVE** — EN VIVO a todos,
  en Sonnet 4.6. Coexistencia validada (v15) · visión validada (v19). **v20:** tras auditar
  el 1er día live (101 convs, 0 clientes pisados), se endureció: anti-duplicado en ráfaga,
  anti-carrera (no pisar al asesor), `MODE` a prueba de typos, guard de prefill.
- `store_facts` aplicada (17 datos reales). Sonnet 4.6 ~$0.017/turno, ~8 s.

## Desarrollo / deploy
- Secretos van en **Supabase Edge Function secrets** (NO en el repo): `ANTHROPIC_API_KEY`,
  `WATI_API_TOKEN`, `WATI_API_BASE`, `COPILOT_MODE` (shadow|live),
  `COPILOT_LIVE_ALLOWLIST` (piloto; vacío = nadie, `all` = todos), `COPILOT_MODEL`,
  `COPILOT_WEBHOOK_KEY`.
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
