Start-Sleep -Seconds 20
$r = Invoke-RestMethod -Uri "http://localhost:30521/api/health" -TimeoutSec 3 -ErrorAction SilentlyContinue
if ($r) {
    Write-Host "Backend OK - starte Tests" -ForegroundColor Green
    powershell -ExecutionPolicy Bypass -File .\scripts\comprehensive_audit.ps1
} else {
    Write-Host "Backend noch nicht bereit" -ForegroundColor Yellow
}
















