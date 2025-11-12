# Vollständiges System-Audit - Backend & Frontend
# Testet alle Endpoints und Features von A bis Z

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$base = "http://localhost:30521/api"
$results = @{
    passed = 0
    failed = 0
    warnings = 0
    errors = @()
    details = @()
}

function Test-Endpoint {
    param(
        [string]$name,
        [string]$method,
        [string]$uri,
        [hashtable]$body = $null,
        [string]$contentType = "application/json"
    )
    
    Write-Host "`n[TEST] $name" -ForegroundColor Cyan
    Write-Host "  $method $uri" -ForegroundColor Gray
    
    try {
        $params = @{
            Method = $method
            Uri = $uri
            TimeoutSec = 10
        }
        
        if ($body) {
            $params.ContentType = $contentType
            $params.Body = ($body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        Write-Host "  ✓ ERFOLG" -ForegroundColor Green
        $script:results.passed++
        $script:results.details += @{
            name = $name
            status = "PASS"
            response = $response
        }
        return $response
    } catch {
        Write-Host "  ✗ FEHLER: $($_.Exception.Message)" -ForegroundColor Red
        $script:results.failed++
        $script:results.errors += "$name : $($_.Exception.Message)"
        $script:results.details += @{
            name = $name
            status = "FAIL"
            error = $_.Exception.Message
        }
        return $null
    }
}

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "VOLLSTÄNDIGES SYSTEM-AUDIT" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

# ============================================
# 1. SYSTEM & HEALTH
# ============================================
Write-Host "`n=== 1. SYSTEM & HEALTH ===" -ForegroundColor Yellow

Test-Endpoint "System Status" GET "$base/system/status" | Out-Null
Test-Endpoint "Health Check" GET "$base/health" | Out-Null

# ============================================
# 2. MAIL MODULE
# ============================================
Write-Host "`n=== 2. MAIL MODULE ===" -ForegroundColor Yellow

Test-Endpoint "Mail Check" GET "$base/mail/check" | Out-Null
Test-Endpoint "Mail Send Test" POST "$base/mail/send_test" -body @{to="test@example.com"} | Out-Null

# ============================================
# 3. OFFERS MODULE
# ============================================
Write-Host "`n=== 3. OFFERS MODULE ===" -ForegroundColor Yellow

$offerBody = @{
    customer = "Test Kunde"
    items = @(
        @{name="Test Service"; qty=1; unit_price=100.0}
    )
}
$offerResult = Test-Endpoint "Offer Draft" POST "$base/offers/draft" -body $offerBody
if ($offerResult -and $offerResult.id) {
    Test-Endpoint "Offer PDF" GET "$base/offers/$($offerResult.id)/pdf" | Out-Null
}

# ============================================
# 4. LEADS MODULE
# ============================================
Write-Host "`n=== 4. LEADS MODULE ===" -ForegroundColor Yellow

Test-Endpoint "Leads List" GET "$base/leads" | Out-Null

# ============================================
# 5. FOLLOWUPS MODULE
# ============================================
Write-Host "`n=== 5. FOLLOWUPS MODULE ===" -ForegroundColor Yellow

Test-Endpoint "Followups List" GET "$base/followups" | Out-Null
Test-Endpoint "Followups Due" GET "$base/followups/due" | Out-Null
$fuBody = @{
    customer = "Test Kunde"
    due_date = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
    notes = "Test Follow-up"
}
$fuResult = Test-Endpoint "Followup Create" POST "$base/followups" -body $fuBody
if ($fuResult -and $fuResult.id) {
    Test-Endpoint "Followup Toggle" POST "$base/followups/$($fuResult.id)/toggle" | Out-Null
}

# ============================================
# 6. REPORTS MODULE
# ============================================
Write-Host "`n=== 6. REPORTS MODULE ===" -ForegroundColor Yellow

Test-Endpoint "KPIs" GET "$base/reports/kpis" | Out-Null
Test-Endpoint "Export CSV" GET "$base/reports/export.csv" | Out-Null
Test-Endpoint "Export PDF" GET "$base/reports/export.pdf" | Out-Null

# ============================================
# 7. KB MODULE (Legacy)
# ============================================
Write-Host "`n=== 7. KB MODULE (Legacy) ===" -ForegroundColor Yellow

Test-Endpoint "KB Ping" GET "$base/kb/ping" | Out-Null

# ============================================
# 8. KB MODULE 2.0
# ============================================
Write-Host "`n=== 8. KB MODULE 2.0 ===" -ForegroundColor Yellow

$kbBody = @{
    topic = "Test Thema"
    tags = @("test", "audit")
    content = "Test Inhalt für Audit"
}
$kbResult = Test-Endpoint "KB Create" POST "$base/kb/items" -body $kbBody
Test-Endpoint "KB List" GET "$base/kb/items" | Out-Null
Test-Endpoint "KB Search" GET "$base/kb/search?q=test" | Out-Null

# ============================================
# 9. LICENSE MODULE
# ============================================
Write-Host "`n=== 9. LICENSE MODULE ===" -ForegroundColor Yellow

Test-Endpoint "License Get" GET "$base/license" | Out-Null
Test-Endpoint "License Set" POST "$base/license/set?tier=pro" | Out-Null

# ============================================
# 10. PROFILE MODULE
# ============================================
Write-Host "`n=== 10. PROFILE MODULE ===" -ForegroundColor Yellow

Test-Endpoint "Profile List" GET "$base/profile" | Out-Null
Test-Endpoint "Profile Set" POST "$base/profile/set" -body @{key="test_key"; value="test_value"} | Out-Null

# ============================================
# 11. INSIGHTS MODULE
# ============================================
Write-Host "`n=== 11. INSIGHTS MODULE ===" -ForegroundColor Yellow

Test-Endpoint "Insights Suggestions" GET "$base/insights/suggestions" | Out-Null
Test-Endpoint "Insights Seed" POST "$base/insights/seed" -body @{} | Out-Null

# ============================================
# 12. CHARACTER MODULE
# ============================================
Write-Host "`n=== 12. CHARACTER MODULE ===" -ForegroundColor Yellow

Test-Endpoint "Character State" GET "$base/character/state?user_id=denis" | Out-Null
Test-Endpoint "Character Profile" GET "$base/character/profile?user_id=denis" | Out-Null
$charEventBody = @{
    user_id = "denis"
    role = "user"
    text = "Test Event für Audit"
}
Test-Endpoint "Character Event" POST "$base/character/event" -body $charEventBody | Out-Null

# ============================================
# 13. DECISION MODULE
# ============================================
Write-Host "`n=== 13. DECISION MODULE ===" -ForegroundColor Yellow

$thinkBody = @{
    user_id = "denis"
    max_actions = 5
}
Test-Endpoint "Decision Think" POST "$base/decision/think" -body $thinkBody | Out-Null
Test-Endpoint "Decision History" GET "$base/decision/history?user_id=denis&limit=10" | Out-Null

# ============================================
# 14. AUTOMATION MODULE
# ============================================
Write-Host "`n=== 14. AUTOMATION MODULE ===" -ForegroundColor Yellow

Test-Endpoint "Automation Queue" GET "$base/automation/queue?user_id=denis" | Out-Null
Test-Endpoint "Automation Auto" POST "$base/automation/auto?user_id=denis" | Out-Null

# ============================================
# 15. INTENT MODULE
# ============================================
Write-Host "`n=== 15. INTENT MODULE ===" -ForegroundColor Yellow

$intentBody = @{
    user_id = "denis"
    text = "Such mir 20 SHK Betriebe in Arnsberg"
}
Test-Endpoint "Intent Parse" POST "$base/intent/parse" -body $intentBody | Out-Null
Test-Endpoint "Intent Act" POST "$base/intent/act" -body $intentBody | Out-Null

# ============================================
# 16. SEQUENCES MODULE
# ============================================
Write-Host "`n=== 16. SEQUENCES MODULE ===" -ForegroundColor Yellow

Test-Endpoint "Sequences List" GET "$base/sequences" | Out-Null

# ============================================
# SUMMARY
# ============================================
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "AUDIT ZUSAMMENFASSUNG" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

Write-Host "`n✓ Erfolgreich: $($results.passed)" -ForegroundColor Green
Write-Host "✗ Fehlgeschlagen: $($results.failed)" -ForegroundColor Red
Write-Host "⚠ Warnungen: $($results.warnings)" -ForegroundColor Yellow

if ($results.errors.Count -gt 0) {
    Write-Host "`nFEHLER:" -ForegroundColor Red
    $results.errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

# Save results
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$resultFile = "exports\audit_results_$timestamp.json"
$results | ConvertTo-Json -Depth 10 | Out-File $resultFile

Write-Host "`nDetaillierte Ergebnisse gespeichert in: $resultFile" -ForegroundColor Gray
