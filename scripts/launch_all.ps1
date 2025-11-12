param()
$ErrorActionPreference = "Stop"
$ROOT = (Resolve-Path "$PSScriptRoot\..").Path
$env:FREIRAUM_DATA_DIR = Join-Path $ROOT "data"
$env:FM_BASE_URL = "http://localhost:30521/api"
$PORT_BACKEND = 30521
$PORT_FRONTEND = 5173

function Kill-Port { param([int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  $processId = $connection.OwningProcess
  if ($processId) { Stop-Process -Id $processId -Force; Start-Sleep -Milliseconds 300 }
}

Write-Host "== Ports räumen ==" -ForegroundColor Cyan
Kill-Port $PORT_BACKEND
Kill-Port $PORT_FRONTEND

# Bereits laufende Backend-Prozesse beenden (uvicorn/python backend/run.py)
try {
  $backendProcs = Get-CimInstance -ClassName Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*backend/run.py*" -or $_.CommandLine -like "*uvicorn*app.main*"
  }
  foreach ($proc in $backendProcs) {
    try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
} catch {}

New-Item -ItemType Directory -Path (Join-Path $ROOT "data") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ROOT "exports") -Force | Out-Null

Write-Host "== Python venv ==" -ForegroundColor Cyan
Set-Location $ROOT
if (!(Test-Path ".\.venv")) { python -m venv .venv }
& .\.venv\Scripts\Activate.ps1
$py = Join-Path $ROOT ".venv\Scripts\python.exe"
& $py -m pip install --upgrade pip | Out-Null
if (Test-Path "$ROOT\requirements.txt") {
  & $py -m pip install -r "$ROOT\requirements.txt" | Out-Null
}

Write-Host "== Backend starten ==" -ForegroundColor Cyan
$backFile = Join-Path $ROOT "scripts\_run_backend.ps1"
@"
`$env:FREIRAUM_DATA_DIR = '$env:FREIRAUM_DATA_DIR'
`$env:FM_BASE_URL = '$env:FM_BASE_URL'
Set-Location '$ROOT'
. .\.venv\Scripts\Activate.ps1
python backend/run.py
"@ | Out-File $backFile -Encoding UTF8
Start-Process -WindowStyle Minimized -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$backFile`""

Write-Host "== Frontend starten ==" -ForegroundColor Cyan
$frontFile = Join-Path $ROOT "scripts\_run_frontend.ps1"
@"
Set-Location '$ROOT\frontend\fm-app'
if (Test-Path .\package.json) {
  if (!(Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm fehlt' }
  npm install
  npx playwright install chromium
  npm run dev -- --port $PORT_FRONTEND
} else {
  Write-Host 'Kein frontend/fm-app gefunden.' -ForegroundColor Yellow
}
"@ | Out-File $frontFile -Encoding UTF8
Start-Process -WindowStyle Minimized -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$frontFile`""

# Wait readiness
$ready = $false; for ($i=0; $i -lt 40; $i++) {
  try { Invoke-RestMethod "http://localhost:$PORT_BACKEND/api/ready" -TimeoutSec 3 | Out-Null; $ready=$true; break } catch { Start-Sleep -Milliseconds 750 }
}
if (-not $ready) { Write-Host "WARN: Backend readiness noch nicht bestätigt." -ForegroundColor Yellow }
Start-Sleep -Seconds 3
try { Invoke-WebRequest "http://localhost:$PORT_FRONTEND" -TimeoutSec 3 | Out-Null } catch {}
Write-Host "Launch done."

