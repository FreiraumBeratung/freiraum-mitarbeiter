# Automation tests for Sprint 8
$base = "http://localhost:30521/api"

Write-Host "`n=== SPRINT 8 - AUTOMATION TESTS ===" -ForegroundColor Cyan

# 1) Auto-enqueue
Write-Host "`n[1] POST /automation/auto" -ForegroundColor Yellow
try {
  $auto = Invoke-RestMethod -Method Post -Uri "$base/automation/auto?user_id=denis"
  Write-Host "  ✓ Auto-enqueue erfolgreich" -ForegroundColor Green
  Write-Host "    Queued: $($auto.queued)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Auto-enqueue failed: $_" -ForegroundColor Red
  exit 1
}

# 2) List queue
Write-Host "`n[2] GET /automation/queue" -ForegroundColor Yellow
try {
  $queue = Invoke-RestMethod -Method Get -Uri "$base/automation/queue?user_id=denis"
  Write-Host "  ✓ Queue geladen" -ForegroundColor Green
  Write-Host "    Items: $($queue.items.Count)" -ForegroundColor Gray
  $queue.items | ForEach-Object { 
    Write-Host "    - #$($_.id): $($_.title) [$($_.status)] (Score: $([math]::Round($_.score * 100))%)" -ForegroundColor Cyan 
  }
} catch {
  Write-Host "  ✗ Queue failed: $_" -ForegroundColor Red
  exit 1
}

# 3) Approve all queued
Write-Host "`n[3] POST /automation/approve" -ForegroundColor Yellow
try {
  $queued = $queue.items | Where-Object { $_.status -eq "queued" }
  if ($queued.Count -gt 0) {
    $ids = $queued | ForEach-Object { $_.id }
    $approve = Invoke-RestMethod -Method Post -Uri "$base/automation/approve" -ContentType "application/json" -Body (@{ ids = $ids; approve = $true } | ConvertTo-Json)
    Write-Host "  ✓ Approve erfolgreich" -ForegroundColor Green
    Write-Host "    Approved: $($approve.count)" -ForegroundColor Gray
  } else {
    Write-Host "  ⚠ Keine queued Items zum Approven" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  ✗ Approve failed: $_" -ForegroundColor Red
}

# 4) Run approved
Write-Host "`n[4] POST /automation/run" -ForegroundColor Yellow
try {
  $run = Invoke-RestMethod -Method Post -Uri "$base/automation/run?user_id=denis"
  Write-Host "  ✓ Run erfolgreich" -ForegroundColor Green
  Write-Host "    Results: $($run.results.Count)" -ForegroundColor Gray
  $run.results | ForEach-Object {
    if ($_.ok) {
      Write-Host "    ✓ $($_.key)" -ForegroundColor Green
    } else {
      Write-Host "    ✗ $($_.key): $($_.error)" -ForegroundColor Red
    }
  }
} catch {
  Write-Host "  ✗ Run failed: $_" -ForegroundColor Red
}

# 5) Show final queue
Write-Host "`n[5] GET /automation/queue (Final)" -ForegroundColor Yellow
try {
  $final = Invoke-RestMethod -Method Get -Uri "$base/automation/queue?user_id=denis"
  Write-Host "  ✓ Final Queue geladen" -ForegroundColor Green
  Write-Host "    Items: $($final.items.Count)" -ForegroundColor Gray
  $final.items | Group-Object -Property status | ForEach-Object {
    Write-Host "    $($_.Name): $($_.Count)" -ForegroundColor Cyan
  }
} catch {
  Write-Host "  ✗ Final Queue failed: $_" -ForegroundColor Red
}

Write-Host "`n=== TESTS ABGESCHLOSSEN ===" -ForegroundColor Green

















