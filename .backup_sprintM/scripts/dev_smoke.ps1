param([int]$Port = 30521)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path $root -Parent
$api = "http://127.0.0.1:$Port/api/system/status"

# Warte kurz bis Backend hochfährt
Start-Sleep -Seconds 2

try {
  $resp = Invoke-RestMethod -Method GET -Uri $api -TimeoutSec 5
  if ($resp.ok -ne $true) { throw "Status ok != true" }
  Write-Host "✅ API OK: $api" -ForegroundColor Green
} catch {
  Write-Host "❌ API FEHLER: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Frontend öffnen (Vite)
Start-Process "http://127.0.0.1:5173"
