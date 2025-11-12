# Setup & run backend for Sprint 8 - Automation
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

# Automation settings
$env:FM_AUTO_SCORE_MIN = "0.6"
$env:FM_BASE_URL = "http://localhost:30521/api"
$env:BACKEND_PORT = "30521"

Write-Host "`n=== SPRINT 8 - AUTOMATION BACKEND START ===" -ForegroundColor Cyan
Write-Host "Auto Score Threshold: $env:FM_AUTO_SCORE_MIN" -ForegroundColor Yellow
Write-Host "Backend URL: $env:FM_BASE_URL" -ForegroundColor Gray
Write-Host "`nStarte Backend..." -ForegroundColor Green

python backend\run.py

















