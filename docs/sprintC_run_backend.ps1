# Setup & run backend for Sprint C - Lead-Hunter 1.0
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"

if (!(Test-Path ".\.venv")) { python -m venv .venv }

.\.venv\Scripts\Activate.ps1

pip install --upgrade pip
if (Test-Path ".\backend\requirements.txt") {
  pip install -r .\backend\requirements.txt
} else {
  pip install fastapi uvicorn sqlalchemy pydantic requests beautifulsoup4 lxml openpyxl
}

$env:FREIRAUM_DATA_DIR = "$PWD\data"
if (!(Test-Path $env:FREIRAUM_DATA_DIR)) { New-Item -ItemType Directory -Path $env:FREIRAUM_DATA_DIR | Out-Null }

# Ensure exports directory exists
$exportsDir = "$env:FREIRAUM_DATA_DIR\exports"
if (!(Test-Path $exportsDir)) { New-Item -ItemType Directory -Path $exportsDir | Out-Null }

# Ensure assets directory exists
if (!(Test-Path "$PWD\assets")) { New-Item -ItemType Directory -Path "$PWD\assets" | Out-Null }

$env:FM_BASE_URL = "http://localhost:30521/api"
$env:BACKEND_PORT = "30521"

Write-Host "`n=== SPRINT C - LEAD-HUNTER 1.0 ===" -ForegroundColor Cyan
Write-Host "Backend URL: $env:FM_BASE_URL" -ForegroundColor Gray
Write-Host "`nStarte Backend..." -ForegroundColor Green

python backend\run.py

















