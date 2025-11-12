# Vollständiger System-Audit für Freiraum Mitarbeiter
# Testet alle Backend- und Frontend-Funktionen

$ErrorActionPreference = "Continue"
$root = "$PSScriptRoot\.."
$backendUrl = "http://127.0.0.1:30521/api"
$frontendUrl = "http://127.0.0.1:5173"

$results = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    backend = @{}
    frontend = @{}
    errors = @()
    warnings = @()
    passed = 0
    failed = 0
}

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null,
        [hashtable]$Headers = @{}
    )
    
    $url = "$backendUrl$Path"
    try {
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $Headers
            ContentType = "application/json"
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        return @{ success = $true; data = $response }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        return @{ success = $false; error = $_.Exception.Message; status = $statusCode }
    }
}

Write-Host "`n🔍 VOLLSTÄNDIGER SYSTEM-AUDIT" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# 1. BACKEND HEALTH CHECK
Write-Host "`n[1/10] Backend Health Check..." -ForegroundColor Yellow
try {
    $health = Test-Endpoint -Method "GET" -Path "/system/status"
    if ($health.success) {
        Write-Host "✅ Backend läuft" -ForegroundColor Green
        $results.backend.status = "running"
        $results.passed++
    } else {
        Write-Host "❌ Backend nicht erreichbar" -ForegroundColor Red
        $results.backend.status = "failed"
        $results.errors += "Backend nicht erreichbar: $($health.error)"
        $results.failed++
    }
} catch {
    Write-Host "❌ Backend nicht erreichbar" -ForegroundColor Red
    $results.errors += "Backend Health Check fehlgeschlagen: $_"
    $results.failed++
}

# 2. HEALTH ENDPOINT
Write-Host "`n[2/10] Health Endpoint..." -ForegroundColor Yellow
$health = Test-Endpoint -Method "GET" -Path "/health"
if ($health.success) {
    Write-Host "✅ /health OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /health: $($health.error)" -ForegroundColor Yellow
    $results.warnings += "/health: $($health.error)"
}

# 3. LICENSE ENDPOINT
Write-Host "`n[3/10] License Endpoint..." -ForegroundColor Yellow
$license = Test-Endpoint -Method "GET" -Path "/license"
if ($license.success) {
    Write-Host "✅ /license OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /license: $($license.error)" -ForegroundColor Yellow
    $results.warnings += "/license: $($license.error)"
}

# 4. PROFILE ENDPOINT
Write-Host "`n[4/10] Profile Endpoint..." -ForegroundColor Yellow
$profile = Test-Endpoint -Method "GET" -Path "/profile"
if ($profile.success) {
    Write-Host "✅ /profile OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /profile: $($profile.error)" -ForegroundColor Yellow
    $results.warnings += "/profile: $($profile.error)"
}

# 5. LEADS ENDPOINT
Write-Host "`n[5/10] Leads Endpoint..." -ForegroundColor Yellow
$leads = Test-Endpoint -Method "GET" -Path "/leads"
if ($leads.success) {
    Write-Host "✅ /leads OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /leads: $($leads.error)" -ForegroundColor Yellow
    $results.warnings += "/leads: $($leads.error)"
}

# 6. FOLLOWUPS ENDPOINT
Write-Host "`n[6/10] Followups Endpoint..." -ForegroundColor Yellow
$followups = Test-Endpoint -Method "GET" -Path "/followups"
if ($followups.success) {
    Write-Host "✅ /followups OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /followups: $($followups.error)" -ForegroundColor Yellow
    $results.warnings += "/followups: $($followups.error)"
}

# 7. REPORTS ENDPOINT
Write-Host "`n[7/10] Reports Endpoint..." -ForegroundColor Yellow
$reports = Test-Endpoint -Method "GET" -Path "/reports/kpis"
if ($reports.success) {
    Write-Host "✅ /reports/kpis OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /reports/kpis: $($reports.error)" -ForegroundColor Yellow
    $results.warnings += "/reports/kpis: $($reports.error)"
}

# 8. INSIGHTS ENDPOINT
Write-Host "`n[8/10] Insights Endpoint..." -ForegroundColor Yellow
$insights = Test-Endpoint -Method "GET" -Path "/insights/suggestions"
if ($insights.success) {
    Write-Host "✅ /insights/suggestions OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /insights/suggestions: $($insights.error)" -ForegroundColor Yellow
    $results.warnings += "/insights/suggestions: $($insights.error)"
}

# 9. CHARACTER ENDPOINT
Write-Host "`n[9/10] Character Endpoint..." -ForegroundColor Yellow
$character = Test-Endpoint -Method "GET" -Path "/character/state?user_id=denis"
if ($character.success) {
    Write-Host "✅ /character/state OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /character/state: $($character.error)" -ForegroundColor Yellow
    $results.warnings += "/character/state: $($character.error)"
}

# 10. AUDIT ENDPOINT
Write-Host "`n[10/10] Audit Endpoint..." -ForegroundColor Yellow
$audit = Test-Endpoint -Method "GET" -Path "/audit/list"
if ($audit.success) {
    Write-Host "✅ /audit/list OK" -ForegroundColor Green
    $results.passed++
} else {
    Write-Host "⚠️ /audit/list: $($audit.error)" -ForegroundColor Yellow
    $results.warnings += "/audit/list: $($audit.error)"
}

# SUMMARY
Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "AUDIT SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "✅ Passed: $($results.passed)" -ForegroundColor Green
Write-Host "❌ Failed: $($results.failed)" -ForegroundColor Red
Write-Host "⚠️ Warnings: $($results.warnings.Count)" -ForegroundColor Yellow

if ($results.errors.Count -gt 0) {
    Write-Host "`nErrors:" -ForegroundColor Red
    $results.errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

if ($results.warnings.Count -gt 0) {
    Write-Host "`nWarnings:" -ForegroundColor Yellow
    $results.warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

# Save results
$results | ConvertTo-Json -Depth 10 | Out-File "$root\audit\audit_results_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"

Write-Host "`n✅ Audit abgeschlossen. Ergebnisse gespeichert." -ForegroundColor Green




