$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$report = Join-Path $root "backend\exports\enterprise_ui_audit.json"

$result = [ordered]@{
    time = (Get-Date).ToString("s")
    ui = $false
    config = $null
    features = $null
    control_center = $false
    lead_radar = $false
    exports = $false
}

try {
    # Test Backend Config Endpoint
    $cfg = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:30521/api/system/config" -TimeoutSec 10 -ErrorAction Stop
    $result.config = ($cfg.Content | ConvertFrom-Json)
    
    # Test Backend Features Endpoint
    $feat = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:30521/api/system/features" -TimeoutSec 10 -ErrorAction Stop
    $result.features = ($feat.Content | ConvertFrom-Json)
    
    # Test Frontend Control Center
    $ui = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:5173/control-center" -TimeoutSec 10 -ErrorAction Stop
    $result.control_center = ($ui.StatusCode -eq 200)
    $result.ui = $result.control_center
    
    # Test Lead Radar Endpoint
    try {
        $leadRadar = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:30521/api/lead_radar/score" -Method POST -ContentType "application/json" -Body '[]' -TimeoutSec 5 -ErrorAction Stop
        $result.lead_radar = ($leadRadar.StatusCode -eq 200)
    } catch {
        $result.lead_radar = $false
    }
    
    # Test Exports Endpoint
    try {
        $exports = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:30521/api/exports/list" -TimeoutSec 5 -ErrorAction Stop
        $result.exports = ($exports.StatusCode -eq 200)
    } catch {
        $result.exports = $false
    }
    
} catch {
    $result.ui = $false
    $result.error = $_.Exception.Message
}

# Ensure exports directory exists
$exportsDir = Join-Path $root "backend\exports"
if (-not (Test-Path $exportsDir)) {
    New-Item -ItemType Directory -Path $exportsDir -Force | Out-Null
}

$result | ConvertTo-Json -Depth 6 | Out-File -Encoding UTF8 $report

Write-Host ("ENTERPRISE-AUDIT report={0} ui={1} control_center={2} lead_radar={3} exports={4}" -f $report, $result.ui, $result.control_center, $result.lead_radar, $result.exports)


