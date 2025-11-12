$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path $root -Parent

$port = 30521
$api = "http://127.0.0.1:$port/api/system/status"

# Port-Check
$portUsed = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($portUsed) {
  Write-Warning "Port $port ist belegt. Bitte BACKEND_PORT in config\.env anpassen ODER den Prozess schließen."
}

# Backend starten
Start-Process pwsh -ArgumentList "-NoExit","-Command","Set-Location `"$root\backend`"; .\run_backend_now.ps1 -Port $port"

# Frontend starten
Start-Process pwsh -ArgumentList "-NoExit","-Command","Set-Location `"$root\frontend\fm-app`"; npm run dev"

Write-Host "Backend & Frontend gestartet." -ForegroundColor Green