$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot

# Kill Ports
Get-NetTCPConnection -LocalPort 30521 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } | Out-Null
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } | Out-Null
Start-Sleep -Seconds 2

# Start Backend
Write-Host "Starte Backend..." -ForegroundColor Yellow
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$ROOT'; if (Test-Path '.\.venv\Scripts\Activate.ps1') { & .\.venv\Scripts\Activate.ps1 }; python backend/run.py"
Start-Sleep -Seconds 10

# Health
Write-Host "Health Check..." -ForegroundColor Yellow
try {
  Invoke-RestMethod "http://localhost:30521/api/health" | Out-Null
  Write-Host "Backend laeuft" -ForegroundColor Green
} catch {
  Write-Host "Backend nicht erreichbar" -ForegroundColor Red
  exit 1
}

# Quick Hunt
Write-Host "Lead-Hunter Test..." -ForegroundColor Yellow
$body = @{ category="shk"; location="arnsberg"; count=8; save_to_db=$false; export_excel=$false } | ConvertTo-Json
try {
  $r = Invoke-RestMethod -Method Post -Uri "http://localhost:30521/api/lead_hunter/hunt" -ContentType "application/json" -Body $body
  Write-Host "Lead-Hunter Test: requested=$($r.requested) found=$($r.found)" -ForegroundColor Cyan
  if ($r.found -eq 0) { 
    Write-Host "0 Treffer - ueberpruefe Netzwerk/Provider. Fallbacks aktiv." -ForegroundColor Yellow 
  } else {
    Write-Host "Lead-Hunter funktioniert" -ForegroundColor Green
  }
} catch {
  Write-Host "Lead-Hunter Test fehlgeschlagen: $_" -ForegroundColor Yellow
}

# Start Frontend
Write-Host "Starte Frontend..." -ForegroundColor Yellow
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$ROOT\frontend\fm-app'; npm run dev -- --port 5173"
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "Smoke abgeschlossen: Avatar sollte unten links sichtbar sein. LeadsHunter sollte Ergebnisse liefern oder deutliche Hinweise." -ForegroundColor Green
