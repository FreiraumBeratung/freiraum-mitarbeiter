# Sprint H - Avatar-UI Tests
$base = "http://localhost:30521/api"

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "SPRINT H - AVATAR-UI TESTS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

# 1) Seed suggestions (optional für Demo)
Write-Host "`n1. Seed Suggestions..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Method Post -Uri "$base/insights/seed" -TimeoutSec 10 | Out-Null
    Write-Host "  ✓ Suggestions seeded" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ Seed failed (optional)" -ForegroundColor Yellow
}

# 2) Decision think (soll Aktionen liefern)
Write-Host "`n2. Decision Think..." -ForegroundColor Cyan
try {
    $think = Invoke-RestMethod -Method Post -Uri "$base/decision/think" -ContentType "application/json" -Body (@{ user_id = "denis"; max = 5 } | ConvertTo-Json)
    Write-Host "  ✓ Think successful" -ForegroundColor Green
    Write-Host "  Actions found: $($think.actions.Count)" -ForegroundColor Gray
    if ($think.actions.Count -gt 0) {
        Write-Host "  Top action: $($think.actions[0].title)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ✗ Think failed: $_" -ForegroundColor Red
}

# 3) Fetch suggestions
Write-Host "`n3. Fetch Suggestions..." -ForegroundColor Cyan
try {
    $suggestions = Invoke-RestMethod -Method Get -Uri "$base/insights/suggestions" -TimeoutSec 10
    Write-Host "  ✓ Suggestions fetched" -ForegroundColor Green
    Write-Host "  Count: $($suggestions.Count)" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ Fetch failed: $_" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Öffne Frontend (http://localhost:5173)" -ForegroundColor Cyan
Write-Host "2. Warte bis Avatar-Bubble erscheint (alle 45s Polling)" -ForegroundColor Cyan
Write-Host "3. Teste Buttons: 'Anhör'n', 'Denk mal', 'Starte #1'" -ForegroundColor Cyan
Write-Host "4. Prüfe Auto-Sprechen Toggle und Lautstärke-Slider" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Magenta
















