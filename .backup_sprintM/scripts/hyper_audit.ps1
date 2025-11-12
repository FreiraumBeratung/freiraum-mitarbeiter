$ErrorActionPreference="Stop"

$ROOT = Join-Path $env:USERPROFILE "Desktop\freiraum-mitarbeiter"

$EXPORT = Join-Path $ROOT "exports"

New-Item -ItemType Directory -Path $EXPORT -Force | Out-Null



$base = "http://localhost:30521/api"

$ui = "http://localhost:5173"



$script:results = @()

function OK($name){ $script:results += [pscustomobject]@{ name=$name; ok=$true; msg=""; } }

function FAIL($name,$msg){ $script:results += [pscustomobject]@{ name=$name; ok=$false; msg=$msg; } }



# --- API Probes ---

try { Invoke-RestMethod "$base/ready" -TimeoutSec 5 | Out-Null; OK "Ready" } catch { FAIL "Ready" $_.Exception.Message }

try { Invoke-RestMethod "$base/health" -TimeoutSec 10 | Out-Null; OK "Health" } catch { FAIL "Health" $_.Exception.Message }

try { Invoke-RestMethod "$base/system/status" -TimeoutSec 5 | Out-Null; OK "System Status" } catch { FAIL "System Status" $_.Exception.Message }



# tolerant payloads already in backend; just smoke them:

function POSTJSON($url,$payload){

  $json = ($payload | ConvertTo-Json -Depth 10)

  return Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Body $json -TimeoutSec 20

}

try { POSTJSON "$base/offers/draft" @{ items=@(@{ title="Service"; quantity="2"; price="99,9"}) } | Out-Null; OK "Offer Draft" } catch { FAIL "Offer Draft" $_.Exception.Message }

try { POSTJSON "$base/character/event" @{ user="denis"; message="Audit Ping"; mood="neutral"; topics="audit,kpi"} | Out-Null; OK "Character Event" } catch { FAIL "Character Event" $_.Exception.Message }

try { POSTJSON "$base/kb/items" @{ topic="Audit Note"; content="OK"; tags="audit,ui"} | Out-Null; OK "KB Create" } catch { FAIL "KB Create" $_.Exception.Message }

try { Invoke-RestMethod "$base/insights/suggestions" -TimeoutSec 10 | Out-Null; OK "Insights Suggestions" } catch { FAIL "Insights Suggestions" $_.Exception.Message }

try { POSTJSON "$base/decision/think" @{ user_id="denis"} | Out-Null; OK "Decision Think" } catch { FAIL "Decision Think" $_.Exception.Message }



# Reports

try { Invoke-RestMethod "$base/reports/kpis" -TimeoutSec 10 | Out-Null; OK "Reports KPIs" } catch { FAIL "Reports KPIs" $_.Exception.Message }

try { Invoke-WebRequest "$base/reports/export.csv" -TimeoutSec 20 | Out-Null; OK "Reports CSV" } catch { FAIL "Reports CSV" $_.Exception.Message }

try { Invoke-WebRequest "$base/reports/export.pdf" -TimeoutSec 30 | Out-Null; OK "Reports PDF" } catch { FAIL "Reports PDF" $_.Exception.Message }



# Lead Hunter (keine fixen Erwartungen; nur 200)

try { POSTJSON "$base/lead_hunter/hunt" @{ category="shk"; location="Arnsberg"; count=3; save_to_db=$true; export_excel=$true } | Out-Null; OK "Lead Hunter Hunt" } catch { FAIL "Lead Hunter Hunt" $_.Exception.Message }



# --- UI Audit (Playwright) ---

$uiOk=$false

try {

  Set-Location "$ROOT\\frontend\\fm-app"

  npx playwright test --reporter=list 2>&1 | Out-Null

  $uiOk=$true

} catch {

  $uiOk=$false

}

if($uiOk){ OK "UI reachable + Avatar visible" } else { FAIL "UI reachable + Avatar visible" "Playwright tests failed" }



# Summarize

$okCount = ($script:results | Where-Object {$_.ok}).Count

$failCount = ($script:results | Where-Object {-not $_.ok}).Count

$sum = $script:results.Count

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

$md = @()

$md += "# HYPER-AUDIT REPORT"

$md += "**Zeit:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")  |  **Backend:** :30521  |  **Frontend:** :5173"

$md += ""

$md += "## Zusammenfassung"

$md += "- **Gesamt:** $sum  |  [OK] **Bestanden:** $okCount  |  [FAIL] **Fehlgeschlagen:** $failCount"

$md += ""

$md += "## Details"

foreach($r in $script:results){

  $icon = if($r.ok){"[OK]"} else {"[FAIL]"}

  $line = "- $icon **$($r.name)**"

  if(-not $r.ok -and $r.msg){ $line += " - $($r.msg)" }

  $md += $line

}

$mdText = $md -join "`r`n"

$mdPath = Join-Path $EXPORT "HYPER_AUDIT_$stamp.md"

$script:results | ConvertTo-Json -Depth 6 | Out-File (Join-Path $EXPORT "HYPER_AUDIT_$stamp.json") -Encoding UTF8

$mdText | Out-File $mdPath -Encoding UTF8



Write-Host "`nReport: $mdPath" -ForegroundColor Green

