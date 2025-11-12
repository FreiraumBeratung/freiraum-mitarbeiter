param([int]$Port = 30521)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $here ".venv\Scripts"
$python = Join-Path $venv "python.exe"

if (!(Test-Path $python)) { throw "Venv nicht gefunden: $python" }

# Port als ENV setzen und den Python-Starter ausführen
$env:BACKEND_PORT = "$Port"
Write-Host "Starting FastAPI on port $Port via backend\run.py ..." -ForegroundColor Cyan
& $python (Join-Path $here "run.py")