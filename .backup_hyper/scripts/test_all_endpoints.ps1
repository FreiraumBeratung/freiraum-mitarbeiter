# Systematischer Test aller Backend-Endpoints

$ErrorActionPreference = "Continue"
$baseUrl = "http://127.0.0.1:30521/api"
$results = @{
    passed = @()
    failed = @()
    warnings = @()
}

function Test-API {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Path,
        [object]$Body = $null,
        [bool]$Required = $true
    )
    
    $url = "$baseUrl$Path"
    Write-Host "Testing: $Name ($Method $Path)" -ForegroundColor Cyan
    
    try {
        $headers = @{ "Content-Type" = "application/json" }
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $headers
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        Write-Host "  ✅ PASSED" -ForegroundColor Green
        $results.passed += "$Name"
        return $true
    } catch {
        $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "N/A" }
        $errorMsg = $_.Exception.Message
        
        if ($Required) {
            Write-Host "  ❌ FAILED: $errorMsg (Status: $statusCode)" -ForegroundColor Red
            $results.failed += "$Name`: $errorMsg"
        } else {
            Write-Host "  ⚠️ WARNING: $errorMsg (Status: $statusCode)" -ForegroundColor Yellow
            $results.warnings += "$Name`: $errorMsg"
        }
        return $false
    }
}

Write-Host "`n🔍 SYSTEMATISCHER ENDPOINT-TEST" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan

# SYSTEM
Test-API -Name "System Status" -Path "/system/status"
Test-API -Name "Health Check" -Path "/health"

# LICENSE
Test-API -Name "License Get" -Path "/license"
Test-API -Name "License Set" -Method "POST" -Path "/license/set?tier=PRO" -Required $false

# PROFILE
Test-API -Name "Profile List" -Path "/profile"
Test-API -Name "Profile Set" -Method "POST" -Path "/profile/set" -Body @{key="test"; value="test"} -Required $false

# LEADS
Test-API -Name "Leads List" -Path "/leads"
Test-API -Name "Leads Create" -Method "POST" -Path "/leads" -Body @{company="Test Firma"; contact_name="Test Name"; contact_email="test@test.de"} -Required $false

# FOLLOWUPS
Test-API -Name "Followups List" -Path "/followups"
Test-API -Name "Followups Due" -Path "/followups/due"
Test-API -Name "Followups Create" -Method "POST" -Path "/followups" -Body @{entity_type="lead"; entity_id=1; due_at="2025-12-31T12:00:00"; note="Test"} -Required $false

# REPORTS
Test-API -Name "Reports KPIs" -Path "/reports/kpis"

# INSIGHTS
Test-API -Name "Insights Suggestions" -Path "/insights/suggestions"

# CHARACTER
Test-API -Name "Character State" -Path "/character/state?user_id=denis"
Test-API -Name "Character Profile" -Path "/character/profile?user_id=denis"

# DECISION
Test-API -Name "Decision History" -Path "/decision/history?user_id=denis&limit=10"
Test-API -Name "Decision Think" -Method "POST" -Path "/decision/think" -Body @{user_id="denis"; max_actions=3} -Required $false

# AUTOMATION
Test-API -Name "Automation Queue" -Path "/automation/queue?user_id=denis"

# KB MODULE
Test-API -Name "KB Items List" -Path "/kb/items" -Required $false
Test-API -Name "KB Search" -Path "/kb/search?q=test" -Required $false

# INTENT
Test-API -Name "Intent Parse" -Method "POST" -Path "/intent/parse" -Body @{user_id="denis"; text="Zeige mir die Leads"} -Required $false

# VOICE
Test-API -Name "Voice Command" -Method "POST" -Path "/voice/command" -Body @{user_id="denis"; text="Test"} -Required $false

# AUDIT
Test-API -Name "Audit List" -Path "/audit/list"
Test-API -Name "Audit List Filtered" -Path "/audit/list?user_id=denis&limit=10" -Required $false

# CALENDAR
Test-API -Name "Calendar List" -Path "/calendar/list" -Required $false

# SEQUENCES
Test-API -Name "Sequences List" -Path "/sequences" -Required $false

# LEAD HUNTER
Test-API -Name "Lead Hunter" -Method "POST" -Path "/lead_hunter/hunt" -Body @{category="elektro"; location="arnsberg"; count=5} -Required $false

# KB PING
Test-API -Name "KB Ping" -Path "/kb/ping"

Write-Host "`n" + ("=" * 70) -ForegroundColor Cyan
Write-Host "ZUSAMMENFASSUNG" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "✅ Passed: $($results.passed.Count)" -ForegroundColor Green
Write-Host "❌ Failed: $($results.failed.Count)" -ForegroundColor Red
Write-Host "⚠️ Warnings: $($results.warnings.Count)" -ForegroundColor Yellow

if ($results.failed.Count -gt 0) {
    Write-Host "`nFehler:" -ForegroundColor Red
    $results.failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

if ($results.warnings.Count -gt 0) {
    Write-Host "`nWarnungen:" -ForegroundColor Yellow
    $results.warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

# Save results
$results | ConvertTo-Json -Depth 10 | Out-File "endpoint_test_results.json"
Write-Host "`n✅ Ergebnisse gespeichert in endpoint_test_results.json" -ForegroundColor Green

