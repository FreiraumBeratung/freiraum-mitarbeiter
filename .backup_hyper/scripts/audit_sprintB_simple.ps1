# Sprint B Audit - Vereinfachte Version
$base = "http://localhost:30521/api"
$results = @{passed=0; failed=0; errors=@()}

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

Write-Host "=== SPRINT B AUDIT ===" -ForegroundColor Magenta

# System
Test-Endpoint "System Status" GET "$base/system/status" | Out-Null
Test-Endpoint "Health" GET "$base/health" | Out-Null

# Voice Router (NEU)
Write-Host "`n=== VOICE ROUTER (SPRINT B) ===" -ForegroundColor Yellow
Test-Endpoint "Set Voice Pref (ask)" POST "$base/profile/set" -body @{key="voice.leads.default_mode"; value="ask"} | Out-Null
$voice1 = Test-Endpoint "Voice Command (ask)" POST "$base/voice/command" -body @{user_id="denis"; text="Such 20 SHK Betriebe"}
if ($voice1) { Write-Host "    Decision: $($voice1.decision), Enqueued: $($voice1.enqueued)" -ForegroundColor Gray }

Test-Endpoint "Set Voice Pref (outreach)" POST "$base/profile/set" -body @{key="voice.leads.default_mode"; value="outreach"} | Out-Null
$voice2 = Test-Endpoint "Voice Command (outreach)" POST "$base/voice/command" -body @{user_id="denis"; text="Such 10 Elektro Firmen und anschreiben"}
if ($voice2) { Write-Host "    Decision: $($voice2.decision), Enqueued: $($voice2.enqueued)" -ForegroundColor Gray }

# Intent
Test-Endpoint "Intent Parse" POST "$base/intent/parse" -body @{user_id="denis"; text="Test"} | Out-Null

# Automation
Test-Endpoint "Automation Queue" GET "$base/automation/queue?user_id=denis" | Out-Null
Test-Endpoint "Automation Auto" POST "$base/automation/auto?user_id=denis" | Out-Null

# Profile
$profile = Test-Endpoint "Profile List" GET "$base/profile"
if ($profile) {
    $vp = ($profile | Where-Object {$_.key -eq "voice.leads.default_mode"})
    if ($vp) { Write-Host "    Voice Pref: $($vp.value)" -ForegroundColor Gray }
}

# KB
Test-Endpoint "KB Create" POST "$base/kb/items" -body @{topic="Test"; tags=@("test"); content="Test"} | Out-Null
Test-Endpoint "KB List" GET "$base/kb/items" | Out-Null
Test-Endpoint "KB Search" GET "$base/kb/search?q=test" | Out-Null

# Mail
Test-Endpoint "Mail Check" GET "$base/mail/check" | Out-Null

# Offers
$offer = Test-Endpoint "Offer Draft" POST "$base/offers/draft" -body @{customer="Test"; items=@(@{name="S"; qty=1; unit_price=100})}
if ($offer -and $offer.id) { Test-Endpoint "Offer PDF" GET "$base/offers/$($offer.id)/pdf" | Out-Null }

# Decision
$think = Test-Endpoint "Decision Think" POST "$base/decision/think" -body @{user_id="denis"; max_actions=3}
if ($think) { Write-Host "    Actions: $($think.actions.Count)" -ForegroundColor Gray }

# Character
Test-Endpoint "Character State" GET "$base/character/state?user_id=denis" | Out-Null
Test-Endpoint "Character Event" POST "$base/character/event" -body @{user_id="denis"; role="user"; text="Test"} | Out-Null

# Reports
Test-Endpoint "KPIs" GET "$base/reports/kpis" | Out-Null

Write-Host "`n=== RESULTS ===" -ForegroundColor Magenta
Write-Host "Passed: $($results.passed)" -ForegroundColor Green
Write-Host "Failed: $($results.failed)" -ForegroundColor Red
if ($results.errors.Count -gt 0) {
    Write-Host "Errors:" -ForegroundColor Red
    $results.errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
}

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$file = "exports\audit_sprintB_$ts.json"
$results | ConvertTo-Json -Depth 5 | Out-File $file
Write-Host "Results saved to: $file" -ForegroundColor Gray






