$ErrorActionPreference="Continue"

function J($url){ 
  try{ 
    $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
    try {
      $json = $r.Content | ConvertFrom-Json -AsHashtable
      return @{ok=($r.StatusCode -eq 200); status=$r.StatusCode; json=$json}
    } catch {
      $json = $r.Content | ConvertFrom-Json
      return @{ok=($r.StatusCode -eq 200); status=$r.StatusCode; json=$json}
    }
  }catch{ 
    return @{ok=$false; err=$_.Exception.Message} 
  } 
}

function PostJ($url,$body){ 
  try{ 
    $bodyJson = $body | ConvertTo-Json -Compress
    $r=Invoke-WebRequest -UseBasicParsing -Uri $url -Method Post -Body $bodyJson -ContentType "application/json" -TimeoutSec 30
    try {
      $json = $r.Content | ConvertFrom-Json -AsHashtable
      return @{ok=($r.StatusCode -eq 200 -or $r.StatusCode -eq 201); status=$r.StatusCode; json=$json}
    } catch {
      $json = $r.Content | ConvertFrom-Json
      return @{ok=($r.StatusCode -eq 200 -or $r.StatusCode -eq 201); status=$r.StatusCode; json=$json}
    }
  }catch{ 
    return @{ok=$false; err=$_.Exception.Message} 
  } 
}

$root = Split-Path -Parent $PSScriptRoot
$reportPath = Join-Path $root "backend\exports\real_mode_activate_report.json"

$report = @{
  generated_at = (Get-Date).ToString("s")
  preflight = @{}
  run = @{}
}

Write-Host "Running preflight checks..."
$report.preflight.status = J "http://127.0.0.1:30521/api/system/status"
$report.preflight.config = J "http://127.0.0.1:30521/api/system/config"
$report.preflight.exports = J "http://127.0.0.1:30521/api/exports/list"

Write-Host "Starting lead hunt..."
$kick = PostJ "http://127.0.0.1:30521/lead_hunter/hunt_async" @{ category="shk"; location="Arnsberg" }
$report.run.start = $kick

if(-not $kick.ok){ 
  $report.run.error = "kick_failed"
  $report | ConvertTo-Json -Depth 8 | Out-File -Encoding UTF8 $reportPath
  Write-Host ("REAL-MODE-SMOKE report={0} status=error_kick_failed" -f $reportPath)
  exit 1
}

$task = $kick.json.task_id
Write-Host "Task ID: $task"
Write-Host "Polling task status..."

$deadline = (Get-Date).AddSeconds(120)
$status = $null
$poll = $null

do{
  Start-Sleep -Seconds 2
  $poll = J ("http://127.0.0.1:30521/lead_hunter/task/" + $task)
  if($poll.ok -and $poll.json){
    $status = $poll.json.status
    Write-Host "Status: $status"
  } else {
    Write-Host "Poll failed: $($poll.err)"
    break
  }
} while (($status -ne "done" -and $status -ne "error") -and (Get-Date) -lt $deadline)

$report.run.final = $poll

$report | ConvertTo-Json -Depth 8 | Out-File -Encoding UTF8 $reportPath

Write-Host ("REAL-MODE-SMOKE report={0} status={1}" -f $reportPath, ($status ?? "unknown"))


