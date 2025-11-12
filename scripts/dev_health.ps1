param([int]$Port = 30521)
$ErrorActionPreference = "Stop"
$api = "http://127.0.0.1:$Port/api/health"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exports = Join-Path $root "exports"
New-Item -ItemType Directory -Force -Path $exports | Out-Null

try {
  $j = Invoke-RestMethod -Method GET -Uri $api -TimeoutSec 6
  $ok = $j.ok
  $checks = $j.checks
  $color = if ($ok) { "lime" } else { "red" }
  $rows = ""
  foreach ($k in $checks.Keys) {
    $v = $checks[$k]
    $vtxt = if ($v -is [bool]) { if ($v) {"OK"} else {"ERR"} } else { $v }
    $vcolor = if ($v -eq $true) {"#7CFC00"} else {"#FF4500"}
    $rows += "<tr><td style='padding:8px;border:1px solid #333'>$k</td><td style='padding:8px;border:1px solid #333;color:$vcolor'>$vtxt</td></tr>"
  }
  $html = @"
<!doctype html><html><head><meta charset="utf-8"><title>Health</title></head>
<body style="background:#000;color:#ffa500;font-family:Inter,Arial;padding:24px">
<h1>Freiraum Mitarbeiter – Health</h1>
<p>Gesamt: <b style="color:$color">$ok</b></p>
<table style="border-collapse:collapse;color:#ffa500">$rows</table>
</body></html>
"@
  $out = Join-Path $exports "STATUS_REPORT.html"
  $html | Set-Content -Encoding UTF8 $out
  Write-Host "Report: $out" -ForegroundColor Green
} catch {
  Write-Host "Fehler: $($_.Exception.Message)" -ForegroundColor Red
}
