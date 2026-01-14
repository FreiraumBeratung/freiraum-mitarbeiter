# Startet Backend und Frontend in separaten PowerShell-Fenstern

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Backend starten in neuem Fenster
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ScriptPath'; .\`_run_backend.ps1"

# Kurz warten, damit Backend hochfährt
Start-Sleep -Seconds 3

# Frontend starten in neuem Fenster
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ScriptPath'; .\`_run_frontend.ps1"

Write-Host "Backend und Frontend wurden in separaten Fenstern gestartet."
Write-Host "Backend läuft auf Port 30541"
Write-Host "Frontend läuft auf Port 5173"











