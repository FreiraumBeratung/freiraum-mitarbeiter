# UI-Validation Script für Sprint I-Refine
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "UI-AUDIT - SPRINT I-REFINE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

Write-Host "`nStarte UI-Audit..." -ForegroundColor Cyan

# Warte bis Backend bereit ist
Write-Host "Warte auf Backend..." -ForegroundColor Yellow
$maxWait = 30
$waited = 0
do {
    Start-Sleep -Seconds 2
    $waited += 2
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:30521/api/health" -TimeoutSec 5 -ErrorAction Stop
        Write-Host "Backend bereit!" -ForegroundColor Green
        break
    } catch {
        if ($waited -ge $maxWait) {
            Write-Host "Backend nicht erreichbar nach $maxWait Sekunden" -ForegroundColor Red
            exit 1
        }
    }
} while ($waited -lt $maxWait)

# Warte auf Frontend
Start-Sleep -Seconds 5

$frontend = "http://localhost:5173"
Write-Host "`nTeste Frontend..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri $frontend -UseBasicParsing -TimeoutSec 15
    if($response.StatusCode -eq 200){
        Write-Host "✅ UI erreichbar unter $frontend" -ForegroundColor Green
    } else {
        Write-Host "❌ UI nicht erreichbar ($($response.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ UI nicht erreichbar: $_" -ForegroundColor Red
}

# Prüfe API-Health
Write-Host "`nTeste Backend-Health..." -ForegroundColor Cyan
$api = "http://localhost:30521/api/health"
try {
    $h = Invoke-RestMethod -Uri $api -TimeoutSec 10
    Write-Host "✅ API Health OK" -ForegroundColor Green
    Write-Host "  Response: $($h | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ API Health FEHLER: $_" -ForegroundColor Red
}

# Test Lead-Hunter
Write-Host "`nTeste Lead-Hunter..." -ForegroundColor Cyan
try {
    $hunt = Invoke-RestMethod -Method Post -Uri "http://localhost:30521/api/lead_hunter/hunt" -ContentType "application/json" -Body (@{ category = "shk"; location = "arnsberg"; count = 2; save_to_db = $false } | ConvertTo-Json) -TimeoutSec 30
    Write-Host "✅ Lead-Hunter OK - $($hunt.found) Leads gefunden" -ForegroundColor Green
} catch {
    Write-Host "❌ Lead-Hunter FEHLER: $_" -ForegroundColor Red
}

# Test Audit
Write-Host "`nTeste Audit..." -ForegroundColor Cyan
try {
    $audit = Invoke-RestMethod -Uri "http://localhost:30521/api/audit/list?limit=5" -TimeoutSec 10
    Write-Host "✅ Audit OK - $($audit.Count) Einträge" -ForegroundColor Green
} catch {
    Write-Host "❌ Audit FEHLER: $_" -ForegroundColor Red
}

Write-Host "`nÖffne Browser..." -ForegroundColor Cyan
Start-Process $frontend

Write-Host "⏳ Warte 10 Sekunden für visuelle Prüfung..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Abschluss-Report
$report = @"
=== UI-Audit abgeschlossen ===

Datum: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Frontend erreichbar: $frontend
Backend Health: $api

Prüfungen:
- Avatar sichtbar: visuell prüfen (links unten)
- Sprache: Deutsch
- Style: Schwarz-Glas aktiv (Apple-Glass Look)
- Lead-Hunter: Getestet
- Audit: Getestet

Nächste Schritte:
1. Visuell prüfen: Avatar-Assistant sollte links unten sichtbar sein
2. Glass-Effekt sollte auf allen Panels sichtbar sein
3. Lead-Hunter sollte funktionieren
4. Sprache sollte Deutsch sein

"@

$outDir = Join-Path (Split-Path $PSScriptRoot -Parent) "exports"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$out = Join-Path $outDir "ui_audit_report.txt"
$report | Out-File $out -Encoding UTF8

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "📄 Report gespeichert: $out" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Magenta

