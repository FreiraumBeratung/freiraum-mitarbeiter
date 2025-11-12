# Prüfe Mail-Status
$ErrorActionPreference = "Continue"

Write-Host "`n=== Mail-Status-Prüfung ===" -ForegroundColor Cyan

# Teste ob Backend läuft
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:30521/api/mail/check" -Method GET -TimeoutSec 5 -ErrorAction Stop
    
    Write-Host "`n[Response]" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 3
    
    Write-Host "`n[Status]" -ForegroundColor Yellow
    if ($response.ok) {
        Write-Host "✓ IMAP und SMTP funktionieren!" -ForegroundColor Green
        Write-Host ("  IMAP: " + $response.imap.reason) -ForegroundColor Green
        Write-Host ("  SMTP: " + $response.smtp.reason) -ForegroundColor Green
    } else {
        Write-Host "✗ IMAP oder SMTP funktioniert NICHT:" -ForegroundColor Red
        if (-not $response.imap.ok) {
            Write-Host ("  IMAP: " + $response.imap.reason) -ForegroundColor Red
        } else {
            Write-Host ("  IMAP: OK") -ForegroundColor Green
        }
        if (-not $response.smtp.ok) {
            Write-Host ("  SMTP: " + $response.smtp.reason) -ForegroundColor Red
        } else {
            Write-Host ("  SMTP: OK") -ForegroundColor Green
        }
    }
} catch {
    Write-Host "`n[FEHLER] Backend ist nicht erreichbar auf Port 30521" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`nHinweis: Starte das Backend mit: pwsh scripts\start_backend.ps1" -ForegroundColor Yellow
}






















