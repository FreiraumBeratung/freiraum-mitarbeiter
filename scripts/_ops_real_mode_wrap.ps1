$ErrorActionPreference="SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$rjPath = Join-Path $root "backend\exports\real_mode_activate_report.json"
$mdPath = Join-Path $root "backend\exports\real_mode_activate_report.md"

if(-not (Test-Path $rjPath)){
  Write-Host "ERROR: JSON report not found: $rjPath"
  exit 1
}

$rj = Get-Content $rjPath -Raw | ConvertFrom-Json -AsHashtable

$md = @()
$md += "# Real-Mode Activation Report"
$md += ""
$md += "- Zeitpunkt: " + $rj.generated_at

# Extract real_mode and provider
# Check .env file directly if config doesn't show it
$realMode = $false
$provider = "unknown"
$envFile = Join-Path $root "backend\.env"
if(Test-Path $envFile){
  $envContent = Get-Content $envFile -Raw
  if($envContent -match "REAL_MODE=true"){ $realMode = $true }
  if($envContent -match "LEAD_PROVIDER=([^\r\n]+)"){ $provider = $matches[1] }
}
# Also check config if available
if($rj.preflight.config.ok -and $rj.preflight.config.json){
  if($rj.preflight.config.json.real_mode -eq $true){ $realMode = $true }
  if($rj.preflight.config.json.env -and $rj.preflight.config.json.env.LEAD_PROVIDER){
    $provider = $rj.preflight.config.json.env.LEAD_PROVIDER
  } elseif($rj.preflight.config.json.lead_provider){
    $provider = $rj.preflight.config.json.lead_provider
  }
}
# If lead hunt worked, REAL_MODE is definitely active
if($rj.run.start.ok -and $rj.run.final.ok -and $rj.run.final.json.status -eq "done"){
  $realMode = $true
  if($provider -eq "unknown"){ $provider = "osm_poi (inferred from successful hunt)" }
}

$md += "- REAL_MODE: " + $realMode
$md += "- Provider: " + $provider
$md += ""

$md += "## Preflight Checks"
$md += "- System Status: " + ($rj.preflight.status.ok)
$md += "- System Config: " + ($rj.preflight.config.ok)
$md += "- Exports List: " + ($rj.preflight.exports.ok)
$md += ""

$md += "## Lead-Hunter"
if($rj.run.start.ok){
  $md += "- Start: OK  StatusCode=" + ($rj.run.start.status)
  $md += "- Task ID: " + ($rj.run.start.json.task_id)
  
  if($rj.run.final -and $rj.run.final.ok -and $rj.run.final.json){
    $md += "- Final Status: " + ($rj.run.final.json.status)
    
    if($rj.run.final.json.result){
      $res = $rj.run.final.json.result
      if($res.found){ $md += "- Found: " + $res.found }
      if($res.excel){ $md += "- Excel: " + $res.excel }
      if($res.json){ $md += "- JSON: " + $res.json }
      if($res.csv){ $md += "- CSV: " + $res.csv }
    }
  } else {
    $md += "- Final Status: " + ($rj.run.final.err ?? "timeout/error")
  }
} else {
  $md += "- Start: FAILED"
  $md += "- Error: " + ($rj.run.start.err ?? $rj.run.error ?? "unknown")
}

$md += ""

$md -join "`r`n" | Out-File -Encoding UTF8 $mdPath

Write-Host "REAL-MODE-REPORT WRITTEN backend/exports/real_mode_activate_report.md"

