$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$wDir = Join-Path $root "backend\bin\whisper"
$mDir = Join-Path $root "backend\models\whisper"

New-Item -ItemType Directory -Force -Path $wDir | Out-Null
New-Item -ItemType Directory -Force -Path $mDir | Out-Null

$wZip = Join-Path $wDir "whispercpp-win-x64.zip"
$api = "https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest"
$assetName = "whisper-bin-x64.zip"
$assetUrl = $null
if (!(Test-Path $wZip)) {
    Write-Host "Fetching whisper.cpp release metadata..."
    $release = Invoke-WebRequest -Uri $api | ConvertFrom-Json
    foreach ($asset in $release.assets) {
        if ($asset.name -eq $assetName) {
            $assetUrl = $asset.browser_download_url
            break
        }
    }
    if (-not $assetUrl) {
        throw "Unable to locate $assetName in release assets."
    }
    Write-Host "Downloading whisper.cpp binary..."
    Invoke-WebRequest -Uri $assetUrl -OutFile $wZip
}

Write-Host "Extracting whisper.cpp..."
Expand-Archive -Path $wZip -DestinationPath $wDir -Force

$exe = Get-ChildItem -Path $wDir -Recurse -Filter "main.exe" | Select-Object -First 1
if (-not $exe) {
    throw "main.exe not found after extraction."
}
if ($exe.DirectoryName -ne $wDir) {
    Copy-Item $exe.FullName (Join-Path $wDir "main.exe") -Force
}

$model = Join-Path $mDir "ggml-small.bin"
if (!(Test-Path $model)) {
    Write-Host "Downloading whisper.cpp model (ggml-small)..."
    Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true" -OutFile $model
}

Write-Host "whisper.cpp installed."
Write-Host "Binaries: $wDir"
Write-Host "Model:    $model"

