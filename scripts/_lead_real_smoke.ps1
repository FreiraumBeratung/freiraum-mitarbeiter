$ErrorActionPreference = "Continue"

function PostJson {
    param (
        [string]$Url,
        [hashtable]$Body
    )
    try {
        $payload = $Body | ConvertTo-Json -Depth 6
        $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Url -Body $payload -ContentType "application/json" -TimeoutSec 30
        return @{
            ok      = ($response.StatusCode -eq 200)
            status  = $response.StatusCode
            content = $response.Content
        }
    } catch {
        return @{
            ok      = $false
            status  = 0
            content = "$($_.Exception.Message)"
        }
    }
}

try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:30521/ui/smoke" -TimeoutSec 5
    Write-Host ("UI-SMOKE: status={0}" -f $health.StatusCode)
} catch {
    Write-Host "UI-SMOKE: failed ($_)" 
}

$run = PostJson "http://127.0.0.1:30521/lead_hunter/run_real" @{ category = "shk"; location = "Sundern" }
Write-Host ("RUN-REAL: ok={0} status={1}" -f $run.ok, $run.status)
if ($run.content) {
    Write-Host $run.content
}




