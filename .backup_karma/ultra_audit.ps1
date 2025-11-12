param(
  [int]$PORT_BACKEND = 30521,
  [int]$PORT_FRONTEND = 5173
)
$ErrorActionPreference = "Stop"

function Ensure-Dir { param([string]$p) if (!(Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }
function NowTs { Get-Date -Format "yyyyMMdd_HHmmss" }

$ROOT = Split-Path -Parent $PSScriptRoot
$LOGDIR = Join-Path $ROOT "logs"
$OUT_MD = Join-Path $ROOT ("exports\ULTRA_AUDIT_{0}.md" -f (NowTs))
$OUT_JSON = Join-Path $ROOT ("exports\ULTRA_AUDIT_{0}.json" -f (NowTs))
Ensure-Dir $LOGDIR

$results = New-Object System.Collections.ArrayList
$meta = @{
  time = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss");
  backend = "http://localhost:$PORT_BACKEND";
  frontend = "http://localhost:$PORT_FRONTEND";
}

function Add-Result { param($name,$ok,$ms,[string]$detail="")
  if ($null -eq $ms) { $ms = 0 }
  $null = $results.Add([ordered]@{ name=$name; ok=$ok; ms=[int]$ms; detail=$detail })
  if ($ok) { Write-Host ("[OK] {0} ({1} ms)" -f $name,$ms) -ForegroundColor Green }
  else     { Write-Host ("[FAIL] {0} :: {1}" -f $name,$detail) -ForegroundColor Red }
}

function Invoke-Json {
  param([string]$method,[string]$url,$body=$null,[int]$timeout=20)
  $sw=[Diagnostics.Stopwatch]::StartNew()
  try{
    if($method -eq "GET"){
      $r = Invoke-RestMethod -Method GET -Uri $url -TimeoutSec $timeout
      $sw.Stop(); return ,@($true,$sw.ElapsedMilliseconds,$r,$null)
    } else {
      $json = ($body | ConvertTo-Json -Depth 8)
      $r = Invoke-RestMethod -Method $method -Uri $url -ContentType "application/json" -Body $json -TimeoutSec $timeout
      $sw.Stop(); return ,@($true,$sw.ElapsedMilliseconds,$r,$null)
    }
  } catch {
    $sw.Stop(); return ,@($false,$sw.ElapsedMilliseconds,$null,$_.Exception.Message)
  }
}

# ---- Warmup: warte bis Health ok (max 20s)
$healthOk = $false
for($i=0;$i -lt 20;$i++){
  $ok,$ms,$data,$err = Invoke-Json -method "GET" -url "http://localhost:$PORT_BACKEND/api/health" -timeout 3
  if($ok -and $data.ok){ $healthOk=$true; Add-Result "Health" $true $ms ""; break }
  Start-Sleep -Milliseconds 700
}
if(-not $healthOk){
  # Versuche /ready (etwas strenger, aber wir loggen sauber)
  $ok,$ms,$data,$err = Invoke-Json -method "GET" -url "http://localhost:$PORT_BACKEND/api/health/ready" -timeout 3
  Add-Result "Health" ($ok -and $data.ok) $ms ($err)
}

# Frontend erreichbar?
try {
  $sw=[Diagnostics.Stopwatch]::StartNew()
  $r = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$PORT_FRONTEND" -TimeoutSec 5
  $sw.Stop()
  Add-Result "UI reachable" ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) $sw.ElapsedMilliseconds ""
} catch {
  Add-Result "UI reachable" $false 0 $_.Exception.Message
}

$base = "http://localhost:$PORT_BACKEND/api"

# --- Suite (gekürzt auf die Checks, die im Report standen) ---
$ok,$ms,$data,$err = Invoke-Json GET "$base/system/status"; Add-Result "System Status" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/profile"; Add-Result "Profile List" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json POST "$base/profile/set" @{ key="voice.leads.default_mode"; value="ask" }; Add-Result "Profile Set" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/license"; Add-Result "License Get" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/leads"; Add-Result "Leads List" $ok $ms $err
$ok,$ms,$draft,$err = Invoke-Json POST "$base/offers/draft" @{ customer="Test GmbH"; items=@(@{name="Demo";qty=1;unit="Stk";price=99}) }; Add-Result "Offer Draft" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/followups"; Add-Result "Followups List" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/followups/due"; Add-Result "Followups Due" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/reports/kpis"; Add-Result "Reports KPIs" $ok $ms $err
try { $sw=[Diagnostics.Stopwatch]::StartNew(); $csv=Invoke-WebRequest -Uri "$base/reports/export.csv" -UseBasicParsing -TimeoutSec 10; $sw.Stop(); Add-Result "Reports CSV" ($csv.StatusCode -eq 200) $sw.ElapsedMilliseconds "" } catch { Add-Result "Reports CSV" $false 0 $_.Exception.Message }
try { $sw=[Diagnostics.Stopwatch]::StartNew(); $pdf=Invoke-WebRequest -Uri "$base/reports/export.pdf" -UseBasicParsing -TimeoutSec 15; $sw.Stop(); Add-Result "Reports PDF" ($pdf.StatusCode -eq 200) $sw.ElapsedMilliseconds "" } catch { Add-Result "Reports PDF" $false 0 $_.Exception.Message }
$ok,$ms,$data,$err = Invoke-Json GET "$base/insights/suggestions"; Add-Result "Insights Suggestions" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/character/state?user_id=denis"; Add-Result "Character State" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json POST "$base/character/event" @{user_id="denis";text="Audit Event";topics=@("audit")}; Add-Result "Character Event" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json POST "$base/decision/think" @{user_id="denis"}; Add-Result "Decision Think" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/decision/history?user_id=denis"; Add-Result "Decision History" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/automation/queue?user_id=denis"; Add-Result "Automation Queue" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/kb/items"; Add-Result "KB List" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json POST "$base/kb/items" @{title="Audit Notiz";body="Erstellt am "+(Get-Date)}; Add-Result "KB Create" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/kb/search?q=Audit"; Add-Result "KB Search" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json POST "$base/intent/parse" @{ text="Suche 3 SHK in Arnsberg" }; Add-Result "Intent Parse" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json POST "$base/intent/act" @{ text="Suche 3 SHK in Arnsberg" }; Add-Result "Intent Act" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json POST "$base/voice/command" @{ user_id="denis"; text="such 3 shk in arnsberg" }; Add-Result "Voice Command" $ok $ms $err
$ok,$ms,$hunt,$err = Invoke-Json POST "$base/lead_hunter/hunt" @{ category="shk"; location="arnsberg"; count=3; save_to_db=$true; export_excel=$true }; Add-Result "Lead Hunter Hunt" $ok $ms ($(if($ok -and ($hunt.count -as [int]) -ge 0){"OK (count="+$hunt.count+")"}else{$err}))
$ok,$ms,$xout,$err = Invoke-Json POST "$base/lead_hunter/export_excel" @{ }; Add-Result "Lead Hunter Excel Export" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/mail/check"; Add-Result "Mail Check" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/calendar/list"; Add-Result "Calendar List" $ok $ms $err
$startTime = (Get-Date).AddHours(2).ToString("yyyy-MM-ddTHH:mm:ss")
$endTime = (Get-Date).AddHours(3).ToString("yyyy-MM-ddTHH:mm:ss")
$ok,$ms,$data,$err = Invoke-Json POST "$base/calendar/create" @{ title="Audit Termin"; start=$startTime; end=$endTime; location="Online"; attendees=@() }; Add-Result "Calendar Create" $ok $ms $err
$seqName = "Freiraum Seq "+(NowTs)
$ok,$ms,$data,$err = Invoke-Json POST "$base/sequences" @{ name=$seqName; description="Auto"; steps=@(@{day_offset=0;subject="Hallo";body="Info";attach_flyer=$false}) }; Add-Result "Sequences Create" $ok $ms $err
$ok,$ms,$data,$err = Invoke-Json GET "$base/sequences"; Add-Result "Sequences List" $ok $ms $err

# Aggregate & Export
$total = $results.Count
$passed = ($results | Where-Object { $_.ok }).Count
$failed = $total - $passed

$payload = [ordered]@{ meta=$meta; totals=@{total=$total; passed=$passed; failed=$failed}; results=$results }
$payload | ConvertTo-Json -Depth 6 | Set-Content -Path $OUT_JSON -Encoding UTF8

$md = @()
$md += "# ULTRA-AUDIT REPORT"
$md += "**Zeit:** $($meta.time)  |  **Backend:** :$PORT_BACKEND  |  **Frontend:** :$PORT_FRONTEND"
$md += ""
$md += "## Zusammenfassung"
$md += "- **Gesamt:** $total  |  [OK] **Bestanden:** $passed  |  [FAIL] **Fehlgeschlagen:** $failed"
$md += ""
$md += "## Details"
$results | ForEach-Object {
  $icon = if ($_.ok) {"[OK]"} else {"[FAIL]"}
  $ms = "{0} ms" -f $_.ms
  $detail = if([string]::IsNullOrWhiteSpace($_.detail)) { "" } else { " - " + $_.detail }
  $md += "- $icon **$($_.name)** - $ms$detail"
}
$md -join "`n" | Set-Content -Path $OUT_MD -Encoding UTF8

Write-Host "`n==============================" -ForegroundColor DarkCyan
Write-Host ("ULTRA-AUDIT FERTIG  ->  {0}" -f (Split-Path $OUT_MD -Leaf)) -ForegroundColor Cyan
Write-Host ("Bestanden: {0}/{1}" -f $passed,$total) -ForegroundColor Cyan
Write-Host ("Report (MD): {0}" -f $OUT_MD) -ForegroundColor Gray
Write-Host ("Report (JSON): {0}" -f $OUT_JSON) -ForegroundColor Gray
