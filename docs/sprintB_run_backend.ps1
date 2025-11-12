# Setup & run backend for Sprint B - Voice AI Router 2.0
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

# Voice Router settings
$env:FM_BASE_URL = "http://localhost:30521/api"
$env:FM_AUTO_SCORE_MIN = "0.6"
$env:FM_ALLOW_EVENING_MAILS = "0"  # Default: keine Mails nach 18:00
$env:BACKEND_PORT = "30521"

Write-Host "`n=== SPRINT B - VOICE AI ROUTER 2.0 ===" -ForegroundColor Cyan
Write-Host "Backend URL: $env:FM_BASE_URL" -ForegroundColor Gray
Write-Host "Auto Score Threshold: $env:FM_AUTO_SCORE_MIN" -ForegroundColor Gray
Write-Host "Evening Mails: $env:FM_ALLOW_EVENING_MAILS" -ForegroundColor Gray
Write-Host "`nStarte Backend..." -ForegroundColor Green

python backend\run.py

















