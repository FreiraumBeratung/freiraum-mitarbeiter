# Full Audit Test - Alle Funktionen testen
$base = "http://localhost:30521/api"
$errors = @()
$success = @()

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "FULL AUDIT TEST - ALL FUNCTIONS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

function Test-API {
    param($name, $method, $uri, $body = $null, $expectedStatus = 200)
    try {
        $params = @{
            Method = $method
            Uri = $uri
            TimeoutSec = 10
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
Test-API "Health" "GET" "$base/health"

# 2. Audit Functions
Write-Host "`n2. Audit Functions..." -ForegroundColor Cyan
Test-API "Audit List" "GET" "$base/audit/list?limit=10"
$csvTest = Test-API "Audit Export CSV" "GET" "$base/audit/export.csv?limit=5"
$pdfTest = Test-API "Audit Export PDF" "GET" "$base/audit/export.pdf?limit=5"

# 3. Trigger Actions to generate Audit Logs
Write-Host "`n3. Trigger Actions (for Audit Logging)..." -ForegroundColor Cyan
Test-API "Offer Draft" "POST" "$base/offers/draft" @{ customer = "Test GmbH"; items = @(@{ name = "Service"; qty = 1; unit_price = 100 }) }
Test-API "Lead Hunt" "POST" "$base/lead_hunter/hunt" @{ category = "shk"; location = "arnsberg"; count = 2; save_to_db = $false }
Test-API "Decision Think" "POST" "$base/decision/think" @{ user_id = "denis"; max_actions = 3 }
Test-API "Decision Execute" "POST" "$base/decision/execute" @{ user_id = "denis"; actions = @(@{ key = "reports.show_kpis"; title = "KPIs"; reason = "test"; score = 0.8 }); dry_run = $false }

# 4. Verify Audit Logs were created
Write-Host "`n4. Verify Audit Logs..." -ForegroundColor Cyan
$auditLogs = Test-API "Audit List (after actions)" "GET" "$base/audit/list?limit=20"
if ($auditLogs -and $auditLogs.Count -gt 0) {
    Write-Host "  [INFO] Found $($auditLogs.Count) audit entries" -ForegroundColor Green
} else {
    $script:errors += "Audit logging not working - no entries found"
    Write-Host "  [WARN] No audit entries found" -ForegroundColor Yellow
}

# 5. Core APIs
Write-Host "`n5. Core APIs..." -ForegroundColor Cyan
Test-API "Leads List" "GET" "$base/leads"
Test-API "Followups List" "GET" "$base/followups"
Test-API "Followups Due" "GET" "$base/followups/due"
Test-API "Insights Suggestions" "GET" "$base/insights/suggestions"
Test-API "Profile List" "GET" "$base/profile/"
Test-API "Reports KPIs" "GET" "$base/reports/kpis"

# 6. Sequences
Write-Host "`n6. Sequences..." -ForegroundColor Cyan
Test-API "Sequences List" "GET" "$base/sequences"

# 7. Calendar
Write-Host "`n7. Calendar..." -ForegroundColor Cyan
Test-API "Calendar List" "GET" "$base/calendar/list"

# 8. Voice/Intent
Write-Host "`n8. Voice/Intent..." -ForegroundColor Cyan
Test-API "Intent Parse" "POST" "$base/intent/parse" @{ user_id = "denis"; text = "test" }
Test-API "Intent Act" "POST" "$base/intent/act" @{ user_id = "denis"; text = "test" }

# 9. Knowledge Base
Write-Host "`n9. Knowledge Base..." -ForegroundColor Cyan
Test-API "KB List" "GET" "$base/kb/items"
Test-API "KB Search" "GET" "$base/kb/search?q=test"

# 10. Automation
Write-Host "`n10. Automation..." -ForegroundColor Cyan
Test-API "Automation Queue" "GET" "$base/automation/queue?user_id=denis"

# Summary
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "AUDIT SUMMARY" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Success: $($success.Count)" -ForegroundColor Green
Write-Host "Errors: $($errors.Count)" -ForegroundColor $(if($errors.Count -gt 0){"Red"}else{"Green"})

if ($errors.Count -gt 0) {
    Write-Host "`nERRORS:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    return 1
} else {
    Write-Host "`nAll tests passed!" -ForegroundColor Green
    return 0
}





