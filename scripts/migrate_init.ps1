$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path $here -Parent
Set-Location "$root\backend"
$py = ".\.venv\Scripts\python.exe"
if (!(Test-Path $py)) { throw "venv python not found: $py" }

if (!(Test-Path ".\alembic")) { & $py -m alembic init alembic }

# sqlalchemy.url in alembic.ini setzen
$content = Get-Content ".\alembic.ini" -Raw
$content = $content -replace "sqlalchemy.url\s*=\s*.*", "sqlalchemy.url = sqlite:///../data/freiraum.db"
Set-Content ".\alembic.ini" -Value $content -Encoding UTF8

# env.py (bereits von Fix Pack geschrieben) wird beibehalten

# erste Revision + Upgrade
& $py -m alembic revision --autogenerate -m "init schema"
& $py -m alembic upgrade head
Write-Host "Alembic init & upgrade done." -ForegroundColor Green
