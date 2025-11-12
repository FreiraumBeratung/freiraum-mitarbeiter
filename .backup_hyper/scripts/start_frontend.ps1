$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path $here -Parent
$fe = Join-Path $root "frontend\fm-app"
Start-Process pwsh -ArgumentList "-NoExit","-Command","Set-Location `"$fe`"; npm run dev"
Write-Host "Frontend gestartet." -ForegroundColor Green

