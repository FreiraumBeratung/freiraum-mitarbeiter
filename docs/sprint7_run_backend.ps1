# Setup & run backend with scheduler disabled by default
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"

if (!(Test-Path ".\.venv")) { python -m venv .venv }

.\.venv\Scripts\Activate.ps1

pip install --upgrade pip
if (Test-Path ".\backend\requirements.txt") {
  pip install -r .\backend\requirements.txt
} else {
  pip install fastapi uvicorn sqlalchemy pydantic requests
}

$env:FREIRAUM_DATA_DIR = "$PWD\data"
if (!(Test-Path $env:FREIRAUM_DATA_DIR)) { New-Item -ItemType Directory -Path $env:FREIRAUM_DATA_DIR | Out-Null }

# Scheduler off for manual control
$env:FM_DECISION_SCHED_ENABLED = "0"
$env:FM_DECISION_USER_ID = "denis"
$env:FM_DECISION_SCHED_INTERVAL = "900"
$env:FM_BASE_URL = "http://localhost:30521/api"
$env:BACKEND_PORT = "30521"

Write-Host "`n=== SPRINT 7 - BACKEND START ===" -ForegroundColor Cyan
Write-Host "Decision Scheduler: DISABLED (manuell steuerbar)" -ForegroundColor Yellow
Write-Host "Backend URL: $env:FM_BASE_URL" -ForegroundColor Gray
Write-Host "`nStarte Backend..." -ForegroundColor Green

python backend\run.py



















