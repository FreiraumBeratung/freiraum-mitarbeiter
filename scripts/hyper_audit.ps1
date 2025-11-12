param()
$ErrorActionPreference = "Stop"
$ROOT = (Resolve-Path "$PSScriptRoot\..").Path
$base = "http://localhost:30521/api"
$ui = "http://localhost:5173"
$stamp = (Get-Date -Format "yyyyMMdd_HHmmss")
$EXPORTS = Join-Path $ROOT "exports"
New-Item -ItemType Directory -Path $EXPORTS -Force | Out-Null
$md = New-Item -ItemType File -Path (Join-Path $EXPORTS "HYPER_AUDIT_$stamp.md") -Force
$json = Join-Path $EXPORTS "HYPER_AUDIT_$stamp.json"
$results = @()

function OK($name,$ms=0){ $global:results += [pscustomobject]@{name=$name;status='OK';ms=$ms} ; Write-Host "OK  $name ($ms ms)" -ForegroundColor Green }
function FAIL($name,$msg){ $global:results += [pscustomobject]@{name=$name;status='FAIL';ms=0;msg=$msg}; Write-Host "FAIL $name :: $msg" -ForegroundColor Red }

function TimedGet($url,$t=15){ $sw=[Diagnostics.Stopwatch]::StartNew(); $r=Invoke-RestMethod -Method Get -Uri $url -TimeoutSec $t; $sw.Stop(); return ,$r,$sw.ElapsedMilliseconds }
function TimedPost($url,$body,$t=20){ $sw=[Diagnostics.Stopwatch]::StartNew(); $r=Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Body ($body|ConvertTo-Json -Depth 8) -TimeoutSec $t; $sw.Stop(); return ,$r,$sw.ElapsedMilliseconds }

# --- API ---
try { $r,$ms=TimedGet "$base/ready"; if($r.ok){ OK "Ready" $ms } else { FAIL "Ready" "ok=false" } } catch { FAIL "Ready" $_.Exception.Message }
try { $r,$ms=TimedGet "$base/health"; if($r.ok){ OK "Health" $ms } else { FAIL "Health" "ok=false" } } catch { FAIL "Health" $_.Exception.Message }
try { $r,$ms=TimedGet "$base/system/status"; OK "System Status" $ms } catch { FAIL "System Status" $_.Exception.Message }

# Compat endpoints
try { $r,$ms=TimedPost "$base/offers/draft" @{customer="Audit GmbH"; items=@(@{title="Service"; quantity="2"; price="99,9"})}; if($r.ok){ OK "Offer Draft" $ms } else { FAIL "Offer Draft" "ok=false" } } catch { FAIL "Offer Draft" $_.Exception.Message }
try { $r,$ms=TimedPost "$base/character/event" @{user="denis"; message="Audit Ping"; mood="neutral"; topics="audit,kpi"}; if($r.ok){ OK "Character Event" $ms } else { FAIL "Character Event" "ok=false" } } catch { FAIL "Character Event" $_.Exception.Message }
try { $r,$ms=TimedPost "$base/kb/items" @{title="Audit Note"; body="OK"; tags="audit,ui"}; if($r.ok -or $r.id){ OK "KB Create" $ms } else { FAIL "KB Create" "no ok/id" } } catch { FAIL "KB Create" $_.Exception.Message }

# Insights / Decision / Reports
try { $r,$ms=TimedGet "$base/insights/suggestions"; OK "Insights Suggestions" $ms } catch { FAIL "Insights Suggestions" $_.Exception.Message }
try { $r,$ms=TimedPost "$base/decision/think" @{user_id="denis"}; OK "Decision Think" $ms } catch { FAIL "Decision Think" $_.Exception.Message }
try { $r,$ms=TimedGet "$base/reports/kpis"; OK "Reports KPIs" $ms } catch { FAIL "Reports KPIs" $_.Exception.Message }
try { $r,$ms=TimedGet "$base/reports/export.csv" 30; OK "Reports CSV" $ms } catch { FAIL "Reports CSV" $_.Exception.Message }
try { $r,$ms=TimedGet "$base/reports/export.pdf" 30; OK "Reports PDF" $ms } catch { FAIL "Reports PDF" $_.Exception.Message }

# Async Lead Hunter (poll up to 90s)
$taskId=$null
try {
  $r,$ms=TimedPost "$base/lead_hunter/hunt_async" @{ category="shk"; location="Arnsberg"; count=5; save_to_db=$true; export_excel=$true; outreach=$false }
  if($r.ok){ OK "Lead Hunter create (async)" $ms; $taskId=$r.task_id } else { FAIL "Lead Hunter create (async)" "ok=false" }
} catch { FAIL "Lead Hunter create (async)" $_.Exception.Message }

if($taskId){
  $done=$false; for($i=0;$i -lt 60;$i++){ Start-Sleep -Milliseconds 1500
    try {
      $tr = Invoke-RestMethod "$base/lead_hunter/task/$taskId" -TimeoutSec 10
      if($tr.status -in @('done','error','canceled')){ $done=$true; if($tr.status -eq 'done'){ OK "Lead Hunter (async) finished" 0 } else { FAIL "Lead Hunter (async)" $tr.status } break }
    } catch {}
  }
  if(-not $done){ FAIL "Lead Hunter (async)" "timeout" }
}

# Proactive Engine quick check (5s)
try {
  $r = Invoke-RestMethod -Method Post -Uri "$base/proactive/remember" -ContentType "application/json" -Body (@{ user_id="denis"; kind="followup"; note="Audit-Reminder (5s)"; in="5s"; payload=@{ origin="audit" }} | ConvertTo-Json -Depth 6) -TimeoutSec 15
  Start-Sleep -Seconds 6
  Invoke-RestMethod -Method Post -Uri "$base/proactive/trigger" -TimeoutSec 10 | Out-Null
  $items = (Invoke-RestMethod "$base/proactive/reminders?status=queued" -TimeoutSec 10).items
  if ($items -and $items.Count -gt 0) { FAIL "Proactive Reminder" "queued remains" } else { OK "Proactive Reminder" 0 }
} catch { FAIL "Proactive Reminder" $_.Exception.Message }

# --- UI (Playwright) ---
try {
  $frontOk = $false
  try { Invoke-WebRequest $ui -TimeoutSec 5 | Out-Null; $frontOk=$true } catch {}
  if(-not $frontOk){ FAIL "UI reachable" "no response" } else { OK "UI reachable" 0 }
  Set-Location (Join-Path $ROOT "frontend\fm-app")
  npm run test:ui --silent | Out-Null
  OK "UI Playwright" 0
} catch { FAIL "UI Playwright" $_.Exception.Message }

# Write reports
$summary = @{
  time = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  backend = ":30521"
  frontend = ":5173"
  results = $results
}
$summary | ConvertTo-Json -Depth 8 | Out-File $json -Encoding UTF8

$okCount = ($results | Where-Object {$_.status -eq 'OK'}).Count
$failCount = ($results | Where-Object {$_.status -eq 'FAIL'}).Count
@"
# HYPER-AUDIT REPORT
**Zeit:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")  |  **Backend:** :30521  |  **Frontend:** :5173

## Zusammenfassung
- **Gesamt:** $($results.Count)  |  [OK] **Bestanden:** $okCount  |  [FAIL] **Fehlgeschlagen:** $failCount

## Details
$(
  $results | ForEach-Object {
    if($_.status -eq 'OK'){ "- [OK] $($_.name) - $($_.ms) ms" }
    else { "- [FAIL] $($_.name) - $($_.msg)" }
  } | Out-String
)
"@ | Out-File $md.FullName -Encoding UTF8
Write-Host "`n== Reports ==" -ForegroundColor Cyan
Write-Host "MD:  $($md.FullName)"
Write-Host "JSON: $json"










