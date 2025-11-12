# Setup & run backend for Sprint A - Knowledge & Memory 2.0 + Intent
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

# Ensure config directory exists
if (!(Test-Path "$PWD\config")) { New-Item -ItemType Directory -Path "$PWD\config" | Out-Null }

$env:FM_BASE_URL = "http://localhost:30521/api"
$env:BACKEND_PORT = "30521"

Write-Host "`n=== SPRINT A - KNOWLEDGE & MEMORY 2.0 + INTENT ===" -ForegroundColor Cyan
Write-Host "Backend URL: $env:FM_BASE_URL" -ForegroundColor Gray
Write-Host "`nStarte Backend..." -ForegroundColor Green

python backend\run.py

















