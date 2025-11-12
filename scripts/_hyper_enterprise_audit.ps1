# MEGA ULTRA NON-DESTRUCTIVE AUDIT
# Safe operations only: (re)start services, install deps if missing, run checks, no code changes.

$ErrorActionPreference = "Continue"

$root   = Split-Path -Parent $PSScriptRoot
$be     = Join-Path $root "backend"
$fe     = Join-Path $root "frontend\fm-app"
$export = Join-Path $root "backend\exports"
$reportJson = Join-Path $export "hyper_enterprise_audit.json"
$reportMd   = Join-Path $export "hyper_enterprise_audit.md"

New-Item -ItemType Directory -Force -Path $export | Out-Null

function NowIso { (Get-Date ([datetime]::UtcNow)).ToString("s") + "Z" }

# ---------- Helpers ----------

function Test-Port([int]$port){
  try{
    $tcp = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if($tcp){ return @{ ok=$true; pids=($tcp | Select-Object -Expand OwningProcess | Sort-Object -Unique) } }
    else { return @{ ok=$false } }
  }catch{ return @{ ok=$false; err="no_permission" } }
}

function Ensure-NodeDeps {
  param([string]$dir)
  if(!(Test-Path (Join-Path $dir "node_modules"))){
    Write-Host "Installing node dependencies in $dir..."
    Push-Location $dir
    npm i --silent
    if($LASTEXITCODE -ne 0){ throw "npm install failed in $dir" }
    npx playwright install --with-deps | Out-Null
    Pop-Location
  }
}

function Try-Start-Backend {
  # start backend if not listening
  $p = Test-Port 30521
  if(-not $p.ok){
    Write-Host "Starting backend on port 30521..."
    Start-Process -WindowStyle Hidden -FilePath "pwsh" -ArgumentList "-NoProfile","-Command","cd `"$be`"; python -m uvicorn app.main:app --host 127.0.0.1 --port 30521" | Out-Null
    Start-Sleep -Seconds 3
  }
}

function Try-Start-Frontend {
  $p = Test-Port 5173
  if(-not $p.ok){
    Write-Host "Starting frontend on port 5173..."
    Push-Location $fe
    Start-Process -WindowStyle Hidden -FilePath "pwsh" -ArgumentList "-NoProfile","-Command","cd `"$fe`"; npm run dev -- --port 5173 --host" | Out-Null
    Pop-Location
    Start-Sleep -Seconds 4
  }
}

function HttpJson($url){
  try{
    $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
    if($r.StatusCode -eq 200){
      try {
        $json = $r.Content | ConvertFrom-Json -AsHashtable
        return @{ ok=$true; status=$r.StatusCode; json=$json; raw=$r.Content }
      } catch {
        # Fallback: Try without AsHashtable for compatibility
        try {
          $json = $r.Content | ConvertFrom-Json
          return @{ ok=$true; status=$r.StatusCode; json=$json; raw=$r.Content }
        } catch {
          return @{ ok=$true; status=$r.StatusCode; json=$null; raw=$r.Content; parse_error=$_.Exception.Message }
        }
      }
    } else {
      return @{ ok=$false; status=$r.StatusCode; body=$r.Content }
    }
  }catch{
    return @{ ok=$false; err=$_.Exception.Message }
  }
}

function Check-UI($url){
  try{
    $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
    return @{ ok=($r.StatusCode -eq 200); status=$r.StatusCode }
  }catch{ return @{ ok=$false; err=$_.Exception.Message } }
}

function Safe-Playwright {
  param([string]$dir)
  Push-Location $dir
  $ok=$true
  try{
    npm run test:ui 2>&1 | Out-Null
    if($LASTEXITCODE -ne 0){ $ok=$false }
  }catch{ $ok=$false }
  Pop-Location
  return $ok
}

function Safe-Vitest {
  param([string]$dir)
  Push-Location $dir
  $ok=$true
  try{
    npm run test 2>&1 | Out-Null
    if($LASTEXITCODE -ne 0){ $ok=$false }
  }catch{ $ok=$false }
  Pop-Location
  return $ok
}

# ---------- Begin Audit ----------

$summary = [ordered]@{
  generated_at = NowIso
  environment  = @{
    host = $env:COMPUTERNAME
    user = $env:USERNAME
    os   = (Get-CimInstance Win32_OperatingSystem).Caption
    node = (node -v) 2>$null
    npm  = (npm -v) 2>$null
    python = (python --version) 2>$null
    pwsh = $PSVersionTable.PSVersion.ToString()
  }
  ports       = @{}
  deps        = @{}
  backend     = @{}
  frontend    = @{}
  voice       = @{}
  features    = @{}
  providers   = @{}
  ui          = @{}
  qa          = @{}
  findings    = @()
  score       = @{ total = 100; ok = 0; ratio = 0; label = "pending" }
}

# Ensure node deps (non-destructive)
try{ 
  Ensure-NodeDeps -dir $fe
  $summary.deps.frontend="ok" 
}catch{ 
  $summary.deps.frontend="fail: $($_.Exception.Message)"
  $summary.findings += "FE deps missing: $($_.Exception.Message)"
}

# Start services if needed (non-destructive)
Try-Start-Backend
Try-Start-Frontend

# Wait a bit for services to be ready
Start-Sleep -Seconds 2

# Ports
$summary.ports.backend = Test-Port 30521
$summary.ports.frontend = Test-Port 5173

# Backend basic
$beStatus = HttpJson "http://127.0.0.1:30521/api/system/status"
$beCfg    = HttpJson "http://127.0.0.1:30521/api/system/config"
$beHealth = HttpJson "http://127.0.0.1:30521/api/health"
$summary.backend.status = $beStatus
$summary.backend.config = $beCfg
$summary.backend.health = $beHealth

# Features
$feats = HttpJson "http://127.0.0.1:30521/api/system/features"
$summary.features = $feats

# Voice stack checks (local providers)
$ttsHealth = HttpJson "http://127.0.0.1:30521/api/tts/health"
$sttHealth = HttpJson "http://127.0.0.1:30521/api/stt/health"
$summary.voice.tts = $ttsHealth
$summary.voice.stt = $sttHealth

# Providers sanity (no heavy web calls; only endpoints existence)
$providers = @{}
try {
  $providers.lead_hunter_hc = HttpJson "http://127.0.0.1:30521/api/lead_hunter/task/healthcheck"
} catch {
  $providers.lead_hunter_hc = @{ ok=$false; err="endpoint_not_found" }
}
$providers.exports_list   = HttpJson "http://127.0.0.1:30521/api/exports/list"
$summary.providers = $providers

# Frontend routes
$uiRoot   = Check-UI "http://localhost:5173"
$uiCtrl   = Check-UI "http://localhost:5173/control-center"
$uiLeads  = Check-UI "http://localhost:5173/leads-real"
$uiDiag   = Check-UI "http://localhost:5173/voice-diagnostics"
$uiRadar  = Check-UI "http://localhost:5173/lead-radar"

$summary.ui = @{
  root = $uiRoot
  control_center = $uiCtrl
  leads_real = $uiLeads
  voice_diagnostics = $uiDiag
  lead_radar = $uiRadar
}

# QA runs (safe)
Write-Host "Running Vitest tests..."
$vitestOk = Safe-Vitest -dir $fe
Write-Host "Running Playwright tests..."
$playOk   = Safe-Playwright -dir $fe
$summary.qa = @{ vitest = $vitestOk; playwright = $playOk }

# Scoring
$score = 0
if($summary.ports.backend.ok){ $score += 8 } else { $summary.findings += "Backend-Port 30521 nicht offen." }
if($summary.ports.frontend.ok){ $score += 8 } else { $summary.findings += "Frontend-Port 5173 nicht offen." }
if($beStatus.ok -and $beStatus.status -eq 200){ $score += 12 } else { $summary.findings += "API /system/status nicht OK." }
if($beCfg.ok -and $beCfg.status -eq 200){ $score += 5 } else { $summary.findings += "API /system/config nicht OK." }
if($beHealth.ok -and $beHealth.status -eq 200){ $score += 8 } else { $summary.findings += "API /api/health nicht OK." }
if($ttsHealth.ok){ $score += 7 } else { $summary.findings += "TTS Health not OK." }
if($sttHealth.ok){ $score += 7 } else { $summary.findings += "STT Health not OK." }
if($feats.ok){ $score += 6 } else { $summary.findings += "Feature-Endpoint nicht OK." }
if($uiRoot.ok){ $score += 5 } else { $summary.findings += "Frontend Root nicht erreichbar." }
if($uiCtrl.ok){ $score += 8 } else { $summary.findings += "Control-Center nicht erreichbar." }
if($uiLeads.ok){ $score += 6 } else { $summary.findings += "Leads-Real Seite nicht erreichbar." }
if($uiDiag.ok){ $score += 6 } else { $summary.findings += "Voice-Diagnostics nicht erreichbar." }
if($uiRadar.ok){ $score += 6 } else { $summary.findings += "Lead-Radar nicht erreichbar." }
if($vitestOk){ $score += 6 } else { $summary.findings += "Vitest fehlgeschlagen." }
if($playOk){ $score += 6 } else { $summary.findings += "Playwright fehlgeschlagen." }

# Cap score at 100
$score = [Math]::Min($score, 100)
$summary.score.ok = $score
$summary.score.total = 100
$summary.score.ratio = [Math]::Round($score / 100, 3)
$summary.score.label = if($score -ge 90){"GRÜN"} elseif($score -ge 70){"GELB"} else {"ROT"}

# Findings: common hints (non-destructive fixes)
if(-not $summary.ports.backend.ok){ $summary.findings += "Fix-Hinweis: Backend starten: cd backend; python -m uvicorn app.main:app --host 127.0.0.1 --port 30521" }
if(-not $summary.ports.frontend.ok){ $summary.findings += "Fix-Hinweis: Frontend starten: cd frontend\fm-app; npm run dev -- --port 5173 --host" }
if(-not ($beCfg.ok -and $beCfg.json)){ $summary.findings += "Fix-Hinweis: backend/.env prüfen (REAL_MODE, LEAD_PROVIDER)." }

# Write reports
$summary | ConvertTo-Json -Depth 8 | Out-File -Encoding UTF8 $reportJson

$md = @()
$md += "# Hyper Enterprise Audit"
$md += ""
$md += "- Zeitpunkt: $($summary.generated_at)"
$md += "- Score: **$($summary.score.ok)/$($summary.score.total)**  → $($summary.score.label)"
$md += ""
$md += "## Kernergebnisse"
$md += "- Backend-Port: $($summary.ports.backend.ok) | Frontend-Port: $($summary.ports.frontend.ok)"
$md += "- /api/system/status: $($beStatus.ok) | /api/system/config: $($beCfg.ok)"
$md += "- /api/health: $($beHealth.ok) | Features-API: $($feats.ok)"
$md += "- UI: Root=$($uiRoot.ok), ControlCenter=$($uiCtrl.ok), LeadsReal=$($uiLeads.ok), VoiceDiag=$($uiDiag.ok), LeadRadar=$($uiRadar.ok)"
$md += "- Tests: Vitest=$vitestOk, Playwright=$playOk"
$md += ""
$md += "## Voice Stack"
$md += "- TTS Health ok: $($ttsHealth.ok)  | STT Health ok: $($sttHealth.ok)"
$md += ""
$md += "## Features"
if($feats.ok -and $feats.json){
  $md += "- Erkannte Features: $($feats.json.features | ConvertTo-Json -Compress)"
} else {
  $md += "- Features-API nicht erreichbar"
}
$md += ""
$md += "## Providers"
$md += "- Exports List: $($providers.exports_list.ok)"
$md += "- Lead Hunter HC: $($providers.lead_hunter_hc.ok)"
$md += ""
$md += "## Findings"
if($summary.findings.Count -eq 0){ $md += "- Keine kritischen Findings. System ist stabil." }
else { $summary.findings | ForEach-Object { $md += "- $_" } }
$md += ""
$md += "## Nächste Schritte (nicht-destruktiv)"
$md += "- Bei roten Checks: Services neu starten (siehe Fix-Hinweise oben)"
$md += "- Bei fehlender .env: backend/.env prüfen"
$md += "- Optional: scripts/_enterprise_ui_audit.ps1 für UI-Vertiefung"
$md += ""

$md -join "`r`n" | Out-File -Encoding UTF8 $reportMd

Write-Host ("HYPER-AUDIT DONE score={0}/100 report={1}" -f $summary.score.ok, $reportMd)

