$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $root "backend\.venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Error "Python venv nicht gefunden unter backend\.venv"
    exit 1
}

Write-Host "Running backend pytest..."
& $venvPython -m pytest "$root\backend\tests" -q
if ($LASTEXITCODE -ne 0) {
    Write-Error "Backend tests fehlgeschlagen."
    exit 1
}

Write-Host "Running frontend vitest..."
Push-Location "$root\frontend\fm-app"
npm run test --silent
$vitestExit = $LASTEXITCODE
Pop-Location
if ($vitestExit -ne 0) {
    Write-Error "Frontend Vitest fehlgeschlagen."
    exit 1
}

Write-Host "Running Playwright..."
Push-Location "$root\frontend\fm-app"
npx playwright test --reporter=list
$pwExit = $LASTEXITCODE
Pop-Location
if ($pwExit -ne 0) {
    Write-Error "Playwright Tests fehlgeschlagen."
    exit 1
}

Write-Host "QA tests finished."





