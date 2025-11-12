# Smoke tests for Sprint C - Lead-Hunter 1.0
$base = "http://localhost:30521/api"

Write-Host "`n=== SPRINT C - LEAD-HUNTER 1.0 TESTS ===" -ForegroundColor Cyan

# 1) Simple hunt (small count for speed)
Write-Host "`n[1] POST /api/lead_hunter/hunt" -ForegroundColor Yellow
try {
  $hunt = @{
    category = "shk"
    location = "arnsberg"
    count = 5
    save_to_db = $true
    export_excel = $true
  } | ConvertTo-Json
  
  $result = Invoke-RestMethod -Method Post -Uri "$base/lead_hunter/hunt" -ContentType "application/json" -Body $hunt
  Write-Host "  ✓ Hunt erfolgreich" -ForegroundColor Green
  Write-Host "    Gefunden: $($result.found)" -ForegroundColor Gray
  Write-Host "    Gespeichert: $($result.saved)" -ForegroundColor Gray
  if ($result.excel_path) {
    Write-Host "    Excel: $($result.excel_path)" -ForegroundColor Gray
  }
  if ($result.leads) {
    Write-Host "    Leads: $($result.leads.Count)" -ForegroundColor Gray
    $result.leads | Select-Object -First 3 | ForEach-Object {
      Write-Host "      - $($_.company): $($_.emails.Count) E-Mails" -ForegroundColor Cyan
    }
  }
} catch {
  Write-Host "  ✗ Hunt failed: $_" -ForegroundColor Red
}

# 2) Queue integration (simulate action execution)
Write-Host "`n[2] POST /api/decision/execute (lead.hunt action)" -ForegroundColor Yellow
try {
  $act = @{
    user_id = "denis"
    actions = @(@{
      key = "lead.hunt"
      title = "Hunt"
      reason = "test"
      score = 0.9
      payload = @{
        category = "elektro"
        location = "neheim"
        count = 5
      }
    })
    dry_run = $false
  } | ConvertTo-Json -Depth 5
  
  $execResult = Invoke-RestMethod -Method Post -Uri "$base/decision/execute" -ContentType "application/json" -Body $act
  Write-Host "  ✓ Execute erfolgreich" -ForegroundColor Green
  Write-Host "    Results: $($execResult.results.Count)" -ForegroundColor Gray
  $execResult.results | ForEach-Object {
    if ($_.ok) {
      Write-Host "      ✓ $($_.key)" -ForegroundColor Green
    } else {
      Write-Host "      ✗ $($_.key): $($_.error)" -ForegroundColor Red
    }
  }
} catch {
  Write-Host "  ✗ Execute failed: $_" -ForegroundColor Red
}

# 3) Outreach (with dummy leads for test)
Write-Host "`n[3] POST /api/lead_hunter/outreach" -ForegroundColor Yellow
try {
  $dummyLeads = @{
    leads = @(
      @{
        company = "Test Firma"
        emails = @("test@example.com")
        city = "Teststadt"
        category = "test"
      }
    )
  } | ConvertTo-Json
  
  $outreachResult = Invoke-RestMethod -Method Post -Uri "$base/lead_hunter/outreach" -ContentType "application/json" -Body $dummyLeads
  Write-Host "  ✓ Outreach erfolgreich" -ForegroundColor Green
  Write-Host "    Gesendet: $($outreachResult.sent)" -ForegroundColor Gray
  Write-Host "    Follow-ups: $($outreachResult.followups_created)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Outreach failed: $_" -ForegroundColor Red
}

# 4) Export Excel
Write-Host "`n[4] POST /api/lead_hunter/export_excel" -ForegroundColor Yellow
try {
  $exportLeads = @{
    leads = @(
      @{
        company = "Test Firma 1"
        category = "test"
        location = "test"
        emails = @("test1@example.com")
        phones = @("0123456789")
      },
      @{
        company = "Test Firma 2"
        category = "test"
        location = "test"
        emails = @("test2@example.com")
        phones = @()
      }
    )
  } | ConvertTo-Json
  
  $exportResult = Invoke-RestMethod -Method Post -Uri "$base/lead_hunter/export_excel" -ContentType "application/json" -Body $exportLeads
  Write-Host "  ✓ Export erfolgreich" -ForegroundColor Green
  Write-Host "    Excel: $($exportResult.excel_path)" -ForegroundColor Gray
} catch {
  Write-Host "  ✗ Export failed: $_" -ForegroundColor Red
}

Write-Host "`n=== TESTS ABGESCHLOSSEN ===" -ForegroundColor Green

















