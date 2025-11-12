param([int]$Port = 30521, [int]$LeadId = 1)
$ErrorActionPreference = "Stop"
$api = "http://127.0.0.1:$Port"
Invoke-RestMethod -Uri "$api/api/license/set?tier=PRO" -Method Post | Out-Null
$seq = Invoke-RestMethod -Uri "$api/api/sequences/create_default" -Method Post -ContentType "application/json" -Body (@{name="Standard Outreach"} | ConvertTo-Json)
Write-Host "Sequence ID: $($seq.id)"
$run = Invoke-RestMethod -Uri "$api/api/sequences/run" -Method Post -ContentType "application/json" -Body (@{sequence_id=$seq.id; lead_id=$LeadId} | ConvertTo-Json)
$run
























