$ErrorActionPreference = "Stop"
$proj = "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"
$back = Join-Path $proj "backend"
Set-Location $back
& ".\.venv\Scripts\pip.exe" install -r ".\requirements.txt" | Out-Null

# PYTHONPATH = Projekt-Root, damit "backend" als Paket importiert werden kann
$env:PYTHONPATH = $proj
& ".\.venv\Scripts\python.exe" -m pytest -q
