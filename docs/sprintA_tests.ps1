# Smoke tests for Sprint A - KB + Intent
$base = "http://localhost:30521/api"

Write-Host "`n=== SPRINT A - KNOWLEDGE & MEMORY 2.0 + INTENT TESTS ===" -ForegroundColor Cyan

# 1) KB seed
Write-Host "`n[1] POST /api/kb/items (Seed)" -ForegroundColor Yellow
try {
  $kb1 = @{
    topic = "Lead-Kriterien SHK"
    tags = @("leads", "shk", "sauerland")
    content = "Region HSK/Sauerland; Firmen mit Telefonnummer und E-Mail; mind. 3 Mitarbeiter; Webseitenkontakt vorhanden."
  } | ConvertTo-Json
  
  $result = Invoke-RestMethod -Method Post -Uri "$base/kb/items" -ContentType "application/json" -Body $kb1
  Write-Host "  ✓ KB Item erstellt: ID $($result.id)" -ForegroundColor Green
} catch {
  Write-Host "  ✗ KB Create failed: $_" -ForegroundColor Red
}

# 2) KB search
Write-Host "`n[2] GET /api/kb/search" -ForegroundColor Yellow
try {
  $search = Invoke-RestMethod -Method Get -Uri "$base/kb/search?q=SHK%20Sauerland%20E-Mail%20Telefon"
  Write-Host "  ✓ KB Search erfolgreich" -ForegroundColor Green
  Write-Host "    Treffer: $($search.results.Count)" -ForegroundColor Gray
  $search.results | ForEach-Object {
    Write-Host "    - #$($_.id): $($_.topic) (Score: $([math]::Round($_.score * 100))%)" -ForegroundColor Cyan
  }
} catch {
  Write-Host "  ✗ KB Search failed: $_" -ForegroundColor Red
}

# 3) Intent parse (voice simulation)
Write-Host "`n[3] POST /api/intent/parse" -ForegroundColor Yellow
try {
  $cmd = @{
    user_id = "denis"
    text = "Such mir 20 SHK Betriebe in Arnsberg und direkt anschreiben."
  } | ConvertTo-Json
  
  $parsed = Invoke-RestMethod -Method Post -Uri "$base/intent/parse" -ContentType "application/json" -Body $cmd
  Write-Host "  ✓ Intent Parse erfolgreich" -ForegroundColor Green
  Write-Host "    Intent: $($parsed.intent)" -ForegroundColor Gray
  Write-Host "    Confidence: $([math]::Round($parsed.confidence * 100))%" -ForegroundColor Gray
  Write-Host "    Kategorie: $($parsed.slots.category)" -ForegroundColor Gray
  Write-Host "    Ort: $($parsed.slots.location)" -ForegroundColor Gray
  Write-Host "    Modus: $($parsed.slots.mode)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Intent Parse failed: $_" -ForegroundColor Red
  exit 1
}

# 4) Intent act -> Queue
Write-Host "`n[4] POST /api/intent/act (→ Automation Queue)" -ForegroundColor Yellow
try {
  $act = Invoke-RestMethod -Method Post -Uri "$base/intent/act" -ContentType "application/json" -Body $cmd
  Write-Host "  ✓ Intent Act erfolgreich" -ForegroundColor Green
  Write-Host "    Queued: $($act.queued) Aktionen" -ForegroundColor Gray
  $act.actions | ForEach-Object {
    Write-Host "    - $($_.title) (Score: $([math]::Round($_.score * 100))%)" -ForegroundColor Cyan
  }
} catch {
  Write-Host "  ✗ Intent Act failed: $_" -ForegroundColor Red
}

# 5) Show queue
Write-Host "`n[5] GET /api/automation/queue" -ForegroundColor Yellow
try {
  $queue = Invoke-RestMethod -Method Get -Uri "$base/automation/queue?user_id=denis"
  Write-Host "  ✓ Queue geladen" -ForegroundColor Green
  Write-Host "    Items: $($queue.items.Count)" -ForegroundColor Gray
  $queue.items | Where-Object { $_.status -eq "queued" } | ForEach-Object {
    Write-Host "    - #$($_.id): $($_.title) [$($_.status)]" -ForegroundColor Cyan
  }
} catch {
  Write-Host "  ✗ Queue failed: $_" -ForegroundColor Red
}

Write-Host "`n=== TESTS ABGESCHLOSSEN ===" -ForegroundColor Green

















