# Backend neu starten und Mail-Check testen
$ErrorActionPreference = "Continue"
$Root = "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"
$BackendScript = Join-Path $Root "backend\run_backend_now.ps1"
$Port = 30521

Write-Host "`n=== Backend-Neustart + Mail-Check-Test ===" -ForegroundColor Cyan

# Prüfe, ob Backend läuft
Write-Host "1. Prüfe laufende Backend-Prozesse..." -ForegroundColor Yellow
try {
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connections) {
        $pid = (Get-Process -Id $connections.OwningProcess -ErrorAction SilentlyContinue).Id
        Write-Host "   Backend läuft (PID: $pid). Stoppe..." -ForegroundColor Yellow
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "   Backend gestoppt." -ForegroundColor Green
    } else {
        Write-Host "   Kein Backend auf Port $Port gefunden." -ForegroundColor Gray
    }
} catch {
    Write-Host "   Konnte Backend-Status nicht prüfen (OK)." -ForegroundColor Gray
}

# Starte Backend
Write-Host "`n2. Starte Backend neu..." -ForegroundColor Yellow
$backendProcess = Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $BackendScript,
    "-Port", "$Port"
) -PassThru -WindowStyle Hidden

Write-Host "   Backend gestartet (PID: $($backendProcess.Id))" -ForegroundColor Green
Write-Host "   Warte 6 Sekunden auf Server-Start..." -ForegroundColor Gray
Start-Sleep -Seconds 6

# Teste Mail-Check
Write-Host "`n3. Teste /api/mail/check..." -ForegroundColor Yellow
$maxRetries = 3
$retryCount = 0
$success = $false

while ($retryCount -lt $maxRetries -and -not $success) {
    $retryCount++
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/mail/check" -Method GET -TimeoutSec 10 -ErrorAction Stop
        
        Write-Host "   [RESPONSE]" -ForegroundColor Cyan
        $response | ConvertTo-Json -Depth 3 | Write-Host
        
        if ($response.ok -eq $true) {
            Write-Host "   ✓ Mail-Check erfolgreich! OK=true" -ForegroundColor Green
            $success = $true
        } else {
            Write-Host "   ⚠ Mail-Check: OK=false" -ForegroundColor Yellow
            if ($response.imap) {
                Write-Host "      IMAP: $($response.imap.reason)" -ForegroundColor Gray
            }
            if ($response.smtp) {
                Write-Host "      SMTP: $($response.smtp.reason)" -ForegroundColor Gray
            }
            if ($retryCount -lt $maxRetries) {
                Write-Host "   Warte 2 Sekunden, dann erneuter Versuch..." -ForegroundColor Gray
                Start-Sleep -Seconds 2
            }
        }
    } catch {
        Write-Host "   [FEHLER] Versuch $retryCount/$maxRetries" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($retryCount -lt $maxRetries) {
            Write-Host "   Warte 3 Sekunden, dann erneuter Versuch..." -ForegroundColor Gray
            Start-Sleep -Seconds 3
        }
    }
}

Write-Host "`n=== Test abgeschlossen ===" -ForegroundColor Cyan
if ($success) {
    Write-Host "✓ Mail-Environment funktioniert korrekt!" -ForegroundColor Green
} else {
    Write-Host "✗ Mail-Check fehlgeschlagen. Bitte backend/config/.env prüfen!" -ForegroundColor Red
}

Write-Host "`nBackend läuft weiter (PID: $($backendProcess.Id))" -ForegroundColor Gray











