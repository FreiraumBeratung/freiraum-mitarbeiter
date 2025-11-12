$ErrorActionPreference="Stop"

$ROOT = Join-Path $env:USERPROFILE "Desktop\freiraum-mitarbeiter"

Set-Location $ROOT

pwsh -File .\\scripts\\launch_all.ps1

Start-Sleep -Seconds 5

# Warten bis Frontend erreichbar

$ok=$false

for($i=0;$i -lt 60;$i++){

  try{ (Invoke-WebRequest "http://localhost:5173" -TimeoutSec 2) | Out-Null; $ok=$true; break }catch{ Start-Sleep -Milliseconds 500 }

}

if(-not $ok){ Write-Host "WARN: Frontend nicht erreichbar (5173) – Audit läuft trotzdem weiter." -ForegroundColor Yellow }

pwsh -File .\\scripts\\hyper_audit.ps1

