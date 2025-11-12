$backendScripts = Join-Path $PSScriptRoot "..\backend\scripts"
$venvPython = Join-Path $PSScriptRoot "..\backend\.venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Backend venv nicht gefunden. Richte Umgebung ein..." -ForegroundColor Yellow
    Push-Location (Join-Path $PSScriptRoot "..\backend")
    & "python" -m venv .venv
    $venvPython = Join-Path ".venv" "Scripts\python.exe"
    & $venvPython -m pip install --upgrade pip
    if (Test-Path "requirements.txt") {
        & $venvPython -m pip install -r requirements.txt
    }
    Pop-Location
}

Push-Location $backendScripts
& $venvPython "hyper_audit.py"
Pop-Location









