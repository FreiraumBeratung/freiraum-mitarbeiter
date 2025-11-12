param()
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path $root -Parent
$back = Join-Path $root "backend"
$venv = Join-Path $back ".venv\Scripts\python.exe"
if (!(Test-Path $venv)) { throw "Python venv nicht gefunden: $venv" }
$env:FM_ROOT = $root
$py = Join-Path $back "tools\audit.py"
Write-Host "Running READ-ONLY audit..." -ForegroundColor Cyan
& $venv $py
Write-Host "Audit abgeschlossen. Siehe exports\AUDIT_REPORT.md / .json" -ForegroundColor Green













