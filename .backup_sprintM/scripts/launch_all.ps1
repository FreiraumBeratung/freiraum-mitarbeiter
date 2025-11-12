$ErrorActionPreference="Stop"

$ROOT = Join-Path $env:USERPROFILE "Desktop\freiraum-mitarbeiter"

$PORT_BACKEND=30521

$PORT_FRONTEND=5173



function Kill-Port([int]$Port){

  $p=(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1).OwningProcess

  if($p){ Stop-Process -Id $p -Force; Start-Sleep -Milliseconds 250 }

}



Kill-Port $PORT_BACKEND

Kill-Port $PORT_FRONTEND



Set-Location $ROOT



if(!(Test-Path ".\\.venv")){ python -m venv .venv }

& .\\.venv\\Scripts\\Activate.ps1

python -m pip install --upgrade pip

if(Test-Path ".\\backend\\requirements.txt"){ pip install -r .\\backend\\requirements.txt } else { pip install fastapi uvicorn sqlalchemy pydantic requests beautifulsoup4 lxml openpyxl python-dateutil }



$env:FREIRAUM_DATA_DIR = Join-Path $ROOT "data"

$env:FM_BASE_URL = "http://localhost:$PORT_BACKEND/api"



# Backend

$backendScript = Join-Path $ROOT "scripts\\run_backend.ps1"

@"

Set-Location "$ROOT"

& .\.venv\Scripts\Activate.ps1

`$env:FREIRAUM_DATA_DIR = "$env:FREIRAUM_DATA_DIR"

`$env:FM_BASE_URL = "$env:FM_BASE_URL"

python backend/run.py

"@ | Out-File -Encoding UTF8 $backendScript

Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$backendScript`""



Start-Sleep -Seconds 3



# Frontend

if(Test-Path "$ROOT\\frontend\\fm-app\\package.json"){

  $frontendScript = Join-Path $ROOT "scripts\\run_frontend.ps1"

  @"

Set-Location "$ROOT\\frontend\\fm-app"

npm install

npx playwright install chromium

npm run dev -- --port $PORT_FRONTEND

"@ | Out-File -Encoding UTF8 $frontendScript

  Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$frontendScript`""

}



# wait readiness

$base = "http://localhost:$PORT_BACKEND/api"

$ready = $false

for($i=0;$i -lt 60;$i++){

  try{ Invoke-RestMethod -Method Get -Uri "$base/ready" -TimeoutSec 2 | Out-Null; $ready=$true; break }catch{ Start-Sleep -Milliseconds 500 }

}

if(-not $ready){ Write-Host "WARN: Backend not ready after grace period." -ForegroundColor Yellow }

Write-Host "Launcher OK." -ForegroundColor Green

