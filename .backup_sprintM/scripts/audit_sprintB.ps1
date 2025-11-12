# Vollständiges Audit nach Sprint B - Voice AI Router 2.0
# Testet alle Backend- und Frontend-Funktionen von A bis Z

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$base = "http://localhost:30521/api"
$results = @{passed=0; failed=0; warnings=0; errors=@(); details=@()}

function Test-Endpoint {
    param([string]$name, [string]$method, [string]$uri, [hashtable]$body=$null)
    Write-Host "[TEST] $name" -ForegroundColor Cyan
    try {
        $params = @{Method=$method; Uri=$uri; TimeoutSec=10}
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
Write-Host "SPRINT B AUDIT - VOICE AI ROUTER 2.0" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

# ============================================
# 1. SYSTEM & HEALTH
# ============================================
Write-Host "`n=== 1. SYSTEM & HEALTH ===" -ForegroundColor Yellow
Test-Endpoint "System Status" GET "$base/system/status" | Out-Null
Test-Endpoint "Health Check" GET "$base/health" | Out-Null

# ============================================
# 2. VOICE ROUTER (NEU)
# ============================================
Write-Host "`n=== 2. VOICE ROUTER (SPRINT B) ===" -ForegroundColor Yellow

# Set pref to "ask"
Test-Endpoint "Set Voice Pref (ask)" POST "$base/profile/set" -body @{key="voice.leads.default_mode"; value="ask"} | Out-Null

# Voice command with ask mode
$voiceCmd1 = @{user_id="denis"; text="Such 20 SHK Betriebe in Arnsberg"}
$voice1 = Test-Endpoint "Voice Command (ask mode)" POST "$base/voice/command" -body $voiceCmd1
if ($voice1) {
    Write-Host "    Decision: $($voice1.decision)" -ForegroundColor Gray
    Write-Host "    Reason: $($voice1.reason)" -ForegroundColor Gray
    Write-Host "    Eligible: $($voice1.eligible.Count)" -ForegroundColor Gray
    Write-Host "    Enqueued: $($voice1.enqueued)" -ForegroundColor Gray
}

# Set pref to "outreach"
Test-Endpoint "Set Voice Pref (outreach)" POST "$base/profile/set" -body @{key="voice.leads.default_mode"; value="outreach"} | Out-Null

# Voice command with outreach mode
$voiceCmd2 = @{user_id="denis"; text="Such 10 Elektro Firmen in Neheim und direkt anschreiben"}
$voice2 = Test-Endpoint "Voice Command (outreach mode)" POST "$base/voice/command" -body $voiceCmd2
if ($voice2) {
    Write-Host "    Decision: $($voice2.decision)" -ForegroundColor Gray
    Write-Host "    Reason: $($voice2.reason)" -ForegroundColor Gray
    Write-Host "    Enqueued: $($voice2.enqueued)" -ForegroundColor Gray
}

# Test policy guard (time check)
$currentHour = (Get-Date).Hour
if ($currentHour -ge 18) {
    Write-Host "  ⚠ Abendzeit erkannt (nach 18:00) - Mail-Policy sollte greifen" -ForegroundColor Yellow
    $voice3 = Test-Endpoint "Voice Command (outreach nach 18:00)" POST "$base/voice/command" -body $voiceCmd2
    if ($voice3 -and $voice3.decision -eq "ask") {
        Write-Host "    Policy Guard funktioniert (outreach zu ask)" -ForegroundColor Green
    }
}

# ============================================
# 3. INTENT MODULE
# ============================================
Write-Host "`n=== 3. INTENT MODULE ===" -ForegroundColor Yellow
$intentBody = @{user_id="denis"; text="Such mir 20 SHK Betriebe in Arnsberg"}
Test-Endpoint "Intent Parse" POST "$base/intent/parse" -body $intentBody | Out-Null
Test-Endpoint "Intent Act" POST "$base/intent/act" -body $intentBody | Out-Null

# ============================================
# 4. AUTOMATION MODULE
# ============================================
Write-Host "`n=== 4. AUTOMATION MODULE ===" -ForegroundColor Yellow
$queue = Test-Endpoint "Automation Queue" GET "$base/automation/queue?user_id=denis"
if ($queue -and $queue.items) {
    Write-Host "    Queue Items: $($queue.items.Count)" -ForegroundColor Gray
    $queued = $queue.items | Where-Object {$_.status -eq "queued"}
    if ($queued) {
        $ids = $queued | ForEach-Object {$_.id} | Select-Object -First 3
        if ($ids) {
            Test-Endpoint "Automation Approve" POST "$base/automation/approve" -body @{ids=$ids; approve=$true} | Out-Null
        }
    }
}
Test-Endpoint "Automation Auto" POST "$base/automation/auto?user_id=denis" | Out-Null

# ============================================
# 5. PROFILE MODULE (Voice Prefs)
# ============================================
Write-Host "`n=== 5. PROFILE MODULE (Voice Prefs) ===" -ForegroundColor Yellow
$profile = Test-Endpoint "Profile List" GET "$base/profile"
if ($profile) {
    $voicePref = ($profile | Where-Object {$_.key -eq "voice.leads.default_mode"})
    if ($voicePref) {
        Write-Host "    Voice Pref gefunden: $($voicePref.value)" -ForegroundColor Green
    }
}
Test-Endpoint "Profile Set Voice Pref" POST "$base/profile/set" -body @{key="voice.leads.default_mode"; value="ask"} | Out-Null

# ============================================
# 6. KB MODULE 2.0
# ============================================
Write-Host "`n=== 6. KB MODULE 2.0 ===" -ForegroundColor Yellow
$kbBody = @{topic="Sprint B Test"; tags=@("test","sprintb"); content="Test für Sprint B Audit"}
Test-Endpoint "KB Create" POST "$base/kb/items" -body $kbBody | Out-Null
Test-Endpoint "KB List" GET "$base/kb/items" | Out-Null
Test-Endpoint "KB Search" GET "$base/kb/search?q=sprintb" | Out-Null

# ============================================
# 7. MAIL MODULE
# ============================================
Write-Host "`n=== 7. MAIL MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Mail Check" GET "$base/mail/check" | Out-Null
Test-Endpoint "Mail Send Test" POST "$base/mail/send_test" -body @{to="test@example.com"} | Out-Null

# ============================================
# 8. OFFERS MODULE
# ============================================
Write-Host "`n=== 8. OFFERS MODULE ===" -ForegroundColor Yellow
$offerBody = @{customer="Test Kunde"; items=@(@{name="Service"; qty=1; unit_price=100.0})}
$offer = Test-Endpoint "Offer Draft" POST "$base/offers/draft" -body $offerBody
if ($offer -and $offer.id) {
    Test-Endpoint "Offer PDF" GET "$base/offers/$($offer.id)/pdf" | Out-Null
}

# ============================================
# 9. DECISION MODULE
# ============================================
Write-Host "`n=== 9. DECISION MODULE ===" -ForegroundColor Yellow
$thinkBody = @{user_id="denis"; max_actions=5}
$think = Test-Endpoint "Decision Think" POST "$base/decision/think" -body $thinkBody
if ($think) {
    Write-Host "    Actions: $($think.actions.Count)" -ForegroundColor Gray
}
$historyUrl = "$base/decision/history?user_id=denis" + '%26limit=5'
Test-Endpoint "Decision History" GET $historyUrl | Out-Null

# ============================================
# 10. CHARACTER MODULE
# ============================================
Write-Host "`n=== 10. CHARACTER MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Character State" GET "$base/character/state?user_id=denis" | Out-Null
Test-Endpoint "Character Profile" GET "$base/character/profile?user_id=denis" | Out-Null
$charBody = @{user_id="denis"; role="user"; text="Sprint B Audit Test"}
Test-Endpoint "Character Event" POST "$base/character/event" -body $charBody | Out-Null

# ============================================
# 11. REPORTS MODULE
# ============================================
Write-Host "`n=== 11. REPORTS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "KPIs" GET "$base/reports/kpis" | Out-Null
Test-Endpoint "Export CSV" GET "$base/reports/export.csv" | Out-Null
Test-Endpoint "Export PDF" GET "$base/reports/export.pdf" | Out-Null

# ============================================
# 12. INSIGHTS MODULE
# ============================================
Write-Host "`n=== 12. INSIGHTS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Insights Suggestions" GET "$base/insights/suggestions" | Out-Null
Test-Endpoint "Insights Seed" POST "$base/insights/seed" -body @{} | Out-Null

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

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$resultFile = "exports\audit_sprintB_$timestamp.json"
$results | ConvertTo-Json -Depth 5 | Out-File $resultFile
$msg = "Ergebnisse gespeichert in: $resultFile"
Write-Host "`n$msg" -ForegroundColor Gray

