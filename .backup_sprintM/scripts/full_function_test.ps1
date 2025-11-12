# Vollständiger Funktionstest - Alle Backend & Frontend APIs
$base = "http://localhost:30521/api"
$errors = @()
$success = @()
$warnings = @()
$testResults = @{}

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "VOLLSTÄNDIGER FUNKTIONSTEST" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Datum: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

function Test-API {
    param($name, $method, $uri, $body = $null, $expectedFields = @())
    try {
        $params = @{
            Method = $method
            Uri = $uri
            TimeoutSec = 20
            ErrorAction = "Stop"
        }
        if ($body) {
            $params.ContentType = "application/json"
            $params.Body = $body | ConvertTo-Json -Depth 10
        }
        $startTime = Get-Date
        $response = Invoke-RestMethod @params
        $duration = ((Get-Date) - $startTime).TotalMilliseconds
        
        # Validate response structure if expectedFields provided
        $valid = $true
        if ($expectedFields.Count -gt 0) {
            foreach ($field in $expectedFields) {
                if ($response.PSObject.Properties.Name -notcontains $field) {
                    $valid = $false
                    $script:warnings += "$name`: Field '$field' missing in response"
                }
            }
        }
        
        $script:success += "$name"
        $script:testResults[$name] = @{
            Status = "OK"
            Duration = [math]::Round($duration, 2)
            Response = $response
        }
        $ms = [math]::Round($duration, 2)
        Write-Host "  [OK] $name ($ms ms)" -ForegroundColor Green
        return $response
    } catch {
        $errMsg = "${name} : $($_.Exception.Message)"
        $script:errors += $errMsg
        $script:testResults[$name] = @{
            Status = "FAIL"
            Error = $_.Exception.Message
        }
        Write-Host "  [FAIL] $name : $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# 1. Health & System
Write-Host "1. Health and System..." -ForegroundColor Cyan
$health = Test-API "Health Check" "GET" "$base/health" $null @("ok", "checks")
if ($health -and $health.checks) {
    $checks = $health.checks
    Write-Host "    DB: $($checks.db), IMAP: $($checks.imap), SMTP: $($checks.smtp), PDF: $($checks.pdf), License: $($checks.license)" -ForegroundColor Gray
}

# 2. Audit Functions
Write-Host "`n2. Audit Functions..." -ForegroundColor Cyan
$auditList = Test-API "Audit List" "GET" "$base/audit/list?limit=10" $null @()
Test-API "Audit Export CSV" "GET" "$base/audit/export.csv?limit=5" $null
Test-API "Audit Export PDF" "GET" "$base/audit/export.pdf?limit=5" $null
Test-API "Audit Purge" "POST" "$base/audit/purge" @{days=365} @("ok", "deleted")

# 3. Leads
Write-Host "`n3. Leads..." -ForegroundColor Cyan
$leads = Test-API "Leads List" "GET" "$base/leads" $null @()
if ($leads -and $leads.Count -gt 0) {
    Write-Host "    Gefunden: $($leads.Count) Leads" -ForegroundColor Gray
}

# 4. Followups
Write-Host "`n4. Followups..." -ForegroundColor Cyan
$followups = Test-API "Followups List" "GET" "$base/followups" $null @()
$followupsDue = Test-API "Followups Due" "GET" "$base/followups/due" $null @()
if ($followupsDue -and $followupsDue.Count -gt 0) {
    Write-Host "    Fällige Follow-ups: $($followupsDue.Count)" -ForegroundColor Gray
}

# 5. Offers
Write-Host "`n5. Offers..." -ForegroundColor Cyan
$offerDraft = Test-API "Offer Draft" "POST" "$base/offers/draft" @{
    customer = "Test Kunde GmbH"
    items = @(
        @{ name = "Service A"; qty = 2; unit_price = 100 }
        @{ name = "Service B"; qty = 1; unit_price = 250 }
    )
} @("id", "customer", "total_gross")

# 6. Insights
Write-Host "`n6. Insights..." -ForegroundColor Cyan
$insights = Test-API "Insights Suggestions" "GET" "$base/insights/suggestions" $null @()
if ($insights -and $insights.Count -gt 0) {
    Write-Host "    Vorschläge: $($insights.Count)" -ForegroundColor Gray
}

# 7. Profile
Write-Host "`n7. Profile..." -ForegroundColor Cyan
$profile = Test-API "Profile List" "GET" "$base/profile/" $null @()
Test-API "Profile Set" "POST" "$base/profile/set" @{key="test_key"; value="test_value"} @("ok")

# 8. Reports
Write-Host "`n8. Reports..." -ForegroundColor Cyan
$kpis = Test-API "Reports KPIs" "GET" "$base/reports/kpis" $null @()
if ($kpis) {
    Write-Host "    KPIs: $($kpis.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
}

# 9. License
Write-Host "`n9. License..." -ForegroundColor Cyan
$license = Test-API "License Get" "GET" "$base/license" $null @()

# 10. Sequences
Write-Host "`n10. Sequences..." -ForegroundColor Cyan
$sequences = Test-API "Sequences List" "GET" "$base/sequences" $null @()
$seqCreate = Test-API "Sequence Create" "POST" "$base/sequences" @{
    name = "Test Sequence"
    description = "Test"
    steps = @(
        @{ day_offset = 0; subject = "Test"; body = "Test Body"; attach_flyer = $false }
    )
} @("id")

# 11. Calendar
Write-Host "`n11. Calendar..." -ForegroundColor Cyan
$calendar = Test-API "Calendar List" "GET" "$base/calendar/list" $null @()
$calCreate = Test-API "Calendar Create" "POST" "$base/calendar/create" @{
    title = "Test Event"
    start = (Get-Date).AddHours(1).ToUniversalTime().ToString("o")
    end = (Get-Date).AddHours(2).ToUniversalTime().ToString("o")
    location = "Test Location"
    attendees = @()
} @("id")

# 12. Knowledge Base
Write-Host "`n12. Knowledge Base..." -ForegroundColor Cyan
$kbList = Test-API "KB List" "GET" "$base/kb/items" $null @()
$kbSearch = Test-API "KB Search" "GET" "$base/kb/search?q=test" $null @()

# 13. Automation
Write-Host "`n13. Automation..." -ForegroundColor Cyan
$automation = Test-API "Automation Queue" "GET" "$base/automation/queue?user_id=denis" $null @("items")

# 14. Decision
Write-Host "`n14. Decision..." -ForegroundColor Cyan
$decisionThink = Test-API "Decision Think" "POST" "$base/decision/think" @{user_id="denis"; max_actions=3} @("actions", "mood")
$decisionHistory = Test-API "Decision History" "GET" "$base/decision/history?user_id=denis`&limit=5" $null @()

# 15. Character
Write-Host "`n15. Character..." -ForegroundColor Cyan
$charState = Test-API "Character State" "GET" "$base/character/state?user_id=denis" $null @()
$charProfile = Test-API "Character Profile" "GET" "$base/character/profile?user_id=denis" $null @()

# 16. Lead Hunter
Write-Host "`n16. Lead Hunter..." -ForegroundColor Cyan
$leadHunt = Test-API "Lead Hunt" "POST" "$base/lead_hunter/hunt" @{
    category = "shk"
    location = "arnsberg"
    count = 2
    save_to_db = $false
    export_excel = $false
} @("found", "leads")

# 17. Mail
Write-Host "`n17. Mail..." -ForegroundColor Cyan
$mailCheck = Test-API "Mail Check" "GET" "$base/mail/check" $null @("imap", "smtp")

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

# Performance Stats
$avgDuration = ($testResults.Values | Where-Object {$_.Duration} | Measure-Object -Property Duration -Average).Average
Write-Host "`nPerformance: Durchschnittliche Response-Zeit: $([math]::Round($avgDuration, 2))ms" -ForegroundColor Cyan

if ($errors.Count -eq 0) {
    Write-Host "`n[OK] Alle Tests erfolgreich!" -ForegroundColor Green
    return 0
} else {
    return 1
}

