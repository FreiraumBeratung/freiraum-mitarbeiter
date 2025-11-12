# Deep-Voice & Context-Memory Audit
$base = "http://localhost:30521/api/voice"
$errors = @()
$success = @()

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "SPRINT J – DEEP VOICE AUDIT" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Datum: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

# 1. Context Memory Test
Write-Host "1. Context Memory..." -ForegroundColor Cyan
try {
    $ctx = Invoke-RestMethod -Uri "$base/context" -TimeoutSec 10
    if ($ctx.ok) {
        $script:success += "Context Memory erreichbar"
        Write-Host "  [OK] Context Memory erreichbar ($($ctx.entries.Count) Einträge)" -ForegroundColor Green
        if ($ctx.entries.Count -gt 0) {
            Write-Host "    Letzter Eintrag: $($ctx.entries[-1].msg)" -ForegroundColor Gray
        }
    }
} catch {
    $script:errors += "Context Memory: $_"
    Write-Host "  [FAIL] Context Memory nicht erreichbar: $_" -ForegroundColor Red
}

# 2. Context Update Test
Write-Host "`n2. Context Update..." -ForegroundColor Cyan
try {
    $body = @{
        user = "denis"
        message = "Test-Nachricht vom Audit $(Get-Date -Format 'HH:mm:ss')"
        mood = "neutral"
    }
    $params = @{
        Method = "POST"
        Uri = "$base/context/update"
        Body = $body
        ContentType = "application/x-www-form-urlencoded"
        TimeoutSec = 10
    }
    $result = Invoke-RestMethod @params
    if ($result.ok) {
        $script:success += "Context Update"
        Write-Host "  [OK] Context Update erfolgreich (Memory-Länge: $($result.memory_len))" -ForegroundColor Green
    }
} catch {
    $script:errors += "Context Update: $_"
    Write-Host "  [FAIL] Context Update fehlgeschlagen: $_" -ForegroundColor Red
}

# 3. DeepSTT Test (Dummy)
Write-Host "`n3. DeepSTT (Dummy)..." -ForegroundColor Cyan
Write-Host "  [INFO] DeepSTT erfordert Audiodatei-Upload – wird im Browser getestet" -ForegroundColor Yellow

# 4. Frontend Connectivity
Write-Host "`n4. Frontend Connectivity..." -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) {
        $script:success += "Frontend erreichbar"
        Write-Host "  [OK] Frontend erreichbar (Status: $($r.StatusCode))" -ForegroundColor Green
    }
} catch {
    $script:errors += "Frontend nicht erreichbar: $_"
    Write-Host "  [FAIL] Frontend nicht erreichbar: $_" -ForegroundColor Red
}

# Summary
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "AUDIT SUMMARY" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Success: $($success.Count)" -ForegroundColor Green
Write-Host "Errors: $($errors.Count)" -ForegroundColor $(if($errors.Count -gt 0){"Red"}else{"Green"})

if ($errors.Count -gt 0) {
    Write-Host "`nERRORS:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "NÄCHSTE SCHRITTE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "1. Öffne Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "2. Suche 'VoiceOverlay' rechts unten" -ForegroundColor Cyan
Write-Host "3. Klicke auf 'Start' und spreche: 'Hallo Freiraum'" -ForegroundColor Cyan
Write-Host "4. Prüfe ob Context-Memory aktualisiert wurde" -ForegroundColor Cyan

if ($errors.Count -eq 0) {
    Write-Host "`n[OK] Alle Backend-Tests erfolgreich!" -ForegroundColor Green
    return 0
} else {
    return 1
}
















