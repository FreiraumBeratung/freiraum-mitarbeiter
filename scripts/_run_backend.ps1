param([string]$PythonExe = "python")

Push-Location "$PSScriptRoot\..\backend"

if (-not (Test-Path ".venv")) {
    & $PythonExe -m venv .venv
}

$venvPython = Join-Path ".venv" "Scripts\python.exe"

& $venvPython -m pip install --upgrade pip
if (Test-Path "requirements.txt") {
    & $venvPython -m pip install -r requirements.txt
}

& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 30521 --reload

Pop-Location
