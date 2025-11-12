$ErrorActionPreference = "Continue"

function TryGetJson($u) {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 6
        if ($resp.StatusCode -ne 200) { return $null }
        return ($resp.Content | ConvertFrom-Json)
    } catch {
        return $null
    }
}

$api = TryGetJson "http://127.0.0.1:30521/api/system/status"
$tts = TryGetJson "http://127.0.0.1:30521/api/tts/health"
$stt = TryGetJson "http://127.0.0.1:30521/api/stt/health"

$apiOk = [bool]($api -and $api.ok -eq $true)
$ttsProv = if ($tts) { $tts.provider } else { "unknown" }
$ttsOk = [bool]($tts -and $tts.ok -eq $true)
$sttProv = if ($stt) { $stt.provider } else { "unknown" }
$sttOk = [bool]($stt -and $stt.ok -eq $true)

Write-Host ("LOCAL-VOICE-SMOKE: api_ok={0} tts={1}:{2} stt={3}:{4}" -f $apiOk, $ttsProv, $ttsOk, $sttProv, $sttOk)



