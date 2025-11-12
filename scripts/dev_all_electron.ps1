param([int]$PortBackend = 30521, [int]$PortVite = 5173)
$ErrorActionPreference = "Stop"

# 1) Backend starten (falls nicht läuft)
$backend = Get-NetTCPConnection -State Listen -LocalPort $PortBackend -ErrorAction SilentlyContinue
if (-not $backend) {
  Start-Process pwsh -ArgumentList "-NoExit","-Command","Set-Location `"$env:USERPROFILE\Desktop\freiraum-mitarbeiter\backend`"; .\run_backend_now.ps1 -Port $PortBackend"
  Start-Sleep -Seconds 2
}

# 2) Frontend (Vite) starten (falls nicht läuft)
$vite = Get-NetTCPConnection -State Listen -LocalPort $PortVite -ErrorAction SilentlyContinue
if (-not $vite) {
  Start-Process pwsh -ArgumentList "-NoExit","-Command","Set-Location `"$env:USERPROFILE\Desktop\freiraum-mitarbeiter\frontend\fm-app`"; npm run dev"
}

# 3) Auf Erreichbarkeit von 5173 warten (max. 60s)
$ok = $false
for ($i=0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$PortVite" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $ok = $true; break }
  } catch { }
  Start-Sleep -Milliseconds 800
}
if (-not $ok) { Write-Warning "Vite nicht erreichbar auf Port $PortVite – Electron trotzdem öffnen (Fenster könnte leer sein)" }

# 4) Electron starten
Start-Process pwsh -ArgumentList "-NoExit","-Command","Set-Location `"$env:USERPROFILE\Desktop\freiraum-mitarbeiter\electron`"; if (!(Test-Path .\node_modules)) { npm i }; npm run start"
























