# Run with: right-click -> Run with PowerShell (or paste commands step-by-step)

Set-StrictMode -Version Latest

$ErrorActionPreference = "Stop"



# 1) Go to project

Set-Location "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"



# 2) Optional Git snapshot

git add . 2>$null

git commit -m "chore: end of sprint 5 (stable)" 2>$null

git checkout -b feat/sprint-6-character-core 2>$null



# 3) Python venv

if (!(Test-Path ".\.venv")) { python -m venv .venv }

.\.venv\Scripts\Activate.ps1



# 4) Dependencies

python -V

pip install --upgrade pip

pip install fastapi uvicorn sqlalchemy pydantic



# 5) Data dir

$env:FREIRAUM_DATA_DIR = "$PWD\data"

if (!(Test-Path $env:FREIRAUM_DATA_DIR)) { New-Item -ItemType Directory -Path $env:FREIRAUM_DATA_DIR | Out-Null }



# 6) Start server

# Module path: backend.app:app (entry point is backend/app.py)

uvicorn backend.app:app --host 0.0.0.0 --port 30521 --reload

