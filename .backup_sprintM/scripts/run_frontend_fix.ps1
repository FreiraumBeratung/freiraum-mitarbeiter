$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
$FRONT = Join-Path $ROOT "frontend\fm-app"
$LOGDIR = Join-Path $ROOT "logs"
$REPORT = Join-Path $ROOT "exports\FRONTEND_FIX_REPORT.md"

if (!(Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR | Out-Null }
if (!(Test-Path (Join-Path $ROOT "exports"))) { New-Item -ItemType Directory -Path (Join-Path $ROOT "exports") | Out-Null }
Set-Content -Path $REPORT -Value "## FRONTEND FIX REPORT`n**Zeit:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n" -Encoding UTF8

# Node prüfen
try {
  $nodeV = (node -v)
  Add-Content $REPORT "`n- Node gefunden: $nodeV"
  Write-Host "Node: $nodeV" -ForegroundColor Green
} catch {
  Add-Content $REPORT "`n- [FAIL] Node nicht gefunden. Bitte Node 20+ installieren: https://nodejs.org"
  Write-Host "[FAIL] Node fehlt" -ForegroundColor Red
  exit 1
}

# Install
Set-Location $FRONT
Write-Host "Installiere Dependencies..." -ForegroundColor Yellow
if (Test-Path ".\package-lock.json") {
  npm ci 1>>"$LOGDIR\frontend.out.log" 2>>"$LOGDIR\frontend.err.log"
} else {
  npm install 1>>"$LOGDIR\frontend.out.log" 2>>"$LOGDIR\frontend.err.log"
}
Add-Content $REPORT "`n- Dependencies installiert."

# Port freimachen
$port = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($port) {
  Stop-Process -Id $port.OwningProcess -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

# Dev versuchen, Fallback Preview
Write-Host "Starte Dev-Server..." -ForegroundColor Yellow
$dev = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm","run","dev","--","--port","5173" -NoNewWindow -PassThru `
  -RedirectStandardOutput "$LOGDIR\frontend.out.log" -RedirectStandardError "$LOGDIR\frontend.err.log"

Start-Sleep -Seconds 6
# Health-Check
$ok = $false
for ($i=0; $i -lt 10; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $ok = $true; break }
  } catch { Start-Sleep -Seconds 1 }
}

if (-not $ok) {
  Add-Content $REPORT "`n- Dev-Server reagiert nicht → versuche Fallback 'vite preview'."
  Write-Host "Dev-Server reagiert nicht, baue und starte Preview..." -ForegroundColor Yellow
  try { if ($dev) { Stop-Process -Id $dev.Id -Force -ErrorAction SilentlyContinue } } catch {}
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx","vite","build" -NoNewWindow -Wait `
    -RedirectStandardOutput "$LOGDIR\frontend.out.log" -RedirectStandardError "$LOGDIR\frontend.err.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx","vite","preview","--port","5173" -NoNewWindow -PassThru `
    -RedirectStandardOutput "$LOGDIR\frontend.out.log" -RedirectStandardError "$LOGDIR\frontend.err.log"
  Start-Sleep -Seconds 3
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $ok = $true }
  } catch {}
}

if ($ok) {
  Add-Content $REPORT "`n- UI erreichbar: http://localhost:5173 [OK]"
  Write-Host "`n[OK] UI erreichbar: http://localhost:5173" -ForegroundColor Green
} else {
  Add-Content $REPORT "`n- UI weiterhin nicht erreichbar [FAIL]. Siehe logs\frontend.err.log"
  Write-Host "`n[FAIL] UI nicht erreichbar. Siehe logs\frontend.err.log" -ForegroundColor Red
}

Write-Host "`nReport: $REPORT" -ForegroundColor Cyan

