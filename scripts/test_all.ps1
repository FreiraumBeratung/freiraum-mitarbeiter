# Vollständiger System-Test für Freiraum Mitarbeiter
$BASE_URL = "http://127.0.0.1:30521"
$results = @()
$errors = @()

function Test-Endpoint {
    param($Method, $Path, $Body = $null, $Description)
    $url = "$BASE_URL$Path"
    Write-Host "`n[$Method] $Path - $Description" -ForegroundColor Cyan
    
    try {
        $headers = @{"Content-Type" = "application/json"}
        if ($Body) {
            $response = Invoke-RestMethod -Uri $url -Method $Method -Headers $headers -Body ($Body | ConvertTo-Json -Depth 10) -TimeoutSec 10 -ErrorAction Stop
        } else {
            $response = Invoke-RestMethod -Uri $url -Method $Method -Headers $headers -TimeoutSec 10 -ErrorAction Stop
        }
        Write-Host "  OK" -ForegroundColor Green
        $script:results += @{Endpoint = "$Method $Path"; Status = "OK"; Description = $Description; Response = ($response | ConvertTo-Json -Depth 3) }
        return $response
    } catch {
        $err = $_.Exception.Message
        Write-Host "  FEHLER: $err" -ForegroundColor Red
        $script:errors += @{Endpoint = "$Method $Path"; Error = $err; Description = $Description}
        $script:results += @{Endpoint = "$Method $Path"; Status = "ERROR"; Description = $Description; Error = $err}
        return $null
    }
}

Write-Host "=== FREIRAUM MITARBEITER - VOLLSTÄNDIGER SYSTEM-TEST ===" -ForegroundColor Yellow
Write-Host "Backend: $BASE_URL`n" -ForegroundColor Yellow

# 1. System & Health
Write-Host "`n[1] SYSTEM & HEALTH CHECKS" -ForegroundColor Magenta
Test-Endpoint "GET" "/api/system/status" $null "System-Status"
Test-Endpoint "GET" "/api/health" $null "Health-Check"

# 2. E-Mail
Write-Host "`n[2] E-MAIL FUNKTIONEN" -ForegroundColor Magenta
$mailCheck = Test-Endpoint "GET" "/api/mail/check" $null "IMAP/SMTP Status"
if ($mailCheck) {
    Write-Host "  IMAP: $($mailCheck.imap.ok) - $($mailCheck.imap.reason)" -ForegroundColor $(if($mailCheck.imap.ok){"Green"}else{"Yellow"})
    Write-Host "  SMTP: $($mailCheck.smtp.ok) - $($mailCheck.smtp.reason)" -ForegroundColor $(if($mailCheck.smtp.ok){"Green"}else{"Yellow"})
}

# 3. Leads
Write-Host "`n[3] LEADS" -ForegroundColor Magenta
$leads = Test-Endpoint "GET" "/api/leads" $null "Leads-Liste"
Write-Host "  Gefundene Leads: $($leads.Count)" -ForegroundColor $(if($leads.Count -gt 0){"Green"}else{"Yellow"})

# Test-Lead erstellen
$testLead = @{
    company = "Test GmbH"
    contact_name = "Max Mustermann"
    contact_email = "max@test.de"
    status = "new"
    notes = "Test-Lead für System-Test"
}
Test-Endpoint "POST" "/api/leads" $testLead "Test-Lead erstellen"

# 4. Angebote
Write-Host "`n[4] ANGEBOTE" -ForegroundColor Magenta
$offerData = @{
    customer = "Test-Kunde GmbH"
    items = @(
        @{name = "Artikel A"; qty = 10; unit_price = 2.50}
        @{name = "Artikel B"; qty = 5; unit_price = 5.00}
    )
}
$offer = Test-Endpoint "POST" "/api/offers/draft" $offerData "Angebot erstellen"
if ($offer -and $offer.id) {
    Test-Endpoint "GET" "/api/offers/$($offer.id)/pdf" $null "PDF generieren"
}

# 5. Follow-ups
Write-Host "`n[5] FOLLOW-UPS" -ForegroundColor Magenta
$followups = Test-Endpoint "GET" "/api/followups" $null "Follow-ups Liste"
Test-Endpoint "GET" "/api/followups/due" $null "Fällige Follow-ups"

$fuData = @{
    entity_type = "lead"
    entity_id = 1
    due_at = (Get-Date).AddDays(7).ToString("yyyy-MM-ddTHH:mm:ss")
    note = "Follow-up Test"
}
Test-Endpoint "POST" "/api/followups" $fuData "Follow-up erstellen"

# 6. Reports
Write-Host "`n[6] REPORTS" -ForegroundColor Magenta
$kpis = Test-Endpoint "GET" "/api/reports/kpis" $null "KPIs abrufen"
if ($kpis) {
    Write-Host "  Leads: $($kpis.leads)" -ForegroundColor Green
    Write-Host "  Angebote: $($kpis.offers)" -ForegroundColor Green
    Write-Host "  Gewonnen: $($kpis.won_offers)" -ForegroundColor Green
}

# 7. License
Write-Host "`n[7] LIZENZ" -ForegroundColor Magenta
$license = Test-Endpoint "GET" "/api/license" $null "Lizenz abrufen"
if ($license) {
    Write-Host "  Aktuelle Lizenz: $($license.tier)" -ForegroundColor Green
}

# 8. Profile (neu)
Write-Host "`n[8] PROFILE" -ForegroundColor Magenta
$profileList = Test-Endpoint "GET" "/api/profile/" $null "Profile-Liste"
$profileSet = @{
    key = "test_preference"
    value = "Test-Wert"
}
Test-Endpoint "POST" "/api/profile/set" $profileSet "Profile-Eintrag setzen"

# 9. Insights (neu)
Write-Host "`n[9] INSIGHTS" -ForegroundColor Magenta
$suggestions = Test-Endpoint "GET" "/api/insights/suggestions" $null "Suggestions abrufen"
Write-Host "  Gefundene Suggestions: $($suggestions.Count)" -ForegroundColor $(if($suggestions.Count -gt 0){"Green"}else{"Yellow"})

# Test-Interaktionen loggen
$interactions = @(
    @{contact_email = "max@test.de"; contact_name = "Max Mustermann"; channel = "email"; direction = "out"; notes = "Erste E-Mail"}
    @{contact_email = "max@test.de"; contact_name = "Max Mustermann"; channel = "email"; direction = "out"; notes = "Zweite E-Mail"}
    @{contact_email = "max@test.de"; contact_name = "Max Mustermann"; channel = "email"; direction = "in"; notes = "Antwort erhalten"}
)

foreach ($interaction in $interactions) {
    Test-Endpoint "POST" "/api/insights/log" $interaction "Interaktion loggen"
}
Start-Sleep -Seconds 2

# Suggestions erneut abrufen (nach Logging)
$suggestions2 = Test-Endpoint "GET" "/api/insights/suggestions" $null "Suggestions nach Logging"

# 10. Knowledge Base
Write-Host "`n[10] KNOWLEDGE BASE" -ForegroundColor Magenta
Test-Endpoint "GET" "/api/kb/ping" $null "KB Ping"

# Summary
Write-Host "`n`n=== TEST-ZUSAMMENFASSUNG ===" -ForegroundColor Yellow
$total = $results.Count
$ok = ($results | Where-Object {$_.Status -eq "OK"}).Count
$failed = ($results | Where-Object {$_.Status -eq "ERROR"}).Count

Write-Host "Total Tests: $total" -ForegroundColor Cyan
Write-Host "Erfolgreich: $ok" -ForegroundColor Green
Write-Host "Fehler: $failed" -ForegroundColor $(if($failed -eq 0){"Green"}else{"Red"})

if ($errors.Count -gt 0) {
    Write-Host "`nFEHLER-DETAILS:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  [$($err.Endpoint)] $($err.Description)" -ForegroundColor Red
        Write-Host "    $($err.Error)" -ForegroundColor Yellow
    }
}

# Report speichern
$report = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    summary = @{
        total = $total
        ok = $ok
        failed = $failed
    }
    results = $results
    errors = $errors
}

$reportPath = "$PSScriptRoot\..\exports\TEST_REPORT.json"
$report | ConvertTo-Json -Depth 10 | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host "`nReport gespeichert: $reportPath" -ForegroundColor Green

Write-Host "`n=== TEST ABGESCHLOSSEN ===" -ForegroundColor Yellow

