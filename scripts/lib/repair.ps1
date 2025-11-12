param(
  [string]$Root,
  [int]$PortBackend = 30521,
  [int]$PortFrontend = 5173
)

$ErrorActionPreference = "Stop"

function Kill-Port { param([int]$Port)
  try {
    $cons = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($cons) {
      $p = $cons[0].OwningProcess
      if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
    }
  } catch {}
}

function Ensure-Venv {
  if (!(Test-Path "$Root\.venv")) {
    python -m venv "$Root\.venv"
  }
  & "$Root\.venv\Scripts\Activate.ps1"
  # Kernpakete sicherstellen
  $packages = @('fastapi','uvicorn','sqlalchemy','pydantic','requests','beautifulsoup4','lxml','openpyxl','python-dateutil','edge-tts')
  foreach ($p in $packages) {
    $pyScript = @"
import importlib, sys, subprocess
pkg = "$p"
try:
  importlib.import_module(pkg.replace('-', '_'))
except Exception:
  subprocess.check_call([sys.executable,'-m','pip','install',pkg])
"@
    $pyScript | python -
  }
}

function Ensure-DataDirs {
  $data = Join-Path $Root "data"
  $exports = Join-Path $data "exports"
  $voice = Join-Path $data "voice"
  foreach ($d in @($data,$exports,$voice)) { if (!(Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null } }
}

function Ensure-LeadHunter-Router {
  $mainPath = "$Root\backend\app.py"
  if (Test-Path $mainPath) {
    $main = Get-Content $mainPath -Raw
    if ($main -notmatch "lead_hunter\.router") {
      Write-Host "Lead-Hunter Router bereits eingebunden" -ForegroundColor Gray
    }
  }
}

function Ensure-CORS {
  $mainPath = "$Root\backend\app.py"
  if (Test-Path $mainPath) {
    $main = Get-Content $mainPath -Raw
    if ($main -notmatch "CORSMiddleware") {
      Write-Host "CORS bereits konfiguriert" -ForegroundColor Gray
    }
  }
}

function Start-Backend {
  $running = Get-NetTCPConnection -LocalPort $PortBackend -State Listen -ErrorAction SilentlyContinue
  if (-not $running) {
    Write-Host "Starte Backend..." -ForegroundColor Yellow
    $backendScript = Join-Path $Root "scripts\run_backend.ps1"
    if (Test-Path $backendScript) {
      Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $backendScript
      Start-Sleep -Seconds 15
    } else {
      Write-Host "WARN: run_backend.ps1 nicht gefunden, starte manuell..." -ForegroundColor Yellow
      Push-Location $Root
      if (Test-Path ".\.venv\Scripts\Activate.ps1") {
        & ".\.venv\Scripts\Activate.ps1"
      }
      Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$Root'; if (Test-Path '.\.venv\Scripts\Activate.ps1') { & .\.venv\Scripts\Activate.ps1 }; python backend/run.py"
      Start-Sleep -Seconds 15
      Pop-Location
    }
  } else {
    Write-Host "Backend laeuft bereits" -ForegroundColor Green
  }
}

function Start-Frontend {
  $running = Get-NetTCPConnection -LocalPort $PortFrontend -State Listen -ErrorAction SilentlyContinue
  if (-not $running) {
    Write-Host "Starte Frontend..." -ForegroundColor Yellow
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$Root\frontend\fm-app'; npm run dev -- --port 5173"
    Start-Sleep -Seconds 4
  } else {
    Write-Host "Frontend laeuft bereits" -ForegroundColor Green
  }
}

# Ausführen
Kill-Port -Port $PortBackend
Kill-Port -Port $PortFrontend
Start-Sleep -Seconds 2
Ensure-Venv
Ensure-DataDirs
if (Test-Path "$Root\backend\lead_hunter\router.py") { Ensure-LeadHunter-Router }
Ensure-CORS
Start-Backend

