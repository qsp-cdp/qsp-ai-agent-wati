# deploy.ps1 — despliega la edge function copilot-webhook de forma BYTE-EXACTA desde disco
# (Supabase CLI) y verifica el healthcheck. No re-escribe ni pega el contenido: sube el archivo tal cual.
#
# Uso (PowerShell, en la raíz del repo):
#   git pull
#   .\deploy.ps1
#
# Requisitos: estar logueado en el CLI (`npx supabase login`, una sola vez). El --no-verify-jwt es
# OBLIGATORIO: el webhook es público y se protege por ?key=; si verify_jwt queda en true, WATI recibe 401.

$ErrorActionPreference = "Stop"
$proj = "jbigmlcalcwiphqeudxd"
$fn   = "copilot-webhook"
$url  = "https://$proj.functions.supabase.co/$fn"

Write-Host "==> Desplegando $fn a $proj (verify_jwt OFF, byte-exacto desde disco)..." -ForegroundColor Cyan
npx supabase functions deploy $fn --project-ref $proj --no-verify-jwt
if ($LASTEXITCODE -ne 0) {
  Write-Host "`n[X] El deploy FALLO (exit $LASTEXITCODE). Produccion NO cambio si el error fue antes de subir." -ForegroundColor Red
  exit 1
}

Write-Host "`n==> Verificando healthcheck (GET, sin key)..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
$r = curl.exe -s --max-time 25 $url
Write-Host $r

if ($r -match "WORKER_ERROR") {
  Write-Host "`n[X] ALERTA: WORKER_ERROR — el deploy quedo roto (revisa que subio el index.ts real)." -ForegroundColor Red
  exit 1
} elseif ($r -match '(?i)\bjwt\b|unauthorized|"code"\s*:\s*401') {
  Write-Host "`n[!] ALERTA: parece 401/JWT — verify_jwt quedo ON. Apagalo en el dashboard (Edge Functions ->" -ForegroundColor Yellow
  Write-Host "    $fn -> Details -> Enforce JWT verification OFF) o redeploy con --no-verify-jwt." -ForegroundColor Yellow
  exit 1
} elseif ($r -match '"status"\s*:\s*"ok"') {
  $ver = if ($r -match '"version"\s*:\s*"([^"]+)"') { $matches[1] } else { "?" }
  $mode = if ($r -match '"mode"\s*:\s*"([^"]+)"') { $matches[1] } else { "?" }
  Write-Host "`n[OK] Desplegado y vivo. version=$ver, mode=$mode, verify_jwt=OFF (respondio sin key)." -ForegroundColor Green
} else {
  Write-Host "`n[?] El healthcheck respondio algo inesperado (revisa el JSON de arriba)." -ForegroundColor Yellow
  exit 1
}
