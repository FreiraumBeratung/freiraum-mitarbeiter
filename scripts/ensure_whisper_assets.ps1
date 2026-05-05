$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
$backendDir = Join-Path $root "backend"
$whisperDir = Join-Path $backendDir "bin\whisper"
$modelDir = Join-Path $backendDir "models\whisper"
$mainExe = Join-Path $whisperDir "main.exe"
$modelFile = Join-Path $modelDir "ggml-small.bin"

New-Item -ItemType Directory -Force -Path $whisperDir | Out-Null
New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

function Get-FileSizeMB([string]$Path) {
  if (!(Test-Path $Path)) { return 0 }
  return [math]::Round(((Get-Item $Path).Length / 1MB), 2)
}

if (!(Test-Path $mainExe)) {
  Write-Host "[whisper] main.exe fehlt, lade Binary-Paket..." -ForegroundColor Yellow
  $tmpRoot = Join-Path $env:TEMP ("fm-whisper-" + [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $tmpRoot "whisper-bin-x64.zip"
  $extractDir = Join-Path $tmpRoot "extract"
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
  try {
    Invoke-WebRequest `
      -Uri "https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip" `
      -OutFile $zipPath `
      -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $mainCandidate = Get-ChildItem -Path $extractDir -Recurse -Filter "main.exe" | Select-Object -First 1
    if (-not $mainCandidate) {
      throw "main.exe wurde im whisper-Paket nicht gefunden."
    }
    $binSourceDir = Split-Path -Parent $mainCandidate.FullName
    Copy-Item -Path (Join-Path $binSourceDir "*") -Destination $whisperDir -Recurse -Force
  } finally {
    if (Test-Path $tmpRoot) {
      Remove-Item -Path $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

if (!(Test-Path $modelFile)) {
  Write-Host "[whisper] ggml-small.bin fehlt, lade Modell..." -ForegroundColor Yellow
  $modelUrls = @(
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    "https://github.com/ggml-org/whisper.cpp/raw/master/models/ggml-small.bin"
  )
  $loaded = $false
  foreach ($url in $modelUrls) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $modelFile -UseBasicParsing -ErrorAction Stop
      $loaded = $true
      break
    } catch {
      Write-Host "[whisper] Download fehlgeschlagen von $url" -ForegroundColor DarkYellow
    }
  }
  if (-not $loaded) {
    throw "Konnte ggml-small.bin nicht herunterladen."
  }
}

if (!(Test-Path $mainExe)) {
  throw "Whisper Binary fehlt weiterhin: $mainExe"
}
if (!(Test-Path $modelFile)) {
  throw "Whisper Modell fehlt weiterhin: $modelFile"
}

Write-Host ("[whisper] OK main.exe: {0} MB" -f (Get-FileSizeMB $mainExe)) -ForegroundColor Green
Write-Host ("[whisper] OK ggml-small.bin: {0} MB" -f (Get-FileSizeMB $modelFile)) -ForegroundColor Green
