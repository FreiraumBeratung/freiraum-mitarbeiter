# Vollständiges Audit nach Sprint C - Lead-Hunter 1.0
# Testet alle Backend- und Frontend-Funktionen von A bis Z

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$base = "http://localhost:30521/api"
$results = @{passed=0; failed=0; warnings=0; errors=@(); details=@()}

function Test-Endpoint {
    param([string]$name, [string]$method, [string]$uri, [hashtable]$body=$null)
    Write-Host "[TEST] $name" -ForegroundColor Cyan
    try {
        $params = @{Method=$method; Uri=$uri; TimeoutSec=15}
        if ($body) { $params.ContentType="application/json"; $params.Body=($body|ConvertTo-Json -Depth 10) }
        $response = Invoke-RestMethod @params
        Write-Host "  SUCCESS" -ForegroundColor Green
        $script:results.passed++
        return $response
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $script:results.failed++
        $script:results.errors += "$name : $($_.Exception.Message)"
        return $null
    }
}

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "SPRINT C COMPLETE AUDIT" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

# ============================================
# 1. SYSTEM & HEALTH
# ============================================
Write-Host "`n=== 1. SYSTEM & HEALTH ===" -ForegroundColor Yellow
Test-Endpoint "System Status" GET "$base/system/status" | Out-Null
Test-Endpoint "Health Check" GET "$base/health" | Out-Null

# ============================================
# 2. LEAD-HUNTER (NEU - SPRINT C)
# ============================================
Write-Host "`n=== 2. LEAD-HUNTER (SPRINT C) ===" -ForegroundColor Yellow

$huntBody = @{category="shk"; location="arnsberg"; count=5; save_to_db=$true; export_excel=$true}
$huntResult = Test-Endpoint "Lead Hunt" POST "$base/lead_hunter/hunt" -body $huntBody
if ($huntResult) {
    Write-Host "    Gefunden: $($huntResult.found)" -ForegroundColor Gray
    Write-Host "    Gespeichert: $($huntResult.saved)" -ForegroundColor Gray
    if ($huntResult.excel_path) {
        Write-Host "    Excel: $($huntResult.excel_path.Split('/')[-1])" -ForegroundColor Gray
    }
}

$exportLeads = @{
    leads = @(
        @{company="Test Firma 1"; category="test"; location="test"; emails=@("test1@example.com"); phones=@("0123456789")},
        @{company="Test Firma 2"; category="test"; location="test"; emails=@("test2@example.com"); phones=@()}
    )
}
$exportResult = Test-Endpoint "Export Excel" POST "$base/lead_hunter/export_excel" -body $exportLeads
if ($exportResult) {
    Write-Host "    Excel-Pfad: $($exportResult.excel_path)" -ForegroundColor Gray
}

$outreachBody = @{
    leads = @(
        @{company="Test Firma"; emails=@("test@example.com"); city="Teststadt"; category="test"}
    )
}
Test-Endpoint "Outreach" POST "$base/lead_hunter/outreach" -body $outreachBody | Out-Null

# ============================================
# 3. DECISION MODULE (mit lead.hunt/outreach)
# ============================================
Write-Host "`n=== 3. DECISION MODULE (Lead Actions) ===" -ForegroundColor Yellow

$leadHuntAction = @{
    user_id = "denis"
    actions = @(@{
        key = "lead.hunt"
        title = "Hunt Test"
        reason = "Audit Test"
        score = 0.9
        payload = @{category="elektro"; location="neheim"; count=3}
    })
    dry_run = $false
}
$execResult = Test-Endpoint "Decision Execute (lead.hunt)" POST "$base/decision/execute" -body $leadHuntAction
if ($execResult) {
    Write-Host "    Results: $($execResult.results.Count)" -ForegroundColor Gray
    $execResult.results | ForEach-Object {
        if ($_.ok) {
            Write-Host "      OK: $($_.key)" -ForegroundColor Green
        } else {
            Write-Host "      FAIL: $($_.key)" -ForegroundColor Red
        }
    }
}

$thinkBody = @{user_id="denis"; max_actions=5}
$think = Test-Endpoint "Decision Think" POST "$base/decision/think" -body $thinkBody
if ($think) {
    Write-Host "    Actions: $($think.actions.Count)" -ForegroundColor Gray
}

$historyUrl = "$base/decision/history?user_id=denis" + '%26limit=5'
Test-Endpoint "Decision History" GET $historyUrl | Out-Null

# ============================================
# 4. VOICE ROUTER
# ============================================
Write-Host "`n=== 4. VOICE ROUTER ===" -ForegroundColor Yellow
Test-Endpoint "Set Voice Pref" POST "$base/profile/set" -body @{key="voice.leads.default_mode"; value="ask"} | Out-Null
$voiceCmd = @{user_id="denis"; text="Such 20 SHK Betriebe in Arnsberg"}
$voice = Test-Endpoint "Voice Command" POST "$base/voice/command" -body $voiceCmd
if ($voice) {
    Write-Host "    Decision: $($voice.decision)" -ForegroundColor Gray
    Write-Host "    Enqueued: $($voice.enqueued)" -ForegroundColor Gray
}

# ============================================
# 5. INTENT MODULE
# ============================================
Write-Host "`n=== 5. INTENT MODULE ===" -ForegroundColor Yellow
$intentBody = @{user_id="denis"; text="Such mir 20 SHK Betriebe in Arnsberg"}
Test-Endpoint "Intent Parse" POST "$base/intent/parse" -body $intentBody | Out-Null
Test-Endpoint "Intent Act" POST "$base/intent/act" -body $intentBody | Out-Null

# ============================================
# 6. AUTOMATION MODULE
# ============================================
Write-Host "`n=== 6. AUTOMATION MODULE ===" -ForegroundColor Yellow
$queue = Test-Endpoint "Automation Queue" GET "$base/automation/queue?user_id=denis"
if ($queue -and $queue.items) {
    Write-Host "    Queue Items: $($queue.items.Count)" -ForegroundColor Gray
}
Test-Endpoint "Automation Auto" POST "$base/automation/auto?user_id=denis" | Out-Null

# ============================================
# 7. KB MODULE 2.0
# ============================================
Write-Host "`n=== 7. KB MODULE 2.0 ===" -ForegroundColor Yellow
$kbBody = @{topic="Sprint C Test"; tags=@("test","sprintc"); content="Test für Sprint C Audit"}
Test-Endpoint "KB Create" POST "$base/kb/items" -body $kbBody | Out-Null
Test-Endpoint "KB List" GET "$base/kb/items" | Out-Null
Test-Endpoint "KB Search" GET "$base/kb/search?q=sprintc" | Out-Null

# ============================================
# 8. MAIL MODULE
# ============================================
Write-Host "`n=== 8. MAIL MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Mail Check" GET "$base/mail/check" | Out-Null
Test-Endpoint "Mail Send Test" POST "$base/mail/send_test" -body @{to="test@example.com"} | Out-Null

# ============================================
# 9. OFFERS MODULE
# ============================================
Write-Host "`n=== 9. OFFERS MODULE ===" -ForegroundColor Yellow
$offerBody = @{customer="Test Kunde"; items=@(@{name="Service"; qty=1; unit_price=100.0})}
$offer = Test-Endpoint "Offer Draft" POST "$base/offers/draft" -body $offerBody
if ($offer -and $offer.id) {
    Test-Endpoint "Offer PDF" GET "$base/offers/$($offer.id)/pdf" | Out-Null
}

# ============================================
# 10. LEADS MODULE
# ============================================
Write-Host "`n=== 10. LEADS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Leads List" GET "$base/leads" | Out-Null

# ============================================
# 11. FOLLOWUPS MODULE
# ============================================
Write-Host "`n=== 11. FOLLOWUPS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Followups List" GET "$base/followups" | Out-Null
Test-Endpoint "Followups Due" GET "$base/followups/due" | Out-Null

# ============================================
# 12. REPORTS MODULE
# ============================================
Write-Host "`n=== 12. REPORTS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "KPIs" GET "$base/reports/kpis" | Out-Null
Test-Endpoint "Export CSV" GET "$base/reports/export.csv" | Out-Null
Test-Endpoint "Export PDF" GET "$base/reports/export.pdf" | Out-Null

# ============================================
# 13. CHARACTER MODULE
# ============================================
Write-Host "`n=== 13. CHARACTER MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Character State" GET "$base/character/state?user_id=denis" | Out-Null
Test-Endpoint "Character Profile" GET "$base/character/profile?user_id=denis" | Out-Null
$charBody = @{user_id="denis"; role="user"; text="Sprint C Audit Test"}
Test-Endpoint "Character Event" POST "$base/character/event" -body $charBody | Out-Null

# ============================================
# 14. INSIGHTS MODULE
# ============================================
Write-Host "`n=== 14. INSIGHTS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Insights Suggestions" GET "$base/insights/suggestions" | Out-Null
Test-Endpoint "Insights Seed" POST "$base/insights/seed" -body @{} | Out-Null

# ============================================
# 15. PROFILE MODULE
# ============================================
Write-Host "`n=== 15. PROFILE MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Profile List" GET "$base/profile" | Out-Null
Test-Endpoint "Profile Set" POST "$base/profile/set" -body @{key="test_key"; value="test_value"} | Out-Null

# ============================================
# 16. LICENSE MODULE
# ============================================
Write-Host "`n=== 16. LICENSE MODULE ===" -ForegroundColor Yellow
Test-Endpoint "License Get" GET "$base/license" | Out-Null

# ============================================
# SUMMARY
# ============================================
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "AUDIT ZUSAMMENFASSUNG" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

Write-Host "`nErfolgreich: $($results.passed)" -ForegroundColor Green
Write-Host "Fehlgeschlagen: $($results.failed)" -ForegroundColor Red
Write-Host "Warnungen: $($results.warnings)" -ForegroundColor Yellow

if ($results.errors.Count -gt 0) {
    Write-Host "`nFEHLER:" -ForegroundColor Red
    $results.errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$file = "exports\audit_sprintC_$ts.json"
$results | ConvertTo-Json -Depth 5 | Out-File $file
Write-Host "`nErgebnisse gespeichert in: $file" -ForegroundColor Gray

















