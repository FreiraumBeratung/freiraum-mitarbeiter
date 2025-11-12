param()

function New-Stopwatch { [System.Diagnostics.Stopwatch]::StartNew() }

function Test-HttpOk {
  param([string]$Url, [int]$TimeoutSec=20)
  try {
    $sw = New-Stopwatch
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    return [pscustomobject]@{ ok = ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300); ms = $sw.ElapsedMilliseconds; status = $r.StatusCode; error = $null; content = $r.Content }
  } catch {
    return [pscustomobject]@{ ok = $false; ms = 0; status = 0; error = $_.Exception.Message; content = "" }
  }
}

function Test-Rest {
  param(
    [ValidateSet('GET','POST','PUT','DELETE','PATCH')][string]$Method,
    [string]$Url,
    [hashtable]$Body,
    [int]$TimeoutSec=25
  )
  try {
    $sw = New-Stopwatch
    if ($Method -eq 'GET') {
      $resp = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec $TimeoutSec
    } else {
      $json = if ($Body) { $Body | ConvertTo-Json -Depth 10 } else { '{}' }
      $resp = Invoke-RestMethod -Method $Method -Uri $Url -ContentType "application/json" -Body $json -TimeoutSec $TimeoutSec
    }
    return [pscustomobject]@{ ok = $true; ms = $sw.ElapsedMilliseconds; data = $resp; error = $null }
  } catch {
    return [pscustomobject]@{ ok = $false; ms = 0; data = $null; error = $_.Exception.Message }
  }
}

function Ensure-Dir { param([string]$Path) if (!(Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null } }

function Write-Section { param([string]$Title) Write-Host "`n==== $Title ====" -ForegroundColor Cyan }

function Append-Report {
  param([string]$Path,[string]$Text)
  Add-Content -Path $Path -Value $Text -Encoding UTF8
}

