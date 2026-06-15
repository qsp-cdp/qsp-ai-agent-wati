# qsp-ai-agent-wati — Copiloto AI de WhatsApp (WATI) · Quick Service Panamá

Asistente de IA dentro de **WATI** (WhatsApp, ~90% de las ventas de QSP). Contesta
preguntas generales, indica disponibilidad/stock y da precio. Hoy en **MODO SOMBRA**
(registra lo que respondería; no envía).

> **Lee `CLAUDE.md`** para el contexto completo (arquitectura, decisiones,
> guardrails, roadmap). Es la fuente de verdad para trabajar este repo.

## Stack
- **Supabase** proyecto `jbigmlcalcwiphqeudxd` (qsp-wati-copilot) — separado del
  CDP. Edge function Deno/TS + Postgres.
- **Anthropic** Claude Haiku 4.5 (chat + tool use).
- **WATI** (webhooks de WhatsApp).

## Estructura
```
CLAUDE.md                                  # contexto autoritativo (leer primero)
supabase/
  functions/copilot-webhook/index.ts       # la edge function (v7, = lo desplegado)
  migrations/*.sql                          # esquema reproducible (5 migraciones)
```

## Estado
- Edge function `copilot-webhook` **v7, ACTIVE, MODO SOMBRA**.
- 102 conversaciones / 865 mensajes loggeados. Haiku 4.5, ~$0.003/turno, ~4 s.

## Desarrollo / deploy
- Secretos van en **Supabase Edge Function secrets** (NO en el repo): `ANTHROPIC_API_KEY`,
  `WATI_API_TOKEN`, `WATI_API_BASE`, `COPILOT_MODE` (shadow|live), `COPILOT_MODEL`,
  `COPILOT_WEBHOOK_KEY`.
- Deploy: `supabase functions deploy copilot-webhook --no-verify-jwt` (o vía MCP
  de Supabase con `verify_jwt:false`).
- Webhook WATI →
  `https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<COPILOT_WEBHOOK_KEY>`.

## Guardrails (no romper)
**Modo sombra por defecto** (no enviar a clientes sin encender `COPILOT_MODE=live`
a propósito) · anti-interrupción (no cortar ventas humanas) · GRANT manual a
`service_role` en tablas nuevas (auto-expose OFF) · guard `?key=` obligatorio.

## Procedencia
Paquete base generado el 2026-06-15 desde el estado real en producción. Docs de
diseño y bitácora en el repo `qsp-cdp/qsp-cdp-docs` (`docs/design/2026-06-12-proyecto-copilot-wati.md`,
`docs/design/2026-06-13-copilot-analisis-sombra-prompt-v2.md`).
