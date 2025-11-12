$ErrorActionPreference = "Continue"
function ExitWith($code){
    if ($Host.Name -eq 'ConsoleHost') { exit $code } else { [Environment]::Exit($code) }
}

$root = Split-Path -Parent $PSScriptRoot
$fe   = Join-Path $root "frontend\fm-app"
$reportPath = Join-Path $root "backend\exports\frontend_qa_summary.json"

if (-not (Test-Path $fe)) {
    Write-Error "Frontend path not found: $fe"
    ExitWith 1
}

Write-Host "== Env info =="
try { node -v; npm -v } catch { Write-Warning "Node/NPM not on PATH?" }

Write-Host "== Frontend deps =="
Push-Location $fe
npm ci --silent 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "npm ci failed, fallback to npm i"
    npm i --silent
}
npx playwright install --with-deps
Pop-Location

Write-Host "== Run Vitest =="
Push-Location $fe
npm run test
$vitestOk = $LASTEXITCODE -eq 0
Pop-Location

Write-Host "== Run Playwright =="
Push-Location $fe
npm run test:ui
$pwOk = $LASTEXITCODE -eq 0
Pop-Location

$summary = [ordered]@{
    vitest     = $vitestOk
    playwright = $pwOk
    time       = (Get-Date).ToString("s")
    base_url   = "http://localhost:5173"
}
New-Item -ItemType Directory -Force -Path (Split-Path $reportPath) | Out-Null
[System.IO.File]::WriteAllText($reportPath, ($summary | ConvertTo-Json))
Write-Host ("SUMMARY: vitest={0} playwright={1} report={2}" -f $vitestOk, $pwOk, $reportPath)

if (-not $vitestOk -or -not $pwOk) {
    ExitWith 2
} else {
    ExitWith 0
}
