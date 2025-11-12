$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$piperDir = Join-Path $root "backend\bin\piper"
$modelDir = Join-Path $root "backend\models\piper"

New-Item -ItemType Directory -Force -Path $piperDir | Out-Null
New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

$piperZip = Join-Path $piperDir "piper-win-x64.zip"
$piperUrl = "https://github.com/rhasspy/piper/releases/latest/download/piper_windows_amd64.zip"

if (!(Test-Path $piperZip)) {
    Write-Host "Downloading Piper binary..."
    Invoke-WebRequest -Uri $piperUrl -OutFile $piperZip
}

Write-Host "Extracting Piper..."
Expand-Archive -Path $piperZip -DestinationPath $piperDir -Force

$exe = Get-ChildItem -Path $piperDir -Recurse -Filter "piper.exe" | Select-Object -First 1
if (-not $exe) {
    throw "piper.exe not found after extraction."
}
if ($exe.DirectoryName -ne $piperDir) {
    Copy-Item $exe.FullName (Join-Path $piperDir "piper.exe") -Force
    $exe = Get-Item (Join-Path $piperDir "piper.exe")
}

$voiceBase = "de_DE-thorsten-high"
$onnx = Join-Path $modelDir "$voiceBase.onnx"
$json = Join-Path $modelDir "$voiceBase.onnx.json"

if (!(Test-Path $onnx)) {
    Write-Host "Downloading Piper voice model..."
    Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx?download=true" -OutFile $onnx
}

if (!(Test-Path $json)) {
    Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx.json?download=true" -OutFile $json
}

Write-Host "Piper installed."
Write-Host "Binary: $($exe.FullName)"
Write-Host "Voice:  $onnx"

