Write-Host "📥 Installing Whisper (Deutsch) + Voice Models..." -ForegroundColor Cyan
$root = "$PSScriptRoot\.."
New-Item -ItemType Directory -Force -Path "$root\backend\voice\whisper" | Out-Null
New-Item -ItemType Directory -Force -Path "$root\backend\voice\models" | Out-Null

Write-Host "Lade whisper.exe..." -ForegroundColor Yellow
$whisperUrl = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip"
$zipPath = "$root\backend\voice\whisper.zip"
try {
    Invoke-WebRequest -Uri $whisperUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath "$root\backend\voice\whisper" -Force
    Remove-Item $zipPath -Force
    # Suche whisper.exe oder main.exe im entpackten Verzeichnis
    $exe = Get-ChildItem -Path "$root\backend\voice\whisper" -Recurse -Filter "whisper.exe" | Select-Object -First 1
    if (-not $exe) {
        $exe = Get-ChildItem -Path "$root\backend\voice\whisper" -Recurse -Filter "main.exe" | Select-Object -First 1
        if ($exe) {
            Copy-Item -Path $exe.FullName -Destination "$root\backend\voice\whisper\whisper.exe" -Force
            Write-Host "✓ main.exe als whisper.exe kopiert" -ForegroundColor Green
        }
    } else {
        Move-Item -Path $exe.FullName -Destination "$root\backend\voice\whisper\whisper.exe" -Force
    }
} catch {
    Write-Host "⚠️  Fehler beim Laden von whisper.exe: $_" -ForegroundColor Red
    Write-Host "Bitte manuell von https://github.com/ggerganov/whisper.cpp/releases herunterladen" -ForegroundColor Yellow
}

Write-Host "Lade ggml-base-de.bin..." -ForegroundColor Yellow
# Versuche mehrere URLs für das Modell
$modelUrls = @(
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-de.bin",
    "https://github.com/ggerganov/whisper.cpp/raw/master/models/ggml-base-de.bin"
)
$modelLoaded = $false
foreach ($modelUrl in $modelUrls) {
    try {
        Write-Host "Versuche: $modelUrl" -ForegroundColor Gray
        Invoke-WebRequest -Uri $modelUrl -OutFile "$root\backend\voice\models\ggml-base-de.bin" -UseBasicParsing -ErrorAction Stop
        $modelLoaded = $true
        break
    } catch {
        Write-Host "Fehler: $_" -ForegroundColor Gray
    }
}
if (-not $modelLoaded) {
    Write-Host "⚠️  Modell konnte nicht automatisch geladen werden." -ForegroundColor Red
    Write-Host "Bitte manuell von https://huggingface.co/ggerganov/whisper.cpp/tree/main herunterladen" -ForegroundColor Yellow
    Write-Host "und nach: $root\backend\voice\models\ggml-base-de.bin kopieren" -ForegroundColor Yellow
}

Write-Host "🎙 Installing Edge-TTS..." -ForegroundColor Cyan
pip install edge-tts

Write-Host "✅ Voice-System bereit." -ForegroundColor Green




