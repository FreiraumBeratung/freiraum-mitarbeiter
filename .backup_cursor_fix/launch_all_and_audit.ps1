$ErrorActionPreference = "Stop"

# Ports / Paths
$PORT_BACKEND = 30521
$PORT_FRONTEND = 5173
$ROOT = Join-Path $env:USERPROFILE "Desktop\freiraum-mitarbeiter"
$DATA = Join-Path $ROOT "data"
$EXPORTS = Join-Path $DATA "exports"

# Helper: kill port
function Kill-Port {
  param([int]$Port)
  try {
    $pid = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
    if ($pid) { Stop-Process -Id $pid -Force; Start-Sleep -Milliseconds 300 }
  } catch { }
}

Write-Host "Freeing ports..." -ForegroundColor Yellow
Kill-Port -Port $PORT_BACKEND
Kill-Port -Port $PORT_FRONTEND

New-Item -ItemType Directory -Path $DATA -Force | Out-Null
New-Item -ItemType Directory -Path $EXPORTS -Force | Out-Null

# VENV
Set-Location $ROOT
if (!(Test-Path ".\.venv")) { python -m venv .venv }
& .\.venv\Scripts\Activate.ps1

# Install reqs (idempotent)
if (Test-Path ".\backend\requirements.txt") {
  python -m pip install --upgrade pip
  pip install -r .\backend\requirements.txt
} else {
  pip install fastapi uvicorn sqlalchemy pydantic requests beautifulsoup4 lxml openpyxl python-dateutil
}

# ENV
$env:FREIRAUM_DATA_DIR = $DATA
$env:FM_BASE_URL = "http://localhost:$PORT_BACKEND/api"

# Start backend window
$backendScript = @"
Set-Location "$ROOT"
& .\.venv\Scripts\Activate.ps1
`$env:FREIRAUM_DATA_DIR = "$DATA"
`$env:FM_BASE_URL = "http://localhost:$PORT_BACKEND/api"
python backend/run.py
"@
New-Item -ItemType Directory -Path "$ROOT\scripts" -Force | Out-Null
$backendPath = Join-Path $ROOT "scripts\run_backend.ps1"
$backendScript | Out-File -FilePath $backendPath -Encoding UTF8
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$backendPath`""

# Wait shortly for server socket
Start-Sleep -Seconds 2

# Start frontend window
$frontendScript = @"
Set-Location "$ROOT\frontend\fm-app"
if (Test-Path ".\package.json") {
  npm install
  npm run dev -- --port $PORT_FRONTEND
} else {
  Write-Host "frontend/fm-app/package.json not found."
}
"@
$frontendPath = Join-Path $ROOT "scripts\run_frontend.ps1"
$frontendScript | Out-File -FilePath $frontendPath -Encoding UTF8
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$frontendPath`""

# Wait & Audit
Start-Sleep -Seconds 3
$ultra = Join-Path $ROOT "scripts\ultra_audit.ps1"
& $ultra -ReadyTimeoutSec 60

