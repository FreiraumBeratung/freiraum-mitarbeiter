# Vollständiges System-Audit
$base = "http://localhost:30521/api"
$results = @{passed=0; failed=0; errors=@(); details=@()}

function Test-Endpoint {
    param([string]$name, [string]$method, [string]$uri, [hashtable]$body=$null)
    Write-Host "[TEST] $name" -ForegroundColor Cyan
    try {
        $params = @{Method=$method; Uri=$uri; TimeoutSec=10}
        if ($body) { $params.ContentType="application/json"; $params.Body=($body|ConvertTo-Json) }
        $response = Invoke-RestMethod @params
        Write-Host "  SUCCESS" -ForegroundColor Green
        $script:results.passed++
        $script:results.details += @{name=$name; status="PASS"}
        return $response
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $script:results.failed++
        $script:results.errors += "$name : $($_.Exception.Message)"
        return $null
    }
}

Write-Host "=== SYSTEM AUDIT ===" -ForegroundColor Magenta

Test-Endpoint "System Status" GET "$base/system/status" | Out-Null
Test-Endpoint "Health" GET "$base/health" | Out-Null
Test-Endpoint "Mail Check" GET "$base/mail/check" | Out-Null
Test-Endpoint "Leads List" GET "$base/leads" | Out-Null
Test-Endpoint "Followups" GET "$base/followups" | Out-Null
Test-Endpoint "KPIs" GET "$base/reports/kpis" | Out-Null
Test-Endpoint "KB Ping" GET "$base/kb/ping" | Out-Null
Test-Endpoint "KB List" GET "$base/kb/items" | Out-Null
Test-Endpoint "License" GET "$base/license" | Out-Null
Test-Endpoint "Profile" GET "$base/profile" | Out-Null
Test-Endpoint "Insights" GET "$base/insights/suggestions" | Out-Null
Test-Endpoint "Character State" GET "$base/character/state?user_id=denis" | Out-Null
Test-Endpoint "Decision History" GET "$base/decision/history?user_id=denis&limit=5" | Out-Null
Test-Endpoint "Automation Queue" GET "$base/automation/queue?user_id=denis" | Out-Null

$kbBody = @{topic="Test"; tags=@("test"); content="Test"}
$kbResult = Test-Endpoint "KB Create" POST "$base/kb/items" -body $kbBody

$thinkBody = @{user_id="denis"; max_actions=3}
Test-Endpoint "Decision Think" POST "$base/decision/think" -body $thinkBody | Out-Null

$intentBody = @{user_id="denis"; text="Test"}
Test-Endpoint "Intent Parse" POST "$base/intent/parse" -body $intentBody | Out-Null

Write-Host "`n=== RESULTS ===" -ForegroundColor Magenta
Write-Host "Passed: $($results.passed)" -ForegroundColor Green
Write-Host "Failed: $($results.failed)" -ForegroundColor Red
if ($results.errors.Count -gt 0) {
    Write-Host "Errors:" -ForegroundColor Red
    $results.errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$resultFile = "exports\audit_results_$timestamp.json"
$results | ConvertTo-Json -Depth 5 | Out-File $resultFile
Write-Host "Results saved to: $resultFile" -ForegroundColor Gray

















