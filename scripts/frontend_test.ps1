# Frontend-Test - Alle Seiten und Funktionen
$frontend = "http://localhost:5173"
$backend = "http://localhost:30521/api"

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "FRONTEND FUNKTIONSTEST" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

$errors = @()
$success = @()

# Test Frontend erreichbar
Write-Host "`n1. Frontend Connectivity..." -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri $frontend -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) {
        $script:success += "Frontend erreichbar"
        Write-Host "  [OK] Frontend erreichbar (Status: $($r.StatusCode))" -ForegroundColor Green
    }
} catch {
    $script:errors += "Frontend nicht erreichbar: $_"
    Write-Host "  [FAIL] Frontend nicht erreichbar: $_" -ForegroundColor Red
}

# Test Backend Connectivity from Frontend perspective
Write-Host "`n2. Backend Connectivity (from Frontend)..." -ForegroundColor Cyan
try {
    $r = Invoke-RestMethod -Uri "$backend/health" -TimeoutSec 10
    $script:success += "Backend erreichbar"
    Write-Host "  [OK] Backend erreichbar" -ForegroundColor Green
} catch {
    $script:errors += "Backend nicht erreichbar: $_"
    Write-Host "  [FAIL] Backend nicht erreichbar: $_" -ForegroundColor Red
}

# Test API Endpoints that Frontend uses
Write-Host "`n3. Frontend API Endpoints..." -ForegroundColor Cyan
$endpoints = @(
    @{name="Leads List"; method="GET"; path="/leads"},
    @{name="Followups Due"; method="GET"; path="/followups/due"},
    @{name="Insights"; method="GET"; path="/insights/suggestions"},
    @{name="Reports KPIs"; method="GET"; path="/reports/kpis"},
    @{name="Profile List"; method="GET"; path="/profile/"},
    @{name="Sequences List"; method="GET"; path="/sequences"},
    @{name="Calendar List"; method="GET"; path="/calendar/list"},
    @{name="KB List"; method="GET"; path="/kb/items"},
    @{name="Automation Queue"; method="GET"; path="/automation/queue?user_id=denis"},
    @{name="Decision History"; method="GET"; path="/decision/history?user_id=denis&limit=5"},
    @{name="Character State"; method="GET"; path="/character/state?user_id=denis"},
    @{name="Audit List"; method="GET"; path="/audit/list?limit=10"}
)

foreach ($ep in $endpoints) {
    try {
        $params = @{Method=$ep.method; Uri="$backend$($ep.path)"; TimeoutSec=10}
        $response = Invoke-RestMethod @params
        $script:success += $ep.name
        Write-Host "  [OK] $($ep.name)" -ForegroundColor Green
    } catch {
        $script:errors += "$($ep.name): $_"
        Write-Host "  [FAIL] $($ep.name): $_" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "FRONTEND TEST SUMMARY" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Success: $($success.Count)" -ForegroundColor Green
Write-Host "Errors: $($errors.Count)" -ForegroundColor $(if($errors.Count -gt 0){"Red"}else{"Green"})

if ($errors.Count -gt 0) {
    Write-Host "`nERRORS:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

if ($errors.Count -eq 0) {
    Write-Host "`n✅ Alle Frontend-Tests erfolgreich!" -ForegroundColor Green
    return 0
} else {
    return 1
}
















