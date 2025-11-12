$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
powershell -ExecutionPolicy Bypass -File "$root\scripts\fix_boot.ps1"




