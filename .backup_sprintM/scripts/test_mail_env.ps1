# Test-Skript für .env-Ladepfad und Mail-Check
$ErrorActionPreference = "Continue"
$Root = "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"
$BackendScript = Join-Path $Root "backend\run_backend_now.ps1"

Write-Host "`n=== Mail-Environment-Test ===" -ForegroundColor Cyan
Write-Host "1. Prüfe backend/config/.env..." -ForegroundColor Yellow

$envPath = Join-Path $Root "backend\config\.env"
if (Test-Path $envPath) {
    Write-Host "   [OK] .env gefunden: $envPath" -ForegroundColor Green
    Get-Content $envPath | Select-String -Pattern "^(IMAP|SMTP)" | ForEach-Object {
        $line = $_.Line
        if ($line -match "PASS|KEY") {
            Write-Host "   [INFO] $($line.Split('=')[0])=***" -ForegroundColor Gray
        } else {
            Write-Host "   [INFO] $line" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "   [WARN] .env nicht gefunden - wird beim Backend-Start erstellt" -ForegroundColor Yellow
}

Write-Host "`n2. Starte Backend auf Port 30521..." -ForegroundColor Yellow
$backendProcess = Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $BackendScript,
    "-Port", "30521"
) -PassThru -WindowStyle Hidden

Write-Host "   Backend gestartet (PID: $($backendProcess.Id))" -ForegroundColor Green
Write-Host "   Warte 5 Sekunden auf Server-Start..." -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host "`n3. Teste /api/mail/check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:30521/api/mail/check" -Method GET -TimeoutSec 10 -ErrorAction Stop
    Write-Host "   [SUCCESS] Mail-Check erfolgreich!" -ForegroundColor Green
    Write-Host "   Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Cyan
    $success = $true
} catch {
    Write-Host "   [FEHLER] Mail-Check fehlgeschlagen!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    $success = $false
}

Write-Host "`n4. Prüfe /api/system/status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:30521/api/system/status" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   [OK] Backend läuft auf Port $($status.port)" -ForegroundColor Green
} catch {
    Write-Host "   [WARN] Status-Endpoint nicht erreichbar" -ForegroundColor Yellow
}

Write-Host "`n=== Test abgeschlossen ===" -ForegroundColor Cyan
if ($success) {
    Write-Host "✓ Mail-Environment korrekt konfiguriert!" -ForegroundColor Green
} else {
    Write-Host "✗ Mail-Environment-Problem erkannt. Bitte backend/config/.env prüfen!" -ForegroundColor Red
}

Write-Host "`nHinweis: Backend läuft weiter. Zum Stoppen: Stop-Process -Id $($backendProcess.Id)" -ForegroundColor Gray











