param([int]$Port = 30521)
$ErrorActionPreference = "Stop"
$api = "http://127.0.0.1:$Port"
# 1) PRO aktivieren
Invoke-RestMethod -Uri "$api/api/license/set?tier=PRO" -Method Post | Out-Null
# 2) Lead holen
$lead = (Invoke-RestMethod -Uri "$api/api/leads").Item(0)
if (-not $lead) { Write-Host "Kein Lead gefunden. Bitte Leads importieren." -ForegroundColor Yellow; exit 1 }
# 3) Default-Sequenz anlegen + run
$seq = Invoke-RestMethod -Uri "$api/api/sequences/create_default" -Method Post -ContentType "application/json" -Body (@{name="Std"} | ConvertTo-Json)
Invoke-RestMethod -Uri "$api/api/sequences/run" -Method Post -ContentType "application/json" -Body (@{sequence_id=$seq.id; lead_id=$lead.id} | ConvertTo-Json) | Out-Host
Write-Host "Warte 70 Sekunden auf Scheduler…" -ForegroundColor Cyan
Start-Sleep -Seconds 70
Write-Host "Prüfe Logs unter: $HOME\Desktop\freiraum-mitarbeiter\logs\app.log" -ForegroundColor Green













