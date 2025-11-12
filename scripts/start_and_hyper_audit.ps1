param()
$ErrorActionPreference = "Stop"
$ROOT = (Resolve-Path "$PSScriptRoot\..").Path
pwsh -File (Join-Path $ROOT "scripts\launch_all.ps1")
Start-Sleep -Seconds 5
pwsh -File (Join-Path $ROOT "scripts\hyper_audit.ps1")











