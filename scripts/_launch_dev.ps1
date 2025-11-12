$backend = Join-Path $PSScriptRoot "_run_backend.ps1"
$frontend = Join-Path $PSScriptRoot "_run_frontend.ps1"

Start-Process pwsh -ArgumentList "-NoExit","-File `"$backend`""
Start-Process pwsh -ArgumentList "-NoExit","-File `"$frontend`""

Write-Host "Backend -> http://localhost:30521"
Write-Host "Frontend -> http://localhost:5173"











