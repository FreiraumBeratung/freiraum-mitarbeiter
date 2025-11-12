$ErrorActionPreference = "SilentlyContinue"
$api="http://127.0.0.1:30521"
Invoke-RestMethod "$api/api/system/status" -Method GET
Invoke-RestMethod "$api/api/mail/check" -Method GET
Invoke-RestMethod "$api/api/reports/kpis" -Method GET













