$ErrorActionPreference = "Stop"

$PORT_BACKEND = 30521
$PORT_FRONTEND = 5173
$ROOT = Join-Path $env:USERPROFILE "Desktop\freiraum-mitarbeiter"
$DATA = Join-Path $ROOT "data"
$EXPORTS = Join-Path $DATA "exports"

function Kill-Port { param([int]$Port)
  try {
    $pid = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
    if ($pid) { Stop-Process -Id $pid -Force; Start-Sleep -Milliseconds 250 }
  } catch { }
}

Write-Host "Freeing ports..." -ForegroundColor Yellow
Kill-Port -Port $PORT_BACKEND
Kill-Port -Port $PORT_FRONTEND

New-Item -ItemType Directory -Force -Path $DATA | Out-Null
New-Item -ItemType Directory -Force -Path $EXPORTS | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ROOT "scripts") | Out-Null

Set-Location $ROOT
if (!(Test-Path ".\.venv")) { python -m venv .venv }
& .\.venv\Scripts\Activate.ps1

if (Test-Path ".\backend\requirements.txt") {
  python -m pip install --upgrade pip
  pip install -r .\backend\requirements.txt
} else {
  pip install fastapi uvicorn sqlalchemy pydantic requests beautifulsoup4 lxml openpyxl python-dateutil
}

$env:FREIRAUM_DATA_DIR = $DATA
$env:FM_BASE_URL = "http://localhost:$PORT_BACKEND/api"

# Backend starter
$backendPath = Join-Path $ROOT "scripts\run_backend.ps1"
@"
Set-Location "$ROOT"
& .\.venv\Scripts\Activate.ps1
`$env:FREIRAUM_DATA_DIR = "$DATA"
`$env:FM_BASE_URL = "http://localhost:$PORT_BACKEND/api"
python backend/run.py
"@ | Out-File -FilePath $backendPath -Encoding UTF8
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$backendPath`""

Start-Sleep -Seconds 3

# Frontend starter
$frontendPath = Join-Path $ROOT "scripts\run_frontend.ps1"
@"
Set-Location "$ROOT\frontend\fm-app"
if (Test-Path ".\package.json") {
  npm install
  npm run dev -- --port $PORT_FRONTEND
} else {
  Write-Host "frontend/fm-app/package.json not found."
}
"@ | Out-File -FilePath $frontendPath -Encoding UTF8
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$frontendPath`""

# Run audit with longer ready timeout
Start-Sleep -Seconds 4
& (Join-Path $ROOT "scripts\ultra_audit.ps1") -ReadyTimeoutSec 120
