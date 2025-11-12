$ErrorActionPreference = "Continue"

pwsh -NoProfile -File .\scripts\_voice_local_smoke.ps1
Write-Host "Open http://localhost:5173/voice-diagnostics and trigger: Klangtest, Shortcut SHK Sundern, Shortcut Erinnerung Arnsberg 11."




