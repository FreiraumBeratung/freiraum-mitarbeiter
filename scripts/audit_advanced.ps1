# Erweiterte Audit-Tests - POST, komplexe Szenarien
$base = "http://localhost:30521/api"
$results = @{passed=0; failed=0; errors=@(); details=@()}

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

Write-Host "=== ERWEITERTE AUDIT-TESTS ===" -ForegroundColor Magenta

# Offers
$offerBody = @{customer="Test Kunde"; items=@(@{name="Service"; qty=1; unit_price=100.0})}
$offer = Test-Endpoint "Offer Draft" POST "$base/offers/draft" -body $offerBody
if ($offer -and $offer.id) {
    Test-Endpoint "Offer PDF" GET "$base/offers/$($offer.id)/pdf" | Out-Null
}

# Followups
$fuBody = @{entity_type="lead"; entity_id=1; due_at=(Get-Date).AddDays(7).ToString("yyyy-MM-ddTHH:mm:ss"); note="Test Follow-up"}
$fu = Test-Endpoint "Followup Create" POST "$base/followups" -body $fuBody
if ($fu -and $fu.id) {
    Test-Endpoint "Followup Toggle" POST "$base/followups/$($fu.id)/toggle" | Out-Null
}

# Mail
Test-Endpoint "Mail Send Test" POST "$base/mail/send_test" -body @{to="test@example.com"} | Out-Null

# KB 2.0
$kbBody = @{topic="Audit Test"; tags=@("audit","test"); content="Test Inhalt für Audit"}
$kb = Test-Endpoint "KB Create" POST "$base/kb/items" -body $kbBody
Test-Endpoint "KB Search" GET "$base/kb/search?q=audit" | Out-Null

# License
Test-Endpoint "License Set" POST "$base/license/set?tier=pro" | Out-Null

# Profile
Test-Endpoint "Profile Set" POST "$base/profile/set" -body @{key="audit_test"; value="test_value"} | Out-Null

# Character
$charBody = @{user_id="denis"; role="user"; text="Audit Test Event"}
Test-Endpoint "Character Event" POST "$base/character/event" -body $charBody | Out-Null

# Decision
$thinkBody = @{user_id="denis"; max_actions=5}
$think = Test-Endpoint "Decision Think" POST "$base/decision/think" -body $thinkBody
if ($think -and $think.actions) {
    Write-Host "  Actions gefunden: $($think.actions.Count)" -ForegroundColor Gray
}

# Automation
Test-Endpoint "Automation Auto" POST "$base/automation/auto?user_id=denis" | Out-Null
$queue = Test-Endpoint "Automation Queue" GET "$base/automation/queue?user_id=denis"
if ($queue -and $queue.items -and $queue.items.Count -gt 0) {
    $queued = $queue.items | Where-Object {$_.status -eq "queued"}
    if ($queued) {
        $ids = $queued | ForEach-Object {$_.id} | Select-Object -First 3
        if ($ids) {
            Test-Endpoint "Automation Approve" POST "$base/automation/approve" -body @{ids=$ids; approve=$true} | Out-Null
        }
    }
}

# Intent
$intentBody = @{user_id="denis"; text="Such mir 20 SHK Betriebe in Arnsberg und direkt anschreiben"}
$intent = Test-Endpoint "Intent Parse" POST "$base/intent/parse" -body $intentBody
if ($intent) {
    Write-Host "  Intent: $($intent.intent), Confidence: $($intent.confidence)" -ForegroundColor Gray
}
Test-Endpoint "Intent Act" POST "$base/intent/act" -body $intentBody | Out-Null

# Reports Export
Test-Endpoint "Export CSV" GET "$base/reports/export.csv" | Out-Null
Test-Endpoint "Export PDF" GET "$base/reports/export.pdf" | Out-Null

# Insights
Test-Endpoint "Insights Seed" POST "$base/insights/seed" -body @{} | Out-Null

Write-Host "`n=== RESULTS ===" -ForegroundColor Magenta
Write-Host "Passed: $($results.passed)" -ForegroundColor Green
Write-Host "Failed: $($results.failed)" -ForegroundColor Red
if ($results.errors.Count -gt 0) {
    Write-Host "`nErrors:" -ForegroundColor Red
    $results.errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$resultFile = "exports\audit_advanced_$timestamp.json"
$results | ConvertTo-Json -Depth 5 | Out-File $resultFile
Write-Host "Results saved to: $resultFile" -ForegroundColor Gray

