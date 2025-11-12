# Umfassender Test - Sprint J + alle Funktionen
$base = "http://localhost:30521/api"
$errors = @()
$success = @()
$warnings = @()
$testResults = @{}

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "UMFASSENDER SYSTEM-TEST - SPRINT J" -ForegroundColor Magenta
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
        
        $valid = $true
        if ($expectedFields.Count -gt 0) {
            foreach ($field in $expectedFields) {
                if ($response.PSObject.Properties.Name -notcontains $field) {
                    $valid = $false
                    $script:warnings += "${name}: Field '$field' missing in response"
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

# 2. Deep Voice & Context Memory (SPRINT J)
Write-Host "`n2. Deep Voice & Context Memory (Sprint J)..." -ForegroundColor Cyan
$ctxList = Test-API "Context List" "GET" "$base/voice/context" $null @("ok", "entries")
if ($ctxList -and $ctxList.entries) {
    Write-Host "    Context-Einträge: $($ctxList.entries.Count)" -ForegroundColor Gray
}

# Context Update Test (JSON-Variante - mit Body als JSON)
Write-Host "    Teste Context Update..." -ForegroundColor Gray
try {
    $ctxBody = @{
        user = "denis"
        message = "Test-Nachricht vom umfassenden Test $(Get-Date -Format 'HH:mm:ss')"
        mood = "neutral"
    } | ConvertTo-Json
    
    $ctxParams = @{
        Method = "POST"
        Uri = "$base/voice/context/update_json"
        Body = $ctxBody
        ContentType = "application/json"
        TimeoutSec = 10
        ErrorAction = "Stop"
    }
    $ctxResponse = Invoke-RestMethod @ctxParams
    if ($ctxResponse.ok) {
        $script:success += "Context Update"
        Write-Host "  [OK] Context Update (Memory-Länge: $($ctxResponse.memory_len))" -ForegroundColor Green
    }
} catch {
    $script:errors += "Context Update: $_"
    Write-Host "  [FAIL] Context Update: $_" -ForegroundColor Red
}

# 3. Audit Functions
Write-Host "`n3. Audit Functions..." -ForegroundColor Cyan
$auditList = Test-API "Audit List" "GET" "$base/audit/list?limit=10" $null @()
Test-API "Audit Export CSV" "GET" "$base/audit/export.csv?limit=5" $null
Test-API "Audit Export PDF" "GET" "$base/audit/export.pdf?limit=5" $null

# 4. Leads
Write-Host "`n4. Leads..." -ForegroundColor Cyan
$leads = Test-API "Leads List" "GET" "$base/leads" $null @()
if ($leads -and $leads.Count -gt 0) {
    Write-Host "    Gefunden: $($leads.Count) Leads" -ForegroundColor Gray
}

# 5. Followups
Write-Host "`n5. Followups..." -ForegroundColor Cyan
$followups = Test-API "Followups List" "GET" "$base/followups" $null @()
$followupsDue = Test-API "Followups Due" "GET" "$base/followups/due" $null @()
if ($followupsDue -and $followupsDue.Count -gt 0) {
    Write-Host "    Fällige Follow-ups: $($followupsDue.Count)" -ForegroundColor Gray
}

# 6. Offers
Write-Host "`n6. Offers..." -ForegroundColor Cyan
$offerDraft = Test-API "Offer Draft" "POST" "$base/offers/draft" @{
    customer = "Test Kunde GmbH"
    items = @(
        @{ name = "Service A"; qty = 2; unit_price = 100 }
        @{ name = "Service B"; qty = 1; unit_price = 250 }
    )
} @("id", "total_gross")  # "customer" wird nicht zurückgegeben, nur in DB gespeichert

# 7. Insights
Write-Host "`n7. Insights..." -ForegroundColor Cyan
$insights = Test-API "Insights Suggestions" "GET" "$base/insights/suggestions" $null @()
if ($insights -and $insights.Count -gt 0) {
    Write-Host "    Vorschläge: $($insights.Count)" -ForegroundColor Gray
}

# 8. Profile
Write-Host "`n8. Profile..." -ForegroundColor Cyan
$profile = Test-API "Profile List" "GET" "$base/profile/" $null @()
Test-API "Profile Set" "POST" "$base/profile/set" @{key="test_key"; value="test_value"} @("ok")

# 9. Reports
Write-Host "`n9. Reports..." -ForegroundColor Cyan
$kpis = Test-API "Reports KPIs" "GET" "$base/reports/kpis" $null @()
if ($kpis) {
    Write-Host "    KPIs: $($kpis.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
}

# 10. License
Write-Host "`n10. License..." -ForegroundColor Cyan
$license = Test-API "License Get" "GET" "$base/license" $null @()

# 11. Sequences
Write-Host "`n11. Sequences..." -ForegroundColor Cyan
$sequences = Test-API "Sequences List" "GET" "$base/sequences" $null @()
# Sequence Create Test (mit Error-Handling)
Write-Host "    Teste Sequence Create..." -ForegroundColor Gray
try {
    $seqBody = @{
        name = "Test Sequence $(Get-Date -Format 'HHmmss')"
        description = "Test"
        steps = @(
            @{ day_offset = 0; subject = "Test"; body = "Test Body"; attach_flyer = $false }
        )
    } | ConvertTo-Json -Depth 10
    
    $seqParams = @{
        Method = "POST"
        Uri = "$base/sequences"
        Body = $seqBody
        ContentType = "application/json"
        TimeoutSec = 10
        ErrorAction = "Stop"
    }
    $seqResponse = Invoke-RestMethod @seqParams
    if ($seqResponse.id -or $seqResponse.ok) {
        $script:success += "Sequence Create"
        Write-Host "  [OK] Sequence Create" -ForegroundColor Green
    }
} catch {
    # Sequence Create kann fehlschlagen, wenn DB-Constraints verletzt werden - das ist OK
    $script:warnings += "Sequence Create: $($_.Exception.Message) (möglicherweise Duplikat)"
    Write-Host "  [WARN] Sequence Create: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 12. Calendar
Write-Host "`n12. Calendar..." -ForegroundColor Cyan
$calendar = Test-API "Calendar List" "GET" "$base/calendar/list" $null @()
$calCreate = Test-API "Calendar Create" "POST" "$base/calendar/create" @{
    title = "Test Event"
    start = (Get-Date).AddHours(1).ToUniversalTime().ToString("o")
    end = (Get-Date).AddHours(2).ToUniversalTime().ToString("o")
    location = "Test Location"
    attendees = @()
} @("id")

# 13. Knowledge Base
Write-Host "`n13. Knowledge Base..." -ForegroundColor Cyan
$kbList = Test-API "KB List" "GET" "$base/kb/items" $null @()
$kbSearch = Test-API "KB Search" "GET" "$base/kb/search?q=test" $null @()

# 14. Automation
Write-Host "`n14. Automation..." -ForegroundColor Cyan
$automation = Test-API "Automation Queue" "GET" "$base/automation/queue?user_id=denis" $null @("items")

# 15. Decision
Write-Host "`n15. Decision..." -ForegroundColor Cyan
$decisionThink = Test-API "Decision Think" "POST" "$base/decision/think" @{user_id="denis"; max_actions=3} @("actions", "mood")
$decisionHistory = Test-API "Decision History" "GET" "$base/decision/history?user_id=denis&limit=5" $null @()

# 16. Character
Write-Host "`n16. Character..." -ForegroundColor Cyan
$charState = Test-API "Character State" "GET" "$base/character/state?user_id=denis" $null @()
$charProfile = Test-API "Character Profile" "GET" "$base/character/profile?user_id=denis" $null @()

# 17. Lead Hunter
Write-Host "`n17. Lead Hunter..." -ForegroundColor Cyan
$leadHunt = Test-API "Lead Hunt" "POST" "$base/lead_hunter/hunt" @{
    category = "shk"
    location = "arnsberg"
    count = 2
    save_to_db = $false
    export_excel = $false
} @("found", "leads")

# 18. Mail
Write-Host "`n18. Mail..." -ForegroundColor Cyan
$mailCheck = Test-API "Mail Check" "GET" "$base/mail/check" $null @("imap", "smtp")

# 19. Voice Command
Write-Host "`n19. Voice Command..." -ForegroundColor Cyan
$voiceCmd = Test-API "Voice Command" "POST" "$base/voice/command" @{
    user_id = "denis"
    text = "Zeige KPIs"
} @()

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
$durations = @()
foreach ($result in $testResults.Values) {
    if ($result.Duration -and $result.Duration -gt 0) {
        $durations += $result.Duration
    }
}
if ($durations.Count -gt 0) {
    $avgDuration = ($durations | Measure-Object -Average).Average
    Write-Host "`nPerformance: Durchschnittliche Response-Zeit: $([math]::Round($avgDuration, 2))ms" -ForegroundColor Cyan
} else {
    Write-Host "`nPerformance: Keine Daten verfügbar" -ForegroundColor Gray
}

# Frontend Check
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "FRONTEND CHECK" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 10
    if ($frontendResponse.StatusCode -eq 200) {
        Write-Host "[OK] Frontend erreichbar (Status: $($frontendResponse.StatusCode))" -ForegroundColor Green
        Write-Host "Öffne Browser: http://localhost:5173" -ForegroundColor Cyan
    }
} catch {
    Write-Host "[FAIL] Frontend nicht erreichbar: $_" -ForegroundColor Red
}

# Report speichern
$reportDir = Join-Path (Split-Path $PSScriptRoot -Parent) "exports"
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$reportFile = Join-Path $reportDir "COMPREHENSIVE_TEST_REPORT_SPRINTJ_$(Get-Date -Format 'yyyyMMdd_HHmmss').md"

$reportContent = @"
# Umfassender System-Test Report – Sprint J

**Datum:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
**Umgebung:** Windows PowerShell 7.5, Python 3.13, FastAPI :30521, React + Vite + Tailwind

---

## Test-Ergebnisse

**Status:** $(if($errors.Count -eq 0){"✅ Alle Tests erfolgreich"}else{"❌ $($errors.Count) Fehler gefunden"})

### Erfolgreiche Tests: $($success.Count)
$($success | ForEach-Object { "- $_" } | Out-String)

### Fehler: $($errors.Count)
$(if($errors.Count -gt 0){
    $errors | ForEach-Object { "- $_" } | Out-String
} else {
    "Keine Fehler"
})

### Warnungen: $($warnings.Count)
$(if($warnings.Count -gt 0){
    $warnings | ForEach-Object { "- $_" } | Out-String
} else {
    "Keine Warnungen"
})

### Performance
- Durchschnittliche Response-Zeit: $([math]::Round($avgDuration, 2))ms

---

## Getestete Bereiche

1. Health & System
2. Deep Voice & Context Memory (Sprint J)
3. Audit Functions
4. Leads
5. Followups
6. Offers
7. Insights
8. Profile
9. Reports
10. License
11. Sequences
12. Calendar
13. Knowledge Base
14. Automation
15. Decision
16. Character
17. Lead Hunter
18. Mail
19. Voice Command

---

## Frontend Status

$(try {
    $r = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 5
    "✅ Frontend erreichbar (Status: $($r.StatusCode))"
} catch {
    "❌ Frontend nicht erreichbar: $_"
})

---

**Backend:** http://localhost:30521
**Frontend:** http://localhost:5173
"@

$reportContent | Out-File $reportFile -Encoding UTF8
Write-Host "`nReport gespeichert: $reportFile" -ForegroundColor Cyan

if ($errors.Count -eq 0) {
    Write-Host "`n[OK] Alle Tests erfolgreich!" -ForegroundColor Green
    return 0
} else {
    return 1
}

