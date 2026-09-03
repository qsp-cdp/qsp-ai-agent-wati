# deploy.ps1 — NEUTRALIZADO el 2026-08-27 (hallazgo P0 de la auditoría integral).
#
# ⛔ ESTE SCRIPT YA NO DESPLIEGA. Aborta a propósito.
#
# POR QUÉ: producción ya NO corre esta rama. Desde el 19-ago el código vivo está en la rama
# `claude/supabase-agent-review-tvvg61` (copiloto v119.1+) y se despliega SOLO por GitHub Actions
# (workflow `deploy-copilot.yml`: cada push a esa rama que toque `supabase/functions/**` sale a prod).
#
# Esta rama quedó como archivo histórico (v73.1). Si este script siguiera funcionando, un
# `git pull` + `.\deploy.ps1` de memoria muscular pisaría 8 funciones de prod con código de hace
# semanas: el copiloto retrocedería v119→v73, shopify-webhook perdería v63-v68 (HMAC, flags de zona,
# rescate de envío gratis), RESUCITARÍA wati-address (retirada de prod el 21-ago, hoy responde 410)
# y pisaría contacts-lookup v2 con una v1 de 22 líneas — rompiendo el flujo de WATI que consume
# `envio_texto`. Nada más lo impedía: la protección de rama no aplica a `supabase functions deploy`.
#
# CÓMO SE DESPLIEGA HOY:
#   1. Trabajar en la rama `claude/supabase-agent-review-tvvg61`.
#   2. Commit + push — GitHub Actions despliega lo que cambió (siempre con --no-verify-jwt).
#
# EMERGENCIA REAL (CI caído y hay que desplegar a mano): hazlo consciente, función por función,
# DESDE LA RAMA NUEVA, nunca desde esta:
#   npx supabase functions deploy <funcion> --project-ref jbigmlcalcwiphqeudxd --no-verify-jwt

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Red
Write-Host "  DEPLOY BLOQUEADO — esta rama (v73.1) ya NO es la que corre en produccion." -ForegroundColor Red
Write-Host "==============================================================================" -ForegroundColor Red
Write-Host ""
Write-Host "  Produccion corre la rama:  claude/supabase-agent-review-tvvg61  (copiloto v119.1+)" -ForegroundColor Yellow
Write-Host "  Se despliega SOLO por GitHub Actions: push a esa rama => deploy automatico." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Si este script hubiera corrido, habria retrocedido el copiloto 46 versiones y" -ForegroundColor Yellow
Write-Host "  roto la captura de direcciones de WATI. Por eso ahora aborta (auditoria 27-ago)." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Detalle: docs/auditoria-2026-08-27/README.md" -ForegroundColor Cyan
Write-Host ""
exit 1
