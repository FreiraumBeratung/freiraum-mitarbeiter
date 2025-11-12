Param(
  [string]$BaseUrl = "http://localhost:30521/api",
  [string]$FrontendUrl = "http://localhost:5173",
  [int]$ReadyTimeoutSec = 90
)

$ErrorActionPreference = "Stop"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$reportPath = Join-Path (Join-Path $PSScriptRoot "..\exports") "ULTRA_AUDIT_${($ts -replace '[: ]','_')}.md"
New-Item -ItemType Directory -Force -Path (Split-Path $reportPath) | Out-Null

function Wait-Ready {
  param([string]$Url, [int]$TimeoutSec)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-RestMethod -Method GET -Uri "$Url/ready" -TimeoutSec 5
      if ($r.ok -eq $true) { return $true }
    } catch { Start-Sleep -Milliseconds 500 }
    Start-Sleep -Milliseconds 500
  }
  return $false
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

$results = @()

# 0) Reachability + readiness
$results += Check "UI reachable" { Invoke-WebRequest -UseBasicParsing -Uri $FrontendUrl -TimeoutSec 10 | Out-Null }

$readyOk = Check "Readiness (/ready)" { 
  if (-not (Wait-Ready -Url $BaseUrl -TimeoutSec $ReadyTimeoutSec)) { throw "not ready after $ReadyTimeoutSec s" } 
}
$results += $readyOk

# 1) Health (lightweight, should ALWAYS be ok)
$results += Check "Health (/health)" { Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5 | Out-Null }

# 2) Core endpoints
$results += Check "System Status" { Invoke-RestMethod "$BaseUrl/system/status" -TimeoutSec 5 | Out-Null }
$results += Check "Profile List" { Invoke-RestMethod "$BaseUrl/profile" -TimeoutSec 5 | Out-Null }
$results += Check "Profile Set" { Invoke-RestMethod "$BaseUrl/profile/set" -Method POST -ContentType "application/json" -Body (@{key="audit.last"; value="$ts"} | ConvertTo-Json) -TimeoutSec 5 | Out-Null }
$results += Check "License Get" { Invoke-RestMethod "$BaseUrl/license" -TimeoutSec 5 | Out-Null }
$results += Check "Leads List" { Invoke-RestMethod "$BaseUrl/leads" -TimeoutSec 5 | Out-Null }
$results += Check "Offer Draft" { Invoke-RestMethod "$BaseUrl/offers/draft" -Method POST -ContentType "application/json" -Body (@{ items=@(@{name="Test"; qty=1; price=99.0}) } | ConvertTo-Json) -TimeoutSec 8 | Out-Null }
$results += Check "Followups List" { Invoke-RestMethod "$BaseUrl/followups" -TimeoutSec 5 | Out-Null }
$results += Check "Followups Due" { Invoke-RestMethod "$BaseUrl/followups/due" -TimeoutSec 5 | Out-Null }
$results += Check "Reports KPIs" { Invoke-RestMethod "$BaseUrl/reports/kpis" -TimeoutSec 5 | Out-Null }
$results += Check "Reports CSV" { Invoke-WebRequest -UseBasicParsing "$BaseUrl/reports/export.csv" -TimeoutSec 10 | Out-Null }
$results += Check "Reports PDF" { Invoke-WebRequest -UseBasicParsing "$BaseUrl/reports/export.pdf" -TimeoutSec 20 | Out-Null }
$results += Check "Insights Suggestions" { Invoke-RestMethod "$BaseUrl/insights/suggestions" -TimeoutSec 5 | Out-Null }
$results += Check "Character State" { Invoke-RestMethod "$BaseUrl/character/state?user_id=denis" -TimeoutSec 5 | Out-Null }
$results += Check "Character Event" { Invoke-RestMethod "$BaseUrl/character/event" -Method POST -ContentType "application/json" -Body (@{ user_id="denis"; text="audit ping"; sentiment="neutral" } | ConvertTo-Json) -TimeoutSec 5 | Out-Null }
$results += Check "Decision Think" { Invoke-RestMethod "$BaseUrl/decision/think" -Method POST -ContentType "application/json" -Body "{}" -TimeoutSec 15 | Out-Null }
$results += Check "Decision History" { Invoke-RestMethod "$BaseUrl/decision/history" -TimeoutSec 5 | Out-Null }
$results += Check "Automation Queue" { Invoke-RestMethod "$BaseUrl/automation/queue?user_id=denis" -TimeoutSec 5 | Out-Null }
$results += Check "KB List" { Invoke-RestMethod "$BaseUrl/kb/items" -TimeoutSec 5 | Out-Null }
$results += Check "KB Create" { Invoke-RestMethod "$BaseUrl/kb/items" -Method POST -ContentType "application/json" -Body (@{ title="AuditNote $ts"; content="ok" } | ConvertTo-Json) -TimeoutSec 5 | Out-Null }
$results += Check "KB Search" { Invoke-RestMethod "$BaseUrl/kb/search?q=AuditNote" -TimeoutSec 5 | Out-Null }
$results += Check "Intent Parse" { Invoke-RestMethod "$BaseUrl/intent/parse" -Method POST -ContentType "application/json" -Body (@{ text="suche 3 shk arnsberg" } | ConvertTo-Json) -TimeoutSec 8 | Out-Null }
$results += Check "Intent Act" { Invoke-RestMethod "$BaseUrl/intent/act" -Method POST -ContentType "application/json" -Body (@{ text="suche 3 shk arnsberg" } | ConvertTo-Json) -TimeoutSec 8 | Out-Null }
$results += Check "Voice Command" { Invoke-RestMethod "$BaseUrl/voice/command" -Method POST -ContentType "application/json" -Body (@{ user_id="denis"; text="such 3 SHK in Arnsberg" } | ConvertTo-Json) -TimeoutSec 10 | Out-Null }
$results += Check "Lead Hunter Hunt" { Invoke-RestMethod "$BaseUrl/lead_hunter/hunt" -Method POST -ContentType "application/json" -Body (@{ category="shk"; location="arnsberg"; count=2; save_to_db=$false; export_excel=$false } | ConvertTo-Json) -TimeoutSec 25 | Out-Null }
$results += Check "Lead Hunter Excel Export" { Invoke-RestMethod "$BaseUrl/lead_hunter/export_excel" -Method POST -ContentType "application/json" -Body (@{ category="shk"; location="arnsberg"; count=2 } | ConvertTo-Json) -TimeoutSec 25 | Out-Null }
$results += Check "Mail Check" { Invoke-RestMethod "$BaseUrl/mail/check" -TimeoutSec 10 | Out-Null }
$results += Check "Calendar List" { Invoke-RestMethod "$BaseUrl/calendar/list" -TimeoutSec 8 | Out-Null }
$results += Check "Calendar Create" { Invoke-RestMethod "$BaseUrl/calendar/create" -Method POST -ContentType "application/json" -Body (@{ title="Audit Termin"; start=(Get-Date).AddHours(2).ToString("s"); end=(Get-Date).AddHours(3).ToString("s"); location="Online"; attendees=@() } | ConvertTo-Json) -TimeoutSec 8 | Out-Null }
$results += Check "Sequences Create" { Invoke-RestMethod "$BaseUrl/sequences" -Method POST -ContentType "application/json" -Body (@{ name="AuditSeq $ts"; description="auto"; steps=@(@{day_offset=0; subject="Info"; body="Hallo {{company}}"; attach_flyer=$false}) } | ConvertTo-Json) -TimeoutSec 8 | Out-Null }
$results += Check "Sequences List" { Invoke-RestMethod "$BaseUrl/sequences" -TimeoutSec 5 | Out-Null }

# write MD report
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
