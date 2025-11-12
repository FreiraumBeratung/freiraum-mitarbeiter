$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path "$root\backend\.venv" "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Python venv missing"
    exit 1
}

& $venvPython "$root\backend\scripts\seed_demo.py"
& $venvPython "$root\backend\scripts\self_test_all.py"
$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path "$root\backend\.venv" "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Python venv missing"
    exit 1
}

& $venvPython "$root\backend\scripts\seed_demo.py"
& $venvPython "$root\backend\scripts\self_test_all.py"

