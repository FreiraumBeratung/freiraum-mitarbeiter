# Smoke tests for Sprint D - Outreach-Sequenzen & Kalender 1.0
$base = "http://localhost:30521/api"

Write-Host "`n=== SPRINT D - OUTREACH-SEQUENZEN & KALENDER 1.0 TESTS ===" -ForegroundColor Cyan

# 1) Create a default sequence
Write-Host "`n[1] POST /api/sequences (Create)" -ForegroundColor Yellow
try {
  $seq = @{
    name = "Freiraum Intro 3-Step"
    description = "Intro + 2 Followups"
    steps = @(
      @{day_offset = 0; subject = "Kurze Info von Freiraum"; body = "Hallo {{company}}, kurze Info aus {{city}} …"; attach_flyer = $true},
      @{day_offset = 3; subject = "Kurze Erinnerung"; body = "Hallo {{company}}, kurze Erinnerung …"; attach_flyer = $false},
      @{day_offset = 7; subject = "Letzter kurzer Ping"; body = "Hallo {{company}}, letzter Ping – 15 Min Kennenlernen?"; attach_flyer = $false}
    )
  } | ConvertTo-Json -Depth 6
  
  $result = Invoke-RestMethod -Method Post -Uri "$base/sequences" -ContentType "application/json" -Body $seq
  Write-Host "  ✓ Sequence erstellt: $($result.name)" -ForegroundColor Green
  Write-Host "    Steps: $($result.steps.Count)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Create failed: $_" -ForegroundColor Red
}

# 2) Pick some leads and run sequence
Write-Host "`n[2] POST /api/sequences/run" -ForegroundColor Yellow
try {
  $leads = Invoke-RestMethod -Method Get -Uri "$base/leads"
  $ids = @()
  foreach ($l in $leads) {
    if ($ids.Count -lt 3) { $ids += $l.id }
  }
  $run = @{ sequence_id = 1; lead_ids = $ids; attach_flyer = $true } | ConvertTo-Json
  $runResult = Invoke-RestMethod -Method Post -Uri "$base/sequences/run" -ContentType "application/json" -Body $run
  Write-Host "  ✓ Run erfolgreich: #$($runResult.id) -> $($runResult.status)" -ForegroundColor Green
  Write-Host "    Logs: $($runResult.logs.Length) Zeichen" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Run failed: $_" -ForegroundColor Red
}

# 3) Voice calendar quick-check via decision.execute
Write-Host "`n[3] POST /api/decision/execute (calendar.create)" -ForegroundColor Yellow
try {
  $start = (Get-Date).AddDays(1).Date.AddHours(10).ToString("s")
  $end = (Get-Date).AddDays(1).Date.AddHours(10).AddMinutes(30).ToString("s")
  $act = @{
    user_id = "denis"
    actions = @(@{
      key = "calendar.create"
      title = "Termin"
      reason = "test"
      score = 0.9
      payload = @{
        title = "Besprechung Freiraum"
        start = $start
        end = $end
        attendees = @("test@example.com")
        location = "Online"
      }
    })
    dry_run = $false
  } | ConvertTo-Json -Depth 6
  
  $execResult = Invoke-RestMethod -Method Post -Uri "$base/decision/execute" -ContentType "application/json" -Body $act
  Write-Host "  ✓ Execute erfolgreich" -ForegroundColor Green
  Write-Host "    Results: $($execResult.results.Count)" -ForegroundColor Gray
  $execResult.results | ForEach-Object {
    if ($_.ok) {
      Write-Host "      OK: $($_.key)" -ForegroundColor Green
    } else {
      Write-Host "      FAIL: $($_.key)" -ForegroundColor Red
    }
  }
} catch {
  Write-Host "  ✗ Execute failed: $_" -ForegroundColor Red
}

# 4) List calendar items
Write-Host "`n[4] GET /api/calendar/list" -ForegroundColor Yellow
try {
  $calendar = Invoke-RestMethod -Method Get -Uri "$base/calendar/list"
  Write-Host "  ✓ Calendar List erfolgreich" -ForegroundColor Green
  Write-Host "    Events: $($calendar.Count)" -ForegroundColor Gray
  $calendar | Select-Object -First 3 | ForEach-Object {
    Write-Host "      - $($_.title): $($_.start)" -ForegroundColor Cyan
  }
} catch {
  Write-Host "  ✗ List failed: $_" -ForegroundColor Red
}

# 5) Test intent parsing for calendar
Write-Host "`n[5] POST /api/intent/parse (calendar command)" -ForegroundColor Yellow
try {
  $intent = Invoke-RestMethod -Method Post -Uri "$base/intent/parse" -ContentType "application/json" -Body (@{user_id="denis"; text="Trag mir Freitag 10 Uhr einen Termin ein"} | ConvertTo-Json)
  Write-Host "  ✓ Intent Parse erfolgreich" -ForegroundColor Green
  Write-Host "    Intent: $($intent.intent)" -ForegroundColor Gray
  Write-Host "    Start: $($intent.slots.start)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Parse failed: $_" -ForegroundColor Red
}

Write-Host "`n=== TESTS ABGESCHLOSSEN ===" -ForegroundColor Green
















