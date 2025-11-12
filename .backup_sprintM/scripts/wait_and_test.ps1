# Warte auf Backend und führe dann Tests durch
$maxWait = 60
$waited = 0
Write-Host "Warte auf Backend..." -ForegroundColor Yellow

while ($waited -lt $maxWait) {
    try {
        $test = Invoke-RestMethod -Uri "http://localhost:30521/api/health" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "`nBackend ist bereit!" -ForegroundColor Green
        break
    } catch {
        Start-Sleep -Seconds 2
        $waited += 2
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
}

if ($waited -ge $maxWait) {
    Write-Host "`nBackend nicht erreichbar nach $maxWait Sekunden" -ForegroundColor Red
    exit 1
}

# Führe Tests aus
powershell -ExecutionPolicy Bypass -File .\scripts\complete_audit_fix.ps1





