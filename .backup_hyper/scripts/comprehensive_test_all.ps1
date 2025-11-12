# Comprehensive Test - Alle Funktionen Backend & Frontend
$base = "http://localhost:30521/api"
$errors = @()
$success = @()
$warnings = @()

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "COMPREHENSIVE TEST - ALL FUNCTIONS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

function Test-API {
    param($name, $method, $uri, $body = $null, $expectedStatus = 200)
    try {
        $params = @{
            Method = $method
            Uri = $uri
            TimeoutSec = 15
            ErrorAction = "Stop"
        }
        if ($body) {
            $params.ContentType = "application/json"
            $params.Body = $body | ConvertTo-Json -Depth 10
        }
        $response = Invoke-RestMethod @params
        $script:success += "$name"
        Write-Host "  [OK] $name" -ForegroundColor Green
        return $response
    } catch {
        $errMsg = "$name`: $($_.Exception.Message)"
        $script:errors += $errMsg
        Write-Host "  [FAIL] $name : $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# 1. Health Check
Write-Host "`n1. Health Check..." -ForegroundColor Cyan
$health = Test-API "Health" "GET" "$base/health"
if ($health -and $health.checks) {
    $checks = $health.checks
    if (-not $checks.db) { $script:warnings += "DB Check failed" }
    if (-not $checks.imap) { $script:warnings += "IMAP Check failed" }
    if (-not $checks.smtp) { $script:warnings += "SMTP Check failed" }
}

# 2. Audit Functions
Write-Host "`n2. Audit Functions..." -ForegroundColor Cyan
$auditList = Test-API "Audit List" "GET" "$base/audit/list?limit=10"
Test-API "Audit Export CSV" "GET" "$base/audit/export.csv?limit=5"
Test-API "Audit Export PDF" "GET" "$base/audit/export.pdf?limit=5"

# 3. Core APIs - GET
Write-Host "`n3. Core APIs (GET)..." -ForegroundColor Cyan
Test-API "Leads List" "GET" "$base/leads"
Test-API "Followups List" "GET" "$base/followups"
Test-API "Followups Due" "GET" "$base/followups/due"
Test-API "Insights Suggestions" "GET" "$base/insights/suggestions"
Test-API "Profile List" "GET" "$base/profile/"
Test-API "Reports KPIs" "GET" "$base/reports/kpis"
Test-API "License Get" "GET" "$base/license"

# 4. Sequences & Calendar
Write-Host "`n4. Sequences & Calendar..." -ForegroundColor Cyan
Test-API "Sequences List" "GET" "$base/sequences"
Test-API "Calendar List" "GET" "$base/calendar/list"

# 5. Knowledge Base
Write-Host "`n5. Knowledge Base..." -ForegroundColor Cyan
Test-API "KB List" "GET" "$base/kb/items"
Test-API "KB Search" "GET" "$base/kb/search?q=test"

# 6. Automation
Write-Host "`n6. Automation..." -ForegroundColor Cyan
Test-API "Automation Queue" "GET" "$base/automation/queue?user_id=denis"

# 7. Decision
Write-Host "`n7. Decision..." -ForegroundColor Cyan
Test-API "Decision History" "GET" "$base/decision/history?user_id=denis&limit=5"

# 8. Character
Write-Host "`n8. Character..." -ForegroundColor Cyan
Test-API "Character State" "GET" "$base/character/state?user_id=denis"
Test-API "Character Profile" "GET" "$base/character/profile?user_id=denis"

# 9. Action Triggers (POST)
Write-Host "`n9. Action Triggers (POST)..." -ForegroundColor Cyan
Test-API "Offer Draft" "POST" "$base/offers/draft" @{ customer = "Test GmbH"; items = @(@{ name = "Service"; qty = 1; unit_price = 100 }) }
Test-API "Lead Hunt" "POST" "$base/lead_hunter/hunt" @{ category = "shk"; location = "arnsberg"; count = 2; save_to_db = $false }
Test-API "Decision Think" "POST" "$base/decision/think" @{ user_id = "denis"; max_actions = 3 }

# 10. Verify Audit Logs
Write-Host "`n10. Verify Audit Logs..." -ForegroundColor Cyan
$auditAfter = Test-API "Audit List (after actions)" "GET" "$base/audit/list?limit=20"
if ($auditAfter -and $auditAfter.Count -gt 0) {
    Write-Host "  [INFO] Found $($auditAfter.Count) audit entries" -ForegroundColor Green
} else {
    $script:warnings += "Audit logging might not be working - no entries found"
}

# Summary
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "TEST SUMMARY" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Success: $($success.Count)" -ForegroundColor Green
Write-Host "Errors: $($errors.Count)" -ForegroundColor $(if($errors.Count -gt 0){"Red"}else{"Green"})
Write-Host "Warnings: $($warnings.Count)" -ForegroundColor $(if($warnings.Count -gt 0){"Yellow"}else{"Green"})

if ($errors.Count -gt 0) {
    Write-Host "`nERRORS:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

if ($warnings.Count -gt 0) {
    Write-Host "`nWARNINGS:" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

if ($errors.Count -eq 0) {
    Write-Host "`nAll tests passed!" -ForegroundColor Green
    return 0
} else {
    return 1
}





