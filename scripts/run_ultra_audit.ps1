$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
powershell -ExecutionPolicy Bypass -File "$root\scripts\audit_ultra.ps1"















