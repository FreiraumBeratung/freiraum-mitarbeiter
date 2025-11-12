# Enable Decision Scheduler (requires backend restart)
Set-Location "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"

.\.venv\Scripts\Activate.ps1

$env:FM_DECISION_SCHED_ENABLED = "1"
$env:FM_DECISION_USER_ID = "denis"
$env:FM_DECISION_SCHED_INTERVAL = "600"  # every 10 minutes
$env:FM_BASE_URL = "http://localhost:30521/api"

Write-Host "`n=== DECISION SCHEDULER AKTIVIERT ===" -ForegroundColor Cyan
Write-Host "ENABLED: $env:FM_DECISION_SCHED_ENABLED" -ForegroundColor Green
Write-Host "INTERVAL: $env:FM_DECISION_SCHED_INTERVAL Sekunden (alle 10 Minuten)" -ForegroundColor Yellow
Write-Host "USER_ID: $env:FM_DECISION_USER_ID" -ForegroundColor Yellow
Write-Host "`n⚠️  Backend muss neu gestartet werden, damit die Einstellungen aktiv werden!" -ForegroundColor Red
Write-Host "`nZum Deaktivieren: Setze FM_DECISION_SCHED_ENABLED=0" -ForegroundColor Gray



















