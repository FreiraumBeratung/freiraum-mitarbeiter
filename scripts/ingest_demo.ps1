param([int]$Port = 30521)
$ErrorActionPreference = "Stop"
$api = "http://127.0.0.1:$Port"

# 1) Demo-Leads anlegen via CSV Upload
$csvPath = Join-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) "demo_leads.csv"
@"
company,contact_name,contact_email
Muster GmbH,Max Muster,max@muster.de
Elektro Sauerland GmbH,Anna Volt,info@elektro-sauerland.de
GaLaBau HSK,,kontakt@galabau-hsk.de
"@ | Set-Content -Encoding UTF8 $csvPath

$boundary = [System.Guid]::NewGuid().ToString()
$bytes = [System.IO.File]::ReadAllBytes($csvPath)
$bodyLines = @()
$bodyLines += "--$boundary"
$bodyLines += 'Content-Disposition: form-data; name="file"; filename="demo_leads.csv"'
$bodyLines += "Content-Type: text/csv`r`n"
$body = [System.Text.Encoding]::UTF8.GetBytes(($bodyLines -join "`r`n"))
$end = [System.Text.Encoding]::UTF8.GetBytes("`r`n--$boundary--`r`n")
$all = New-Object byte[] ($body.Length + $bytes.Length + $end.Length)
[Array]::Copy($body,0,$all,0,$body.Length)
[Array]::Copy($bytes,0,$all,$body.Length,$bytes.Length)
[Array]::Copy($end,0,$all,$body.Length+$bytes.Length,$end.Length)
Invoke-RestMethod -Uri "$api/api/leads/import/csv" -Method Post -ContentType "multipart/form-data; boundary=$boundary" -Body $all | Out-Host

# 2) Demo-Angebot
Invoke-RestMethod -Uri "$api/api/offers/draft" -Method Post -ContentType "application/json" -Body (@{
  customer="Demo GmbH"; items=@(@{name="Arbeitszeit";qty=5;unit_price=85}, @{name="Material";qty=1;unit_price=129.9})
} | ConvertTo-Json) | Out-Host


