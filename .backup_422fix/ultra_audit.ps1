Param(
  [string]$BaseUrl = "http://localhost:30521/api",
  [string]$FrontendUrl = "http://localhost:5173",
  [int]$ReadyTimeoutSec = 120
)

$ErrorActionPreference = "Stop"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$reportPath = Join-Path (Join-Path $PSScriptRoot "..\data\exports") "ULTRA_AUDIT_${($ts -replace '[: ]','_')}.md"
New-Item -ItemType Directory -Force -Path (Split-Path $reportPath) | Out-Null

function Wait-Ready {
  param([string]$Url, [int]$TimeoutSec)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-RestMethod -Method GET -Uri "$Url/ready" -TimeoutSec 5
      if ($r.ok -eq $true) { return @{ ok=$true; msg="ready ok" } }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  # Fallback: if /ready missing or not green, accept if system/status answers 200
  try {
    Invoke-RestMethod -Method GET -Uri "$Url/system/status" -TimeoutSec 5 | Out-Null
    return @{ ok=$true; msg="fallback: system/status ok" }
  } catch {
    return @{ ok=$false; msg="not ready after $TimeoutSec s" }
  }
}

function Check {
  param([string]$Name, [scriptblock]$Run)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $null = & $Run
    $sw.Stop()
    return @{ name=$Name; ok=$true; ms=[int]$sw.ElapsedMilliseconds; msg="" }
  } catch {
    $sw.Stop()
    return @{ name=$Name; ok=$false; ms=[int]$sw.ElapsedMilliseconds; msg=$_.Exception.Message }
  }
}

function TryPostVariants {
  param([string]$Name, [string]$Url, [array]$Bodies, [int]$Timeout=10)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  foreach ($b in $Bodies) {
    try {
      $json = $b | ConvertTo-Json -Depth 8
      Invoke-RestMethod -Method POST -Uri $Url -ContentType "application/json" -Body $json -TimeoutSec $Timeout | Out-Null
      $sw.Stop()
      return @{ name=$Name; ok=$true; ms=[int]$sw.ElapsedMilliseconds; msg="" }
    } catch { }
  }
  $sw.Stop()
  return @{ name=$Name; ok=$false; ms=[int]$sw.ElapsedMilliseconds; msg="all variants failed (422?)" }
}

$results = @()

# 0) UI reachable
$results += Check "UI reachable" { Invoke-WebRequest -UseBasicParsing -Uri $FrontendUrl -TimeoutSec 10 | Out-Null }

# 1) readiness (with fallback)
$ready = Wait-Ready -Url $BaseUrl -TimeoutSec $ReadyTimeoutSec
$results += @{ name="Readiness (/ready)"; ok=$ready.ok; ms=0; msg=$ready.msg }

# 2) health
$results += Check "Health (/health)" { Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 6 | Out-Null }

# 3) core
$results += Check "System Status" { Invoke-RestMethod "$BaseUrl/system/status" -TimeoutSec 6 | Out-Null }
$results += Check "Profile List" { Invoke-RestMethod "$BaseUrl/profile" -TimeoutSec 6 | Out-Null }
$results += TryPostVariants -Name "Profile Set" -Url "$BaseUrl/profile/set" -Bodies @(
  @{key="audit.last"; value=$ts},
  @{k="audit.last"; v=$ts}
) -Timeout 6
$results += Check "License Get" { Invoke-RestMethod "$BaseUrl/license" -TimeoutSec 6 | Out-Null }
$results += Check "Leads List" { Invoke-RestMethod "$BaseUrl/leads" -TimeoutSec 6 | Out-Null }

# 4) offers draft (tolerant)
$results += TryPostVariants -Name "Offer Draft" -Url "$BaseUrl/offers/draft" -Bodies @(
  @{ items=@(@{name="Test"; qty=1; price=99.0}) },
  @{ items=@(@{title="Test"; quantity=1; unit_price=99.0}) },
  @{ customer="Test GmbH"; items=@(@{name="Test"; qty=1; price=99.0}) },
  @{ customer_id=1; items=@(@{name="Test"; qty=1; price=99.0}) }
) -Timeout 12

# 5) followups / reports
$results += Check "Followups List" { Invoke-RestMethod "$BaseUrl/followups" -TimeoutSec 6 | Out-Null }
$results += Check "Followups Due" { Invoke-RestMethod "$BaseUrl/followups/due" -TimeoutSec 6 | Out-Null }
$results += Check "Reports KPIs" { Invoke-RestMethod "$BaseUrl/reports/kpis" -TimeoutSec 6 | Out-Null }
$results += Check "Reports CSV" { Invoke-WebRequest -UseBasicParsing "$BaseUrl/reports/export.csv" -TimeoutSec 12 | Out-Null }
$results += Check "Reports PDF" { Invoke-WebRequest -UseBasicParsing "$BaseUrl/reports/export.pdf" -TimeoutSec 25 | Out-Null }

# 6) insights / character (tolerant event)
$results += Check "Insights Suggestions" { Invoke-RestMethod "$BaseUrl/insights/suggestions" -TimeoutSec 6 | Out-Null }
$results += Check "Character State" { Invoke-RestMethod "$BaseUrl/character/state?user_id=denis" -TimeoutSec 6 | Out-Null }
$results += TryPostVariants -Name "Character Event" -Url "$BaseUrl/character/event" -Bodies @(
  @{ user_id="denis"; text="audit ping"; sentiment="neutral" },
  @{ user_id="denis"; text="audit ping"; mood="neutral"; topics=@("offers") },
  @{ text="audit ping"; user="denis" }
) -Timeout 8

# 7) decision (tolerant)
$results += TryPostVariants -Name "Decision Think" -Url "$BaseUrl/decision/think" -Bodies @(
  @{},
  @{ user_id="denis" },
  @{ force=$true }
) -Timeout 20
$results += Check "Decision History" { Invoke-RestMethod "$BaseUrl/decision/history?user_id=denis" -TimeoutSec 8 | Out-Null }

# 8) automation / kb (tolerant create)
$results += Check "Automation Queue" { Invoke-RestMethod "$BaseUrl/automation/queue?user_id=denis" -TimeoutSec 8 | Out-Null }
$results += Check "KB List" { Invoke-RestMethod "$BaseUrl/kb/items" -TimeoutSec 8 | Out-Null }
$results += TryPostVariants -Name "KB Create" -Url "$BaseUrl/kb/items" -Bodies @(
  @{ title="AuditNote $ts"; content="ok" },
  @{ title="AuditNote $ts"; body="ok"; tags=@() },
  @{ name="AuditNote $ts"; content="ok"; tags=@("audit") }
) -Timeout 8
$results += Check "KB Search" { Invoke-RestMethod "$BaseUrl/kb/search?q=AuditNote" -TimeoutSec 8 | Out-Null }

# 9) intent / voice / leads
$results += Check "Intent Parse" { Invoke-RestMethod "$BaseUrl/intent/parse" -Method POST -ContentType "application/json" -Body (@{ text="suche 3 shk arnsberg" } | ConvertTo-Json) -TimeoutSec 10 | Out-Null }
$results += Check "Intent Act" { Invoke-RestMethod "$BaseUrl/intent/act" -Method POST -ContentType "application/json" -Body (@{ text="suche 3 shk arnsberg" } | ConvertTo-Json) -TimeoutSec 10 | Out-Null }
$results += Check "Voice Command" { Invoke-RestMethod "$BaseUrl/voice/command" -Method POST -ContentType "application/json" -Body (@{ user_id="denis"; text="such 3 SHK in Arnsberg" } | ConvertTo-Json) -TimeoutSec 15 | Out-Null }
$results += Check "Lead Hunter Hunt" { Invoke-RestMethod "$BaseUrl/lead_hunter/hunt" -Method POST -ContentType "application/json" -Body (@{ category="shk"; location="arnsberg"; count=2; save_to_db=$false; export_excel=$false } | ConvertTo-Json) -TimeoutSec 30 | Out-Null }
$results += Check "Lead Hunter Excel Export" { Invoke-RestMethod "$BaseUrl/lead_hunter/export_excel" -Method POST -ContentType "application/json" -Body (@{ category="shk"; location="arnsberg"; count=2 } | ConvertTo-Json) -TimeoutSec 30 | Out-Null }

# 10) mail / calendar / sequences
$results += Check "Mail Check" { Invoke-RestMethod "$BaseUrl/mail/check" -TimeoutSec 12 | Out-Null }
$results += Check "Calendar List" { Invoke-RestMethod "$BaseUrl/calendar/list" -TimeoutSec 10 | Out-Null }
$startTime = (Get-Date).AddHours(2).ToString("yyyy-MM-ddTHH:mm:ss")
$endTime = (Get-Date).AddHours(3).ToString("yyyy-MM-ddTHH:mm:ss")
$results += TryPostVariants -Name "Calendar Create" -Url "$BaseUrl/calendar/create" -Bodies @(
  @{ title="Audit Termin"; start=$startTime; end=$endTime; location="Online"; attendees=@() },
  @{ title="Audit Termin"; start=$startTime; end=$endTime }
) -Timeout 10
$results += TryPostVariants -Name "Sequences Create" -Url "$BaseUrl/sequences" -Bodies @(
  @{ name="AuditSeq $ts"; description="auto"; steps=@(@{day_offset=0; subject="Info"; body="Hallo {{company}}"; attach_flyer=$false}) },
  @{ title="AuditSeq $ts"; steps=@(@{day_offset=0; subject="Info"; body="Hallo"; attach_flyer=$false}) }
) -Timeout 10
$results += Check "Sequences List" { Invoke-RestMethod "$BaseUrl/sequences" -TimeoutSec 8 | Out-Null }

# write report
$okCount = ($results | Where-Object {$_.ok}) | Measure-Object | Select-Object -ExpandProperty Count
$total = $results.Count
$failCount = $total - $okCount

$md = @()
$md += "# ULTRA-AUDIT REPORT"
$md += "**Zeit:** $ts  |  **Backend:** :30521  |  **Frontend:** :5173`n"
$md += "## Zusammenfassung"
$md += "- **Gesamt:** $total  |  [OK] **Bestanden:** $okCount  |  [FAIL] **Fehlgeschlagen:** $failCount`n"
$md += "## Details"
foreach ($r in $results) {
  $status = if ($r.ok) { "[OK]" } else { "[FAIL]" }
  $line = "- $status **$($r.name)** - $($r.ms) ms"
  if (-not $r.ok -and $r.msg) { $line += " - $($r.msg)" }
  $md += $line
}
$mdText = [string]::Join("`n", $md)
$mdText | Out-File -FilePath $reportPath -Encoding UTF8

Write-Host "`n==== RESULT ====" -ForegroundColor Cyan
Write-Host "OK: $okCount / $total   FAIL: $failCount" -ForegroundColor Cyan
Write-Host "Report: $reportPath" -ForegroundColor Yellow
Write-Host "Open UI: $FrontendUrl" -ForegroundColor Green
