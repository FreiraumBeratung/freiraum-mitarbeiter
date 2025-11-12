param(
  [int]$PortBackend = 30521,
  [int]$PortFrontend = 5173
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib\assert.ps1"

$ROOT = Split-Path -Parent $PSScriptRoot
$REPORT = Join-Path $ROOT "exports\AUDIT_ULTRA_REPORT.md"
Ensure-Dir (Split-Path $REPORT)

# Header
$header = "## VOLLSTAENDIGER ULTRA-AUDIT`n**Datum:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"
$header | Set-Content $REPORT -Encoding UTF8
Append-Report $REPORT ("**Backend:** :$PortBackend  |  **Frontend:** :$PortFrontend`n")

# 1) Self-Heal & Boot
Write-Section "Self-Heal & Boot"
. "$PSScriptRoot\lib\repair.ps1" -Root $ROOT -PortBackend $PortBackend -PortFrontend $PortFrontend

# 2) Health Probe
$base = "http://localhost:$PortBackend/api"
Write-Host "Warte auf Backend-Start..." -ForegroundColor Yellow
$okHealth = $false
for ($i=0; $i -lt 30 -and -not $okHealth; $i++) {
  $r = Test-HttpOk "$base/health" 10
  if ($r.ok) { $okHealth = $true; Write-Host "Backend ist bereit!" -ForegroundColor Green; break } else { 
    Write-Host "Versuch $($i+1)/30..." -ForegroundColor Gray
    Start-Sleep -Seconds 2 
  }
}
Append-Report $REPORT ("### System & Health`n- Health: " + ($(if($okHealth){"[OK]"}else{"[FAIL] - Backend nicht erreichbar"})) + "`n")
if (-not $okHealth) {
  Append-Report $REPORT ("`n**WARNUNG:** Backend konnte nicht gestartet werden. Backend-Tests werden uebersprungen.`n")
  Write-Host "WARNUNG: Backend nicht erreichbar - fuehre nur Frontend-Test durch" -ForegroundColor Yellow
  Append-Report $REPORT ("`n### Frontend`n")
  $rfe = Test-HttpOk "http://localhost:$PortFrontend" 10
  Append-Report $REPORT ("- UI erreichbar: " + ($(if($rfe.ok){"[OK]"}else{"[FAIL] "+$rfe.error})))
  Append-Report $REPORT ("`n### Ergebnis`n- Backend: Nicht erreichbar`n- Frontend: " + ($(if($rfe.ok){"[OK]"}else{"[FAIL]"})) + "`n")
  Write-Host "`n[FILE] Report geschrieben: $REPORT" -ForegroundColor Green
  exit 0
}

# Helper for test execution
$results = New-Object System.Collections.Generic.List[object]
function Run-Test {
  param([string]$Name,[string]$Method,[string]$Url,[hashtable]$Body)
  $res = Test-Rest -Method $Method -Url $Url -Body $Body
  $results.Add([pscustomobject]@{ name=$Name; ok=$res.ok; ms=$res.ms; error=$res.error })
  $status = if ($res.ok) { "[OK]" } else { "[FAIL]" }
  Append-Report $REPORT ("- $status $Name (`$Method $Url) " + $(if($res.ok){"${($res.ms)}ms"}else{$res.error}) )
}

# 3) Backend Endpoint Matrix
Write-Section "Backend API"
Append-Report $REPORT "`n### Backend API Tests`n"

# System
Run-Test "System Status" GET "$base/system/status" @{}

# License
Run-Test "License Get" GET "$base/license" @{}
Run-Test "License Set BASIS" POST "$base/license/set?tier=BASIS" @{}

# Profile
Run-Test "Profile List" GET "$base/profile" @{}
Run-Test "Profile Set voice.default" POST "$base/profile/set" @{ key="voice.leads.default_mode"; value="ask" }

# Leads
Run-Test "Leads List" GET "$base/leads" @{}
Run-Test "Lead Create" POST "$base/leads" @{ company="Demo GmbH $(Get-Date -Format HHmmss)"; email="demo$(Get-Random -Max 9999)@example.com"; city="Arnsberg" }

# Followups
Run-Test "Followups List" GET "$base/followups" @{}
Run-Test "Followups Due" GET "$base/followups/due" @{}
$dueAt = (Get-Date).AddDays(2).ToString("yyyy-MM-ddTHH:mm:ss")
Run-Test "Followup Create" POST "$base/followups" @{ entity_type="lead"; entity_id=1; due_at=$dueAt; note="Rückruf" }

# Offers
Run-Test "Offer Draft" POST "$base/offers/draft" @{ customer="Demo GmbH"; items=@(@{title="Beratung"; qty=2; unit="Std"; price=120}) }

# Reports
Run-Test "KPIs" GET "$base/reports/kpis" @{}
Run-Test "Export CSV" GET "$base/reports/export.csv" @{}
Run-Test "Export PDF" GET "$base/reports/export.pdf" @{}

# Insights
Run-Test "Suggestions" GET "$base/insights/suggestions" @{}
Run-Test "Insights Log" POST "$base/insights/log" @{ event="audit"; notes="ultra" }

# Character
Run-Test "Character State" GET "$base/character/state?user_id=denis" @{}
Run-Test "Character Event" POST "$base/character/event" @{ user_id="denis"; text="Audit läuft super"; sentiment="positive" }

# Decision
Run-Test "Decision Think" POST "$base/decision/think" @{ user_id="denis" }
Run-Test "Decision History" GET "$base/decision/history?user_id=denis" @{}

# Automation
Run-Test "Automation Queue" GET "$base/automation/queue?user_id=denis" @{}
Run-Test "Automation Auto-Enqueue" POST "$base/automation/auto?user_id=denis" @{}

# KB
Run-Test "KB Create" POST "$base/kb/items" @{ title="Audit Notiz"; body="Erstellt: $(Get-Date)"; tags=@("audit","system") }
Run-Test "KB List" GET "$base/kb/items" @{}
Run-Test "KB Search" GET "$base/kb/search?q=Audit" @{}

# Voice
Run-Test "Voice Command (ask)" POST "$base/voice/command" @{ user_id="denis"; text="suche 5 SHK in Arnsberg" }

# Lead-Hunter
Run-Test "Lead Hunt (shk/arnsberg)" POST "$base/lead_hunter/hunt" @{ category="shk"; location="arnsberg"; count=6; save_to_db=$false; export_excel=$false }

# Calendar
$startTime = (Get-Date).AddHours(1).ToString("yyyy-MM-ddTHH:mm:ss")
$endTime = (Get-Date).AddHours(2).ToString("yyyy-MM-ddTHH:mm:ss")
Run-Test "Calendar Create" POST "$base/calendar/create" @{ title="Audit Termin"; start=$startTime; end=$endTime; location="Online"; attendees=@() }
Run-Test "Calendar List" GET "$base/calendar/list" @{}

# Sequences
Run-Test "Sequences List" GET "$base/sequences" @{}
Run-Test "Sequences Create" POST "$base/sequences" @{ name="FreiraumAuto $(Get-Date -Format HHmmss)"; description="audit"; steps=@(@{day_offset=0; subject="Hallo"; body="Info"; attach_flyer=$false}) }

# Audit System (falls vorhanden)
try { Run-Test "Audit List" GET "$base/audit/list" @{} } catch {}

# 4) Frontend Ping
Write-Section "Frontend Ping"
Append-Report $REPORT "`n### Frontend`n"
$rfe = Test-HttpOk "http://localhost:$PortFrontend" 10
Append-Report $REPORT ("- UI erreichbar: " + ($(if($rfe.ok){"[OK]"}else{"[FAIL] "+$rfe.error})))

# 5) Bewertung + Zusammenfassung
$total = $results.Count
$passed = ($results | Where-Object {$_.ok}).Count
$failed = $total - $passed
$score = [math]::Round(($passed / [double]$total)*100,2)

Append-Report $REPORT ("`n### Ergebnis`n- Tests gesamt: **$total**`n- Bestanden: **$passed**`n- Fehlgeschlagen: **$failed**`n- Score: **$score`%**`n")

if ($failed -gt 0) {
  Append-Report $REPORT "`n### Fehlgeschlagene Tests`n"
  $results | Where-Object {!$_.ok} | ForEach-Object {
    Append-Report $REPORT ("- [FAIL] " + $_.name + " - " + $_.error)
  }
} else {
  Append-Report $REPORT "`nAlles gruen. [OK]"
}

Write-Host "`n[FILE] Report geschrieben: $REPORT" -ForegroundColor Green

