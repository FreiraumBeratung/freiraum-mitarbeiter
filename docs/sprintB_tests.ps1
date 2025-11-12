# Smoke tests for Sprint B - Voice AI Router 2.0
$base = "http://localhost:30521/api"

Write-Host "`n=== SPRINT B - VOICE AI ROUTER 2.0 TESTS ===" -ForegroundColor Cyan

# 1) Set default pref to "ask"
Write-Host "`n[1] Set Voice Default Pref to 'ask'" -ForegroundColor Yellow
try {
  Invoke-RestMethod -Method Post -Uri "$base/profile/set" -ContentType "application/json" -Body (@{key="voice.leads.default_mode"; value="ask"} | ConvertTo-Json) | Out-Null
  Write-Host "  ✓ Pref gesetzt" -ForegroundColor Green
} catch {
  Write-Host "  ✗ Failed: $_" -ForegroundColor Red
}

# 2) Voice command (ask path)
Write-Host "`n[2] POST /api/voice/command (ask mode)" -ForegroundColor Yellow
try {
  $cmd = @{ user_id="denis"; text="Such 20 SHK Betriebe in Arnsberg" } | ConvertTo-Json
  $result = Invoke-RestMethod -Method Post -Uri "$base/voice/command" -ContentType "application/json" -Body $cmd
  Write-Host "  ✓ Voice Command erfolgreich" -ForegroundColor Green
  Write-Host "    Decision: $($result.decision)" -ForegroundColor Gray
  Write-Host "    Reason: $($result.reason)" -ForegroundColor Gray
  Write-Host "    Eligible Actions: $($result.eligible.Count)" -ForegroundColor Gray
  Write-Host "    Enqueued: $($result.enqueued)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Failed: $_" -ForegroundColor Red
}

# 3) Show queue
Write-Host "`n[3] GET /api/automation/queue" -ForegroundColor Yellow
try {
  $queue = Invoke-RestMethod -Method Get -Uri "$base/automation/queue?user_id=denis"
  Write-Host "  ✓ Queue geladen" -ForegroundColor Green
  Write-Host "    Items: $($queue.items.Count)" -ForegroundColor Gray
  $queue.items | Where-Object {$_.status -eq "queued"} | Select-Object -First 3 | ForEach-Object {
    Write-Host "    - #$($_.id): $($_.title) [$($_.status)]" -ForegroundColor Cyan
  }
} catch {
  Write-Host "  ✗ Failed: $_" -ForegroundColor Red
}

# 4) Switch to "outreach" pref and run again
Write-Host "`n[4] Set Pref to 'outreach' and test" -ForegroundColor Yellow
try {
  Invoke-RestMethod -Method Post -Uri "$base/profile/set" -ContentType "application/json" -Body (@{key="voice.leads.default_mode"; value="outreach"} | ConvertTo-Json) | Out-Null
  Write-Host "  ✓ Pref auf 'outreach' gesetzt" -ForegroundColor Green
  
  $cmd2 = @{ user_id="denis"; text="Such 10 Elektro Firmen in Neheim und direkt anschreiben" } | ConvertTo-Json
  $result2 = Invoke-RestMethod -Method Post -Uri "$base/voice/command" -ContentType "application/json" -Body $cmd2
  Write-Host "  ✓ Voice Command erfolgreich" -ForegroundColor Green
  Write-Host "    Decision: $($result2.decision)" -ForegroundColor Gray
  Write-Host "    Reason: $($result2.reason)" -ForegroundColor Gray
  Write-Host "    Enqueued: $($result2.enqueued)" -ForegroundColor Gray
  
  # Show updated queue
  $queue2 = Invoke-RestMethod -Method Get -Uri "$base/automation/queue?user_id=denis"
  Write-Host "    Queue Items: $($queue2.items.Count)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Failed: $_" -ForegroundColor Red
}

Write-Host "`n=== TESTS ABGESCHLOSSEN ===" -ForegroundColor Green

















