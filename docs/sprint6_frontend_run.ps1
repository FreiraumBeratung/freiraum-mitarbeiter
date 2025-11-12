# Sprint 6 Frontend - Setup & Run
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Go to frontend
Set-Location "$env:USERPROFILE\Desktop\freiraum-mitarbeiter\frontend\fm-app"

Write-Host "`n=== SPRINT 6 - FRONTEND SETUP ===" -ForegroundColor Cyan

# Install dependencies
Write-Host "`n[1] Installiere Dependencies..." -ForegroundColor Yellow
if (!(Test-Path "node_modules")) {
    npm install
} else {
    Write-Host "  node_modules bereits vorhanden, überspringe npm install" -ForegroundColor Gray
}

# Optional: framer-motion (falls benötigt für Animationen)
# npm install framer-motion

Write-Host "`n[2] Starte Dev-Server..." -ForegroundColor Yellow
Write-Host "  App läuft unter: http://localhost:5173" -ForegroundColor Green
Write-Host "  Stelle sicher, dass Backend auf Port 30521 läuft!" -ForegroundColor Yellow

# Start dev server
npm run dev



















