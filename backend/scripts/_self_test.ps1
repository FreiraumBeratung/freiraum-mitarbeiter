$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Python venv missing"
    exit 1
}

& $venvPython (Join-Path $root "scripts\seed_demo.py")
& $venvPython (Join-Path $root "scripts\self_test_all.py")
