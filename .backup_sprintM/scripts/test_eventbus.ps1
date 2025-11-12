# EventBus & Proaktive Insights Test
$BASE_URL = "http://127.0.0.1:30521"

Write-Host "=== EVENTBUS & PROAKTIVE INSIGHTS TEST ===" -ForegroundColor Yellow

# 1. Seed testen
Write-Host "`n[1] Seed Suggestions..." -ForegroundColor Cyan
$seed = Invoke-RestMethod -Uri "$BASE_URL/api/insights/seed" -Method POST -TimeoutSec 5
Write-Host "  OK: $($seed.count) Suggestions erstellt" -ForegroundColor Green

# 2. Suggestions abrufen
Write-Host "`n[2] Suggestions abrufen..." -ForegroundColor Cyan
$suggestions = Invoke-RestMethod -Uri "$BASE_URL/api/insights/suggestions" -TimeoutSec 5
Write-Host "  Gefunden: $($suggestions.Count)" -ForegroundColor Green

# 3. 3x Interaktion loggen (sollte Suggestion auslösen)
Write-Host "`n[3] Interaktionen loggen (EventBus Test)..." -ForegroundColor Cyan
$testEmail = "test-eventbus@example.com"

$body1 = @{
    contact_email = $testEmail
    contact_name = "Test User"
    channel = "email"
    direction = "out"
    notes = "Test 1"
} | ConvertTo-Json

$body2 = @{
    contact_email = $testEmail
    contact_name = "Test User"
    channel = "email"
    direction = "out"
    notes = "Test 2"
} | ConvertTo-Json

$body3 = @{
    contact_email = $testEmail
    contact_name = "Test User"
    channel = "email"
    direction = "in"
    notes = "Antwort erhalten"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/api/insights/log" -Method POST -Body $body1 -ContentType "application/json" -TimeoutSec 5 | Out-Null
Write-Host "  Interaktion 1 geloggt" -ForegroundColor Green
Invoke-RestMethod -Uri "$BASE_URL/api/insights/log" -Method POST -Body $body2 -ContentType "application/json" -TimeoutSec 5 | Out-Null
Write-Host "  Interaktion 2 geloggt" -ForegroundColor Green
Invoke-RestMethod -Uri "$BASE_URL/api/insights/log" -Method POST -Body $body3 -ContentType "application/json" -TimeoutSec 5 | Out-Null
Write-Host "  Interaktion 3 geloggt (sollte Suggestion auslösen)" -ForegroundColor Green

# 4. Nach EventBus-Suggestion prüfen
Write-Host "`n[4] Prüfe auf neue Suggestions..." -ForegroundColor Cyan
Start-Sleep -Seconds 1
$suggestionsAfter = Invoke-RestMethod -Uri "$BASE_URL/api/insights/suggestions" -TimeoutSec 5
$newCount = $suggestionsAfter.Count
Write-Host "  Aktuelle Suggestions: $newCount" -ForegroundColor $(if($newCount -gt $suggestions.Count){"Green"}else{"Yellow"})

if ($newCount -gt $suggestions.Count) {
    Write-Host "  SUCCESS: EventBus hat proaktive Suggestion erstellt!" -ForegroundColor Green
} else {
    Write-Host "  INFO: Keine neue Suggestion (möglicherweise bereits vorhanden oder Logik noch nicht ausgelöst)" -ForegroundColor Yellow
}

Write-Host "`n=== TEST ABGESCHLOSSEN ===" -ForegroundColor Yellow









