# deploy.ps1 — despliega las Edge Functions de forma BYTE-EXACTA desde disco (Supabase CLI) y verifica el
# healthcheck del copiloto. No re-escribe ni pega el contenido: el CLI sube los archivos tal cual y empaqueta
# los imports de `_shared/` (por eso las funciones de despacho NO se pueden desplegar por el dashboard/Browse).
#
# Uso (PowerShell, en la raíz del repo):
#   git pull
#   .\deploy.ps1                      # despliega las 4 funciones de v48
#   .\deploy.ps1 copilot-webhook      # o solo las que le pases por argumento
#
# Requisitos: estar logueado en el CLI (`npx supabase login`, una sola vez). El --no-verify-jwt es OBLIGATORIO:
# todas son webhooks públicos (el copiloto se protege por ?key=; las de despacho por HMAC/token propio); si
# verify_jwt queda en true, Shopify/Shipday/WATI reciben 401.
#
# Nota: wati-address y contacts-lookup NO cambiaron con v48 (no escriben `pedidos`), así que no hace falta
# redesplegarlas; agrégalas al comando si alguna vez cambian.

$ErrorActionPreference = "Stop"
$proj = "jbigmlcalcwiphqeudxd"
$url  = "https://$proj.functions.supabase.co/copilot-webhook"

# Funciones a desplegar: por defecto las 4 de v48; o las que pases como argumentos.
$funcs = if ($args.Count -gt 0) { $args } else { @("copilot-webhook", "shopify-webhook", "shipday-status", "wati-order") }

foreach ($fn in $funcs) {
  Write-Host "`n==> Desplegando $fn a $proj (verify_jwt OFF, byte-exacto desde disco)..." -ForegroundColor Cyan
  npx supabase functions deploy $fn --project-ref $proj --no-verify-jwt
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[X] El deploy de $fn FALLO (exit $LASTEXITCODE). Produccion NO cambio si el error fue antes de subir." -ForegroundColor Red
    exit 1
  }
  Write-Host "[OK] $fn desplegada." -ForegroundColor Green
}

# Healthcheck solo del copiloto (las de despacho son POST y no exponen GET).
if ($funcs -contains "copilot-webhook") {
  Write-Host "`n==> Verificando healthcheck de copilot-webhook (GET, sin key)..." -ForegroundColor Cyan
  Start-Sleep -Seconds 2
  $r = curl.exe -s --max-time 25 $url
  Write-Host $r

  if ($r -match "WORKER_ERROR") {
    Write-Host "`n[X] ALERTA: WORKER_ERROR — el deploy quedo roto (revisa que subio el index.ts real)." -ForegroundColor Red
    exit 1
  } elseif ($r -match '(?i)\bjwt\b|unauthorized|"code"\s*:\s*401') {
    Write-Host "`n[!] ALERTA: parece 401/JWT — verify_jwt quedo ON. Apagalo en el dashboard (Edge Functions ->" -ForegroundColor Yellow
    Write-Host "    copilot-webhook -> Details -> Enforce JWT verification OFF) o redeploy con --no-verify-jwt." -ForegroundColor Yellow
    exit 1
  } elseif ($r -match '"status"\s*:\s*"ok"') {
    $ver  = if ($r -match '"version"\s*:\s*"([^"]+)"') { $matches[1] } else { "?" }
    $mode = if ($r -match '"mode"\s*:\s*"([^"]+)"') { $matches[1] } else { "?" }
    Write-Host "`n[OK] copilot-webhook vivo. version=$ver, mode=$mode, verify_jwt=OFF (respondio sin key)." -ForegroundColor Green
  } else {
    Write-Host "`n[?] El healthcheck respondio algo inesperado (revisa el JSON de arriba)." -ForegroundColor Yellow
    exit 1
  }
}

Write-Host "`n==> Listo. Recuerda: la conciencia de pedidos requiere que un pedido REAL entre por Shopify/WATI/Shipday" -ForegroundColor Cyan
Write-Host "    para poblar `pedidos`; con la tabla vacia el bot responde 'sin_pedidos' y deriva (seguro)." -ForegroundColor Cyan
