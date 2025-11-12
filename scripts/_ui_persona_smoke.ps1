$ErrorActionPreference = "Continue"

function TryGetJson {
    param(
        [string]$Url
    )
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 8
        if ($resp.StatusCode -ne 200) { return $null }
        return ($resp.Content | ConvertFrom-Json)
    } catch {
        return $null
    }
}

$root = Split-Path -Parent $PSScriptRoot
$reportDir = Join-Path $root "backend\\exports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$jsonPath = Join-Path $reportDir "ui_persona_smoke.json"
$mdPath = Join-Path $reportDir "ui_persona_smoke.md"

$urlOk = $false
try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:5173" -TimeoutSec 8
    $urlOk = ($resp.StatusCode -eq 200)
} catch {
    $urlOk = $false
}

$config = TryGetJson "http://127.0.0.1:30521/api/system/config"
$uiSmoke = TryGetJson "http://127.0.0.1:30521/ui/smoke"
$realMode = $null
if ($config -and $config.PSObject.Properties.Name -contains "real_mode") {
    $realMode = $config.real_mode
}

$payload = [ordered]@{
    timestamp = (Get-Date).ToString("s")
    url_ok    = $urlOk
    backend_config = $config
    real_mode = $realMode
    ui_smoke  = $uiSmoke
}

[System.IO.File]::WriteAllText($jsonPath, ($payload | ConvertTo-Json -Depth 6))

$mdLines = @(
    "# UI Persona Smoke",
    "",
    "- Zeitpunkt: $($payload.timestamp)",
    "- UI erreichbar: $urlOk",
    "- REAL_MODE Backend: $realMode",
    "- /ui/smoke: $([string]($uiSmoke?.ok))"
)
[System.IO.File]::WriteAllLines($mdPath, $mdLines)

Write-Host ("UI-PERSONA-SMOKE: url_ok={0} real_mode={1}" -f $urlOk, $realMode)




