# Smoke tests for Decision Engine
$base = "http://localhost:30521/api"

Write-Host "`n=== SPRINT 7 - DECISION ENGINE TESTS ===" -ForegroundColor Cyan

# 1) Prime Character with a few events
Write-Host "`n[1] Prime Character Events..." -ForegroundColor Yellow
$events = @(
  @{ user_id="denis"; role="user"; text="Bitte später Angebote prüfen und KPIs zeigen." },
  @{ user_id="denis"; role="user"; text="Follow-up heute fällig, Bro!" },
  @{ user_id="denis"; role="assistant"; text="Verstanden. Ich bereite die Follow-ups vor." }
)

foreach ($e in $events) {
  try {
    Invoke-RestMethod -Method Post -Uri "$base/character/event" -ContentType "application/json" -Body ($e | ConvertTo-Json) | Out-Null
    Write-Host "  ✓ Event: $($e.text)" -ForegroundColor Gray
  } catch {
    Write-Host "  ✗ Event failed: $_" -ForegroundColor Red
  }
}

# 2) Think
Write-Host "`n[2] POST /decision/think" -ForegroundColor Yellow
try {
  $think = Invoke-RestMethod -Method Post -Uri "$base/decision/think" -ContentType "application/json" -Body (@{ user_id="denis"; max_actions=5 } | ConvertTo-Json)
  Write-Host "  ✓ Think erfolgreich" -ForegroundColor Green
  Write-Host "    Mood: $($think.mood), Actions: $($think.actions.Count)" -ForegroundColor Gray
  $think.actions | ForEach-Object { Write-Host "    - $($_.title) ($([math]::Round($_.score * 100))%)" -ForegroundColor Cyan }
} catch {
  Write-Host "  ✗ Think failed: $_" -ForegroundColor Red
  exit 1
}

# 3) Dry-Run execute
Write-Host "`n[3] POST /decision/execute (Dry-Run)" -ForegroundColor Yellow
try {
  $execDry = Invoke-RestMethod -Method Post -Uri "$base/decision/execute" -ContentType "application/json" -Body (@{ user_id="denis"; actions=$think.actions; dry_run=$true } | ConvertTo-Json -Depth 5)
  Write-Host "  ✓ Dry-Run erfolgreich" -ForegroundColor Green
  Write-Host "    Executed: $($execDry.executed)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Dry-Run failed: $_" -ForegroundColor Red
}

# 4) Full run (auto_execute)
Write-Host "`n[4] POST /decision/run (Auto-Execute)" -ForegroundColor Yellow
try {
  $run = Invoke-RestMethod -Method Post -Uri "$base/decision/run?user_id=denis&max_actions=5&auto_execute=true&dry_run=false"
  Write-Host "  ✓ Run erfolgreich" -ForegroundColor Green
  Write-Host "    Run ID: $($run.run_id), Executed: $($run.executed)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Run failed: $_" -ForegroundColor Red
}

# 5) History
Write-Host "`n[5] GET /decision/history" -ForegroundColor Yellow
try {
  $hist = Invoke-RestMethod -Method Get -Uri "$base/decision/history?user_id=denis&limit=5"
  Write-Host "  ✓ History geladen" -ForegroundColor Green
  Write-Host "    Runs: $($hist.items.Count)" -ForegroundColor Gray
  $hist.items | ForEach-Object { Write-Host "    - Run #$($_.id): $($_.mood), Executed: $($_.executed)" -ForegroundColor Cyan }
} catch {
  Write-Host "  ✗ History failed: $_" -ForegroundColor Red
}

Write-Host "`n=== TESTS ABGESCHLOSSEN ===" -ForegroundColor Green



















