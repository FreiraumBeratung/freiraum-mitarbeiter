$ErrorActionPreference = "Stop"
$root = "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"
# 1) Frontend build
Set-Location "$root\frontend\fm-app"
npm ci
npm run build
# 2) in electron/app kopieren
Remove-Item "$root\electron\app" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$root\frontend\fm-app\dist" "$root\electron\app" -Recurse
# 3) electron-builder
Set-Location "$root\electron"
if (!(Test-Path ".\node_modules")) { npm ci }
$env:FM_ELECTRON_MODE = "prod"
npm run build
Write-Host "Installer erstellt unter: $root\installers" -ForegroundColor Green













