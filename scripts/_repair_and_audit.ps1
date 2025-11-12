$root = Split-Path -Parent $PSScriptRoot

Write-Host "== Kill busy ports =="
& "$PSScriptRoot\_kill_ports.ps1" | Out-Null

$py = Join-Path "$root\backend\.venv" "Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "Python venv not found: $py"
    exit 1
}

Write-Host "== Start backend =="
Start-Process -WindowStyle Hidden pwsh -ArgumentList "-NoProfile","-Command","cd `"$root\backend`"; python -m uvicorn app.main:app --host 127.0.0.1 --port 30521" | Out-Null
Start-Sleep -Seconds 3

Write-Host "== Start frontend =="
Start-Process -WindowStyle Hidden pwsh -ArgumentList "-NoProfile","-Command","cd `"$root\frontend`"; npx vite --host --strictPort --port 5173" | Out-Null
Start-Sleep -Seconds 3

function GET($u) {
    try {
        (Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 5).StatusCode
    } catch {
        0
    }
}

$st = GET "http://127.0.0.1:30521/api/system/status"
$ui = GET "http://127.0.0.1:30521/ui/smoke"
$ok = ($st -eq 200 -and $ui -eq 200)

Push-Location "$root\frontend"
$pw = (npx playwright test --reporter=list)
Pop-Location

$exp = Join-Path "$root\backend\exports" "repair_report.json"
$reportDir = Split-Path $exp
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
}
$data = @{
    started       = (Get-Date).ToString("s")
    backend_status = $st
    ui_smoke       = $ui
    e2e_output     = $pw
    ok             = $ok -and ($pw -like "*passed*")
}
[System.IO.File]::WriteAllText($exp, ($data | ConvertTo-Json -Depth 5))

Write-Host ("SUMMARY: backend={0} ui_smoke={1} e2e_avatar={2}" -f $st, $ui, ($pw -like "*passed*"))
Write-Host ("REPORT: {0}" -f $exp)





