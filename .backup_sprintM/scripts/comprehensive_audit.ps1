# Vollständiger Comprehensive Audit - Alle Funktionen
Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$base = "http://localhost:30521/api"
$results = @{
    passed = 0
    failed = 0
    errors = @()
    warnings = @()
    fixes = @()
    modules = @{}
}

function Test-Endpoint {
    param(
        [string]$name,
        [string]$method,
        [string]$uri,
        [hashtable]$body = $null,
        [switch]$skipError = $false,
        [string]$module = "general"
    )
    Write-Host "[TEST] $name" -ForegroundColor Cyan
    try {
        $params = @{ Method = $method; Uri = $uri; TimeoutSec = 15 }
        if ($body) {
            $params.ContentType = "application/json"
            $params.Body = ($body | ConvertTo-Json -Depth 10)
        }
        $response = Invoke-RestMethod @params
        Write-Host "  SUCCESS" -ForegroundColor Green
        $script:results.passed++
        if (-not $script:results.modules[$module]) {
            $script:results.modules[$module] = @{ passed = 0; failed = 0; errors = @() }
        }
        $script:results.modules[$module].passed++
        return @{ ok = $true; data = $response }
    } catch {
        $errorMsg = $_.Exception.Message
        Write-Host "  FAILED: $errorMsg" -ForegroundColor Red
        if (-not $skipError) {
            $script:results.failed++
            $script:results.errors += "$name : $errorMsg"
            if (-not $script:results.modules[$module]) {
                $script:results.modules[$module] = @{ passed = 0; failed = 0; errors = @() }
            }
            $script:results.modules[$module].failed++
            $script:results.modules[$module].errors += "$name : $errorMsg"
        }
        return @{ ok = $false; error = $errorMsg }
    }
}

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "VOLLSTAENDIGER COMPREHENSIVE AUDIT" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

# Wait for backend
Write-Host "`nWarte auf Backend..." -ForegroundColor Yellow
$maxWait = 60
$waited = 0
while ($waited -lt $maxWait) {
    try {
        $test = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "Backend bereit!" -ForegroundColor Green
        break
    } catch {
        Start-Sleep -Seconds 2
        $waited += 2
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
}
if ($waited -ge $maxWait) {
    Write-Host "`nBackend nicht erreichbar - starte trotzdem Tests" -ForegroundColor Yellow
    $script:results.errors += "Backend nicht erreichbar nach $maxWait Sekunden"
}

# ============================================
# 1. SYSTEM & HEALTH
# ============================================
Write-Host "`n=== 1. SYSTEM & HEALTH ===" -ForegroundColor Yellow
Test-Endpoint "System Status" GET "$base/system/status" -module "system"
Test-Endpoint "Health Check" GET "$base/health" -module "system"

# ============================================
# 2. LEAD-HUNTER
# ============================================
Write-Host "`n=== 2. LEAD-HUNTER ===" -ForegroundColor Yellow
$huntBody = @{ category = "shk"; location = "arnsberg"; count = 3; save_to_db = $true; export_excel = $true }
Test-Endpoint "Lead Hunt" POST "$base/lead_hunter/hunt" -body $huntBody -module "lead_hunter"

# ============================================
# 3. SEQUENCES
# ============================================
Write-Host "`n=== 3. SEQUENCES ===" -ForegroundColor Yellow
$seqBody = @{
    name = "Test Sequence"
    description = "Test"
    steps = @(@{ day_offset = 0; subject = "Test"; body = "Test"; attach_flyer = $false })
}
$seqResult = Test-Endpoint "Sequence Create" POST "$base/sequences" -body $seqBody -module "sequences"
$seqList = Test-Endpoint "Sequence List" GET "$base/sequences" -module "sequences"

# ============================================
# 4. CALENDAR
# ============================================
Write-Host "`n=== 4. CALENDAR ===" -ForegroundColor Yellow
$start = (Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ss")
$end = (Get-Date).AddDays(1).AddHours(1).ToString("yyyy-MM-ddTHH:mm:ss")
$calBody = @{ title = "Test Event"; start = $start; end = $end; location = "Test" }
$calResult = Test-Endpoint "Calendar Create" POST "$base/calendar/create" -body $calBody -module "calendar"
$calList = Test-Endpoint "Calendar List" GET "$base/calendar/list" -module "calendar"

# ============================================
# 5. DECISION MODULE
# ============================================
Write-Host "`n=== 5. DECISION MODULE ===" -ForegroundColor Yellow
$thinkBody = @{ user_id = "denis"; max_actions = 5 }
Test-Endpoint "Decision Think" POST "$base/decision/think" -body $thinkBody -module "decision"
Test-Endpoint "Decision History" GET "$base/decision/history?user_id=denis&limit=10" -module "decision"

# ============================================
# 6. VOICE ROUTER
# ============================================
Write-Host "`n=== 6. VOICE ROUTER ===" -ForegroundColor Yellow
$voiceCmd = @{ user_id = "denis"; text = "Such 10 SHK Betriebe" }
Test-Endpoint "Voice Command" POST "$base/voice/command" -body $voiceCmd -module "voice"

# ============================================
# 7. INTENT MODULE
# ============================================
Write-Host "`n=== 7. INTENT MODULE ===" -ForegroundColor Yellow
$intentBody = @{ user_id = "denis"; text = "Such mir 20 SHK Betriebe" }
Test-Endpoint "Intent Parse" POST "$base/intent/parse" -body $intentBody -module "intent"
Test-Endpoint "Intent Act" POST "$base/intent/act" -body $intentBody -module "intent"

# ============================================
# 8. AUTOMATION MODULE
# ============================================
Write-Host "`n=== 8. AUTOMATION MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Automation Queue" GET "$base/automation/queue?user_id=denis" -module "automation"

# ============================================
# 9. KB MODULE
# ============================================
Write-Host "`n=== 9. KB MODULE ===" -ForegroundColor Yellow
$kbBody = @{ topic = "Test"; tags = @("test"); content = "Test" }
Test-Endpoint "KB Create" POST "$base/kb/items" -body $kbBody -module "kb"
Test-Endpoint "KB List" GET "$base/kb/items" -module "kb"
Test-Endpoint "KB Search" GET "$base/kb/search?q=test" -module "kb"

# ============================================
# 10. MAIL MODULE
# ============================================
Write-Host "`n=== 10. MAIL MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Mail Check" GET "$base/mail/check" -module "mail"

# ============================================
# 11. OFFERS MODULE
# ============================================
Write-Host "`n=== 11. OFFERS MODULE ===" -ForegroundColor Yellow
$offerBody = @{ customer = "Test"; items = @(@{ name = "Service"; qty = 1; unit_price = 100.0 }) }
$offer = Test-Endpoint "Offer Draft" POST "$base/offers/draft" -body $offerBody -module "offers"

# ============================================
# 12. LEADS MODULE
# ============================================
Write-Host "`n=== 12. LEADS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Leads List" GET "$base/leads" -module "leads"

# ============================================
# 13. FOLLOWUPS MODULE
# ============================================
Write-Host "`n=== 13. FOLLOWUPS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Followups List" GET "$base/followups" -module "followups"
Test-Endpoint "Followups Due" GET "$base/followups/due" -module "followups"

# ============================================
# 14. REPORTS MODULE
# ============================================
Write-Host "`n=== 14. REPORTS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "KPIs" GET "$base/reports/kpis" -module "reports"

# ============================================
# 15. CHARACTER MODULE
# ============================================
Write-Host "`n=== 15. CHARACTER MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Character State" GET "$base/character/state?user_id=denis" -module "character"
Test-Endpoint "Character Profile" GET "$base/character/profile?user_id=denis" -module "character"

# ============================================
# 16. PROFILE MODULE
# ============================================
Write-Host "`n=== 16. PROFILE MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Profile List" GET "$base/profile" -module "profile"
$profileSet = @{ key = "test.key"; value = "test.value" }
Test-Endpoint "Profile Set" POST "$base/profile/set" -body $profileSet -module "profile"

# ============================================
# 17. INSIGHTS MODULE
# ============================================
Write-Host "`n=== 17. INSIGHTS MODULE ===" -ForegroundColor Yellow
Test-Endpoint "Insights Suggestions" GET "$base/insights/suggestions" -module "insights"

# ============================================
# 18. LICENSE MODULE
# ============================================
Write-Host "`n=== 18. LICENSE MODULE ===" -ForegroundColor Yellow
Test-Endpoint "License Get" GET "$base/license" -module "license"

# ============================================
# SUMMARY
# ============================================
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "AUDIT ZUSAMMENFASSUNG" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

Write-Host "`nErfolgreich: $($results.passed)" -ForegroundColor Green
Write-Host "Fehlgeschlagen: $($results.failed)" -ForegroundColor Red
Write-Host "Warnungen: $($results.warnings.Count)" -ForegroundColor Yellow

Write-Host "`n=== MODUL-STATISTIK ===" -ForegroundColor Cyan
foreach ($mod in $results.modules.Keys) {
    $m = $results.modules[$mod]
    Write-Host "$mod : $($m.passed) OK, $($m.failed) FAIL" -ForegroundColor $(if ($m.failed -eq 0) { "Green" } else { "Yellow" })
}

if ($results.errors.Count -gt 0) {
    Write-Host "`nFEHLER:" -ForegroundColor Red
    $results.errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$file = "exports\audit_comprehensive_$ts.json"
$results | ConvertTo-Json -Depth 5 | Out-File $file
Write-Host "`nErgebnisse gespeichert in: $file" -ForegroundColor Gray

return $results





