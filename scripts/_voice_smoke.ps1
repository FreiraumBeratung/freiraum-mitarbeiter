$ErrorActionPreference = "Continue"

function TryGetJson($url) {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 6
        if ($resp.StatusCode -ne 200) { return $null }
        return ($resp.Content | ConvertFrom-Json)
    } catch {
        return $null
    }
}

$api = TryGetJson "http://127.0.0.1:30521/api/system/status"
$tts = TryGetJson "http://127.0.0.1:30521/api/tts/health"

$apiOk = [bool]($api -and $api.ok -eq $true)
$ttsProvider = if ($tts) { $tts.provider } else { "unknown" }
$ttsOk = [bool]($tts -and $tts.ok -eq $true)

Write-Host ("VOICE-SMOKE: api_ok={0} tts_provider={1} tts_ok={2}" -f $apiOk, $ttsProvider, $ttsOk)

if ($ttsProvider -eq "azure" -and $ttsOk) {
    try {
        $body = @{ text = "Hallo Denis. Azure Neural T T S ist aktiv." } | ConvertTo-Json
        $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://127.0.0.1:30521/api/tts/speak" -Body $body -ContentType "application/json" -TimeoutSec 10
        Write-Host ("TTS-PROBE: status={0} bytes={1}" -f $r.StatusCode, ($r.RawContentStream.Length))
    } catch {
        Write-Host "TTS-PROBE: failed (check AZURE_TTS_KEY/REGION in backend/.env)"
    }
}
