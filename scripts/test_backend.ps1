Start-Sleep -Seconds 12
$r = Invoke-RestMethod -Uri "http://localhost:30521/api/health" -TimeoutSec 3 -ErrorAction SilentlyContinue
if ($r) {
    Write-Host "Backend OK - starte Tests" -ForegroundColor Green
    powershell -ExecutionPolicy Bypass -File .\scripts\complete_audit_fix.ps1
} else {
    Write-Host "Backend nicht erreichbar" -ForegroundColor Red
}
















