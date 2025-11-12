param(
  [int]$PORT_BACKEND = 30521,
  [int]$PORT_FRONTEND = 5173
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib\fs.ps1"

$ROOT = Split-Path -Parent $PSScriptRoot
$LOGDIR = Join-Path $ROOT "logs"
$REPORT = Join-Path $ROOT "exports\BOOT_FIX_REPORT.md"

Ensure-Dir $LOGDIR
Ensure-Dir (Join-Path $ROOT "exports")
Set-Content -Path $REPORT -Value "## BOOT+FIX REPORT`n**Zeit:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n" -Encoding UTF8

# 2.1 Ports freimachen
Kill-Port -Port $PORT_BACKEND
Kill-Port -Port $PORT_FRONTEND
Append $REPORT "- Ports freigemacht: $PORT_BACKEND / $PORT_FRONTEND`n"

# 2.2 venv sicherstellen + Kernpakete
if (!(Test-Path "$ROOT\.venv")) {
  Append $REPORT "- venv wird erstellt …`n"
  python -m venv "$ROOT\.venv"
}
& "$ROOT\.venv\Scripts\Activate.ps1"
# Installiere aus requirements.txt falls vorhanden
$reqFile = Join-Path $ROOT "backend\requirements.txt"
if (Test-Path $reqFile) {
  Append $REPORT "- Installiere Pakete aus requirements.txt …`n"
  python -m pip install -q -r $reqFile
  Append $REPORT "- requirements.txt installiert.`n"
} else {
  # Fallback: Kernpakete
  $pkgs = @('fastapi','uvicorn','sqlalchemy','pydantic','requests','beautifulsoup4','lxml','openpyxl','python-dateutil','edge-tts','apscheduler','reportlab','python-dotenv')
  foreach ($p in $pkgs) {
    $pyScript = @"
import importlib, subprocess, sys
pkg = "$p"
try:
    importlib.import_module(pkg.replace("-","_"))
except Exception:
    subprocess.check_call([sys.executable,"-m","pip","install",pkg])
"@
    $pyScript | python -
  }
  Append $REPORT "- Python-Pakete geprüft/ installiert: $($pkgs -join ', ')`n"
}

# 2.3 Verzeichnisse
foreach ($d in @("$ROOT\data","$ROOT\data\exports","$ROOT\data\voice")) { Ensure-Dir $d }
Append $REPORT "- Datenordner ok (data/, exports/, voice/)`n"

# 2.4 Backend app.py minimal absichern + CORS
$MAIN = Join-Path $ROOT "backend\app.py"
if (!(Test-Path $MAIN)) {
  Ensure-Dir (Split-Path $MAIN)
  $mainContent = @"
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Freiraum Mitarbeiter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"ok": True}

@app.get("/api/system/status")
def status():
    return {"ok": True, "port": 30521}
"@
  Set-Content $MAIN $mainContent -Encoding UTF8
  Append $REPORT "- app.py fehlte → Minimalversion erzeugt (Health/Status/CORS).`n"
} else {
  $txt = Get-Content $MAIN -Raw
  if ($txt -notmatch "CORSMiddleware") {
    $corsBlock = @"

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
"@
    $txt = $txt + $corsBlock
    Set-Content $MAIN $txt -Encoding UTF8
    Append $REPORT "- CORS in app.py ergänzt.`n"
  }
}

# 2.5 Konflikt 'backend\calendar' → calendar_module
if (Test-Path "$ROOT\backend\calendar") {
  Rename-Item "$ROOT\backend\calendar" "$ROOT\backend\calendar_module" -Force
  Get-ChildItem "$ROOT\backend" -Recurse -Include *.py | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $newContent = $content -replace "from\s+backend\.calendar\b","from backend.calendar_module" `
                                -replace "backend\.calendar\b","backend.calendar_module"
    Set-Content $_.FullName $newContent -Encoding UTF8
  }
  Append $REPORT "- 'backend/calendar' → 'backend/calendar_module' umbenannt + Imports gefixt.`n"
}

# 2.6 Router-Autoload (alle router.py automatisch inkludieren) - nur wenn nicht vorhanden
$mainTxt = Get-Content $MAIN -Raw
if ($mainTxt -notmatch "# AUTO-ROUTERS") {
  $autoloadBlock = @"

# AUTO-ROUTERS (geladen, wenn vorhanden)
def _autoload_routers():
    import importlib, pkgutil, os, sys
    from pathlib import Path
    base = Path(__file__).resolve().parent
    root_pkg = "backend"
    loaded = []
    backend_dir = base
    for finder, name, ispkg in pkgutil.walk_packages([str(backend_dir)], prefix=root_pkg+"."):
        if name.endswith(".router") or ".router." in name:
            try:
                mod = importlib.import_module(name)
                router = getattr(mod, "router", None)
                if router:
                    app.include_router(router)
                    loaded.append(name)
            except Exception as e:
                print(f"Router load fail: {name} - {e}")
    return loaded

try:
    _autoload_routers()
except Exception as e:
    print(f"Autoload routers error: {e}")
# END AUTO-ROUTERS
"@
  $mainTxt += $autoloadBlock
  Set-Content $MAIN $mainTxt -Encoding UTF8
  Append $REPORT "- Router-Autoload in app.py ergänzt (lädt alle *router.py).`n"
}

# 2.7 Start-Skripte (mit Log-Redirect)
$RUN_BACK = Join-Path $ROOT "scripts\run_backend.ps1"
$runBackContent = @"
`$ErrorActionPreference = "Stop"
`$env:FREIRAUM_DATA_DIR = "$($ROOT)\data"
`$env:FM_BASE_URL = "http://localhost:$PORT_BACKEND/api"
Set-Location "$ROOT"
& "$ROOT\.venv\Scripts\Activate.ps1"
`$py = "$ROOT\.venv\Scripts\python.exe"
Start-Process -FilePath `$py -ArgumentList "-m","uvicorn","backend.app:app","--host","0.0.0.0","--port","$PORT_BACKEND","--reload" -NoNewWindow -RedirectStandardOutput "$ROOT\logs\backend.out.log" -RedirectStandardError "$ROOT\logs\backend.err.log"
"@
Set-Content $RUN_BACK $runBackContent -Encoding UTF8

$RUN_FE = Join-Path $ROOT "scripts\run_frontend.ps1"
$runFeContent = @"
`$ErrorActionPreference = "Stop"
Set-Location "$ROOT\frontend\fm-app"
if (Test-Path ".\package.json") {
  if (!(Get-Command npm -ErrorAction SilentlyContinue)) { Write-Host "npm fehlt"; exit 1 }
  npm install --silent 1>>"$ROOT\logs\frontend.out.log" 2>>"$ROOT\logs\frontend.err.log"
  Start-Process -FilePath "npm" -ArgumentList "run","dev","--","--port","$PORT_FRONTEND" -NoNewWindow -RedirectStandardOutput "$ROOT\logs\frontend.out.log" -RedirectStandardError "$ROOT\logs\frontend.err.log"
} else {
  Write-Host "frontend/fm-app/package.json nicht gefunden."
}
"@
Set-Content $RUN_FE $runFeContent -Encoding UTF8

Append $REPORT "- Startskripte erzeugt/aktualisiert.`n"

# 2.8 Starten (Hintergrund) & Health prüfen
Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$RUN_BACK`""
Start-Sleep -Seconds 6

# Health Poll
$base = "http://localhost:$PORT_BACKEND/api/health"
$healthy = $false
for ($i=0; $i -lt 12; $i++) {
  try {
    $r = Invoke-RestMethod -Method Get -Uri $base -TimeoutSec 5
    if ($r.ok -eq $true) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if ($healthy) {
  Append $REPORT "- Backend HEALTH [OK]`n"
} else {
  Append $REPORT "- Backend HEALTH [FAIL] (siehe logs\backend.err.log)`n"
}

# Frontend (nur starten, kein harter Fail)
Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$RUN_FE`""
Start-Sleep -Seconds 3
try {
  $ui = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$PORT_FRONTEND" -TimeoutSec 5
  Append $REPORT "- Frontend UI [OK]`n"
} catch {
  Append $REPORT "- Frontend UI [FAIL] (läuft dev-server nicht? siehe logs\frontend.err.log)`n"
}

Write-Host "`nReport: $REPORT" -ForegroundColor Green

