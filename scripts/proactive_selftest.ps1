param()



$ErrorActionPreference = "Stop"

$BASE = "http://localhost:30521/api"



Write-Host "🧪 Proactive Selftest startet..." -ForegroundColor Cyan



# 1) Reminder in 5s anlegen

$r = Invoke-RestMethod -Method POST -Uri "$BASE/proactive/remember" -ContentType "application/json" -Body (@{

  user_id="denis"; kind="followup"; note="Ruhiger Test-Reminder (5s)"; in="5s"; payload=@{ origin="selftest" }

} | ConvertTo-Json -Depth 6)



$rid = $r.reminder.id

Write-Host "✅ Reminder angelegt: $rid (5s)"



# 2) Warten + Trigger

Start-Sleep -Seconds 6

Invoke-RestMethod -Method POST -Uri "$BASE/proactive/trigger" | Out-Null

Write-Host "🔔 Tick ausgelöst."



# 3) Prüfen

$items = (Invoke-RestMethod -Method GET -Uri "$BASE/proactive/reminders?status=queued").items

if ($items -and ($items | Where-Object { $_.id -eq $rid }).Count -gt 0) {

  Write-Host "❌ Reminder noch queued – bitte Backend-Logs prüfen." -ForegroundColor Red; exit 2

}

Write-Host "🎉 Proactive Selftest OK (Reminder verarbeitet)" -ForegroundColor Green










