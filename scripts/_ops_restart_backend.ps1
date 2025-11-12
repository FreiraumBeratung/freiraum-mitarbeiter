$ErrorActionPreference="SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$be = Join-Path $root "backend"

Get-Process -Name "python","uvicorn" -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -like "*backend*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Milliseconds 600

Start-Process -WindowStyle Hidden -FilePath "pwsh" -ArgumentList "-NoProfile","-Command","cd `"$be`"; python -m uvicorn app.main:app --host 127.0.0.1 --port 30521"

Start-Sleep -Seconds 4

try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:30521/api/system/status" -TimeoutSec 6
  if ($r.StatusCode -eq 200) { Write-Host "BACKEND_OK" } else { Write-Host "BACKEND_FAIL $($r.StatusCode)" }
} catch { Write-Host "BACKEND_ERR $($_.Exception.Message)" }
