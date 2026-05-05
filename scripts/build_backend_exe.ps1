$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
$backendDir = Join-Path $root "backend"
$venvPy = Join-Path $backendDir ".venv\Scripts\python.exe"
$ensureWhisper = Join-Path $scriptDir "ensure_whisper_assets.ps1"

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

if (!(Test-Path $venvPy)) {
  throw "Backend venv python not found: $venvPy"
}

Set-Location $backendDir

Invoke-Step -Name "ensure whisper assets" -Action {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $ensureWhisper | Out-Host
}

Invoke-Step -Name "pip upgrade" -Action {
  & $venvPy -m pip install --upgrade pip | Out-Host
}

Invoke-Step -Name "pyinstaller install" -Action {
  & $venvPy -m pip install pyinstaller | Out-Host
}

$distDir = Join-Path $backendDir "dist"
$buildDir = Join-Path $backendDir "build"
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }

Invoke-Step -Name "pyinstaller build" -Action {
  & $venvPy -m PyInstaller `
    --noconfirm `
    --clean `
    --onedir `
    --name "backend_server" `
    --distpath (Join-Path $backendDir "dist") `
    --workpath (Join-Path $backendDir "build") `
    --specpath (Join-Path $backendDir "build") `
    --collect-submodules "app" `
    --collect-submodules "app.routers" `
    --collect-submodules "app.services" `
    --collect-submodules "app.core" `
    --collect-data "app" `
    --add-data (Join-Path $backendDir "bin\whisper;bin\whisper") `
    --add-data (Join-Path $backendDir "models\whisper;models\whisper") `
    "run_packaged_server.py" | Out-Host
}

Write-Host "Backend EXE built: $backendDir\dist\backend_server" -ForegroundColor Green

