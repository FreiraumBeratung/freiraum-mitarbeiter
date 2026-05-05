$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
$frontendDir = Join-Path $root "frontend\fm-app"
$electronDir = Join-Path $root "electron"
$backendDir = Join-Path $root "backend"
$venvPy = Join-Path $backendDir ".venv\Scripts\python.exe"
$logoPng = Join-Path $root "assets\logo.png"
$logoIco = Join-Path $root "assets\logo.ico"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name fehlgeschlagen (ExitCode=$LASTEXITCODE)"
  }
}

if (!(Test-Path $frontendDir)) { throw "Frontend directory missing: $frontendDir" }
if (!(Test-Path $electronDir)) { throw "Electron directory missing: $electronDir" }
if (!(Test-Path $venvPy)) { throw "Backend venv python missing: $venvPy" }

# 0) Logo-ICO sicherstellen (Branding)
Invoke-Step -Name "ensure logo ico" -Action {
  & $venvPy (Join-Path $scriptDir "ensure_logo_ico.py")
}

# 0b) Icon-Validierung (sollte nach ensure_logo_ico immer vorhanden sein)
if (!(Test-Path $logoIco)) {
  Write-Host "Warnung: assets\logo.ico fehlt. Desktop-Icon kann unscharf sein oder Build schlägt fehl." -ForegroundColor Yellow
  if (Test-Path $logoPng) {
    Write-Host "Hinweis: Erzeuge vor dem Build eine ICO-Datei aus assets\logo.png." -ForegroundColor Yellow
  } else {
    Write-Host "Hinweis: Lege assets\logo.png und assets\logo.ico an." -ForegroundColor Yellow
  }
}

# 1) Backend EXE bauen
Invoke-Step -Name "backend build" -Action {
  & (Join-Path $scriptDir "build_backend_exe.ps1")
}

# 2) Frontend build
Set-Location $frontendDir
Invoke-Step -Name "frontend npm ci" -Action { npm ci }
Invoke-Step -Name "frontend build" -Action { npm run build }

# 3) Frontend dist nach electron/app
$electronApp = Join-Path $electronDir "app"
if (Test-Path $electronApp) { Remove-Item $electronApp -Recurse -Force }
Copy-Item (Join-Path $frontendDir "dist") $electronApp -Recurse

# 3b) Branding-Assets explizit in Runtime-App bereitstellen
$brandingSource = Join-Path $frontendDir "public\branding"
$brandingTarget = Join-Path $electronApp "branding"
if (Test-Path $brandingSource) {
  if (Test-Path $brandingTarget) { Remove-Item $brandingTarget -Recurse -Force }
  Copy-Item $brandingSource $brandingTarget -Recurse
}

# 4) Installer bauen
Set-Location $electronDir
Invoke-Step -Name "electron npm install" -Action { npm install }
$env:FM_ELECTRON_MODE = "prod"
Invoke-Step -Name "electron build" -Action { npm run build }

Write-Host "Installer erstellt unter: $root\installers" -ForegroundColor Green
























