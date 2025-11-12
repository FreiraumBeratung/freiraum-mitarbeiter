$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path $here -Parent
cd "$root\backend"
$py = ".\.venv\Scripts\python.exe"
& $py -m alembic upgrade head
Write-Host "Alembic upgrade head done." -ForegroundColor Green
























