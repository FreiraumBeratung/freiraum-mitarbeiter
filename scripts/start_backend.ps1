$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path $here -Parent
& "$root\backend\run_backend_now.ps1" -Port 30521

