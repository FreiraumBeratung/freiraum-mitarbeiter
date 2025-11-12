# Setup & run backend for Sprint D - Outreach-Sequenzen & Kalender 1.0
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"

if (!(Test-Path ".\.venv")) { python -m venv .venv }

.\.venv\Scripts\Activate.ps1

pip install --upgrade pip
if (Test-Path ".\backend\requirements.txt") {
  pip install -r .\backend\requirements.txt
} else {
  pip install fastapi uvicorn sqlalchemy pydantic requests beautifulsoup4 lxml openpyxl python-dateutil
}

$env:FREIRAUM_DATA_DIR = "$PWD\data"
if (!(Test-Path $env:FREIRAUM_DATA_DIR)) { New-Item -ItemType Directory -Path $env:FREIRAUM_DATA_DIR | Out-Null }

# Optional: paste a valid OAuth Bearer into ENV to enable MS Graph calls without full OAuth flow
# $env:MSGRAPH_TOKEN = "eyJhbGciOi..."

$env:FM_BASE_URL = "http://localhost:30521/api"
$env:BACKEND_PORT = "30521"

Write-Host "`n=== SPRINT D - OUTREACH-SEQUENZEN & KALENDER 1.0 ===" -ForegroundColor Cyan
Write-Host "Backend URL: $env:FM_BASE_URL" -ForegroundColor Gray
Write-Host "MS Graph: $([bool]$env:MSGRAPH_TOKEN)" -ForegroundColor Gray
Write-Host "`nStarte Backend..." -ForegroundColor Green

python backend\run.py
















