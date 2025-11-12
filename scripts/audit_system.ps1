$ErrorActionPreference = 'Continue'
$Root = "$env:USERPROFILE\Desktop\freiraum-mitarbeiter"
$BACK  = Join-Path $Root "backend"
$FRONT = Join-Path $Root "frontend\fm-app"
$OUT   = Join-Path $Root "audit"
$REPORT = Join-Path $OUT "system_audit_report.txt"

New-Item -ItemType Directory -Force -Path $OUT | Out-Null

# Report Header
$reportContent = @"
====================================================================
  FREIRAUM MITARBEITER – SYSTEM-AUDIT
  Datum: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
====================================================================

Ziel:
  Vollständige Funktions- und Strukturprüfung (Backend + Frontend)

"@

Add-Content -Path $REPORT -Value $reportContent -Encoding UTF8

# BACKEND AUDIT
Add-Content -Path $REPORT -Value "`n--- BACKEND (FastAPI) ---`n"

# 3.1 Struktur
Add-Content -Path $REPORT -Value "[Ordnerstruktur]`n"
Get-ChildItem -Recurse $BACK -File | ForEach-Object {
    $relPath = $_.FullName.Replace($Root, "").Replace("\", "/")
    Add-Content -Path $REPORT -Value $relPath
}

# 3.2 Python-Imports prüfen
Add-Content -Path $REPORT -Value "`n[Python Importprüfung]`n"
try {
    $pyFiles = Get-ChildItem -Recurse $BACK -Filter "*.py" -File | Select-Object -ExpandProperty FullName
    if ($pyFiles.Count -gt 0) {
        $compileResult = python -m py_compile $pyFiles 2>&1
        Add-Content -Path $REPORT -Value ($compileResult | Out-String)
    } else {
        Add-Content -Path $REPORT -Value "Keine Python-Dateien gefunden."
    }
} catch {
    Add-Content -Path $REPORT -Value "Fehler bei Compile-Check: $_"
}

# 3.3 Alembic-Migration
Add-Content -Path $REPORT -Value "`n[Alembic Status]`n"
$migrateScript = Join-Path $Root "scripts\migrate_init.ps1"
if (Test-Path $migrateScript) {
    try {
        $alembicResult = & $migrateScript 2>&1
        Add-Content -Path $REPORT -Value ($alembicResult | Out-String)
    } catch {
        Add-Content -Path $REPORT -Value "Alembic-Check Fehler: $_"
    }
} else {
    Add-Content -Path $REPORT -Value "migrate_init.ps1 nicht gefunden."
}

# 3.4 Tests
Add-Content -Path $REPORT -Value "`n[Pytest Ergebnisse]`n"
try {
    $testResult = pytest $BACK --maxfail=3 --disable-warnings -q 2>&1
    Add-Content -Path $REPORT -Value ($testResult | Out-String)
} catch {
    Add-Content -Path $REPORT -Value "Pytest-Fehler: $_"
}

# 3.5 API-Smoke-Tests
Add-Content -Path $REPORT -Value "`n[API-Smoke-Tests]`n"
$base = "http://127.0.0.1:30521/api"
$endpoints = @("/system/status", "/mail/check", "/offers/draft", "/reports/kpis")
foreach ($ep in $endpoints) {
    try {
        $res = Invoke-RestMethod -Uri ($base + $ep) -Method GET -TimeoutSec 5 -ErrorAction Stop
        $json = $res | ConvertTo-Json -Compress
        Add-Content -Path $REPORT -Value "$ep -> OK ($json)"
    } catch {
        Add-Content -Path $REPORT -Value "$ep -> FEHLER: $($_.Exception.Message)"
    }
}

# FRONTEND AUDIT
Add-Content -Path $REPORT -Value "`n--- FRONTEND (React + Vite + Tailwind) ---`n"

# 4.1 npm deps
Add-Content -Path $REPORT -Value "[Package-Audit]`n"
Push-Location $FRONT
try {
    $auditResult = npm audit --json 2>&1
    Add-Content -Path $REPORT -Value ($auditResult | Out-String)
} catch {
    Add-Content -Path $REPORT -Value "npm audit Fehler: $_"
}
Pop-Location

# 4.2 Build-Test
Add-Content -Path $REPORT -Value "`n[Build-Test]`n"
Push-Location $FRONT
try {
    $buildResult = npm run build 2>&1
    Add-Content -Path $REPORT -Value ($buildResult | Out-String)
} catch {
    Add-Content -Path $REPORT -Value "Build-Fehler: $_"
}
Pop-Location

# 4.3 Tailwind/Lint Check
Add-Content -Path $REPORT -Value "`n[Tailwind/Lint Check]`n"
$tw = Join-Path $FRONT "tailwind.config.js"
if (Test-Path $tw) {
    $themeLines = Get-Content $tw | Select-String -Pattern "theme" -Context 0,2
    Add-Content -Path $REPORT -Value ($themeLines | Out-String)
} else {
    Add-Content -Path $REPORT -Value "tailwind.config.js fehlt."
}

# 4.4 Datei-Zählung
Add-Content -Path $REPORT -Value "`n[Dateistatistik]`n"
$js = (Get-ChildItem -Recurse $FRONT -Filter "*.jsx" -File).Count
$py = (Get-ChildItem -Recurse $BACK -Filter "*.py" -File).Count
Add-Content -Path $REPORT -Value "React-Files: $js"
Add-Content -Path $REPORT -Value "Python-Files: $py"

# ZUSAMMENFASSUNG
Add-Content -Path $REPORT -Value "`n--- ZUSAMMENFASSUNG ---`n"
try {
    $connection = Test-NetConnection -ComputerName 127.0.0.1 -Port 30521 -InformationLevel Quiet -WarningAction SilentlyContinue
    $reachable = if ($connection) { "erreichbar" } else { "nicht erreichbar" }
} catch {
    $reachable = "nicht erreichbar"
}
Add-Content -Path $REPORT -Value "• Backend auf Port 30521: $reachable"

$sizeBytes = (Get-ChildItem -Recurse $FRONT -File | Measure-Object -Property Length -Sum).Sum
$sizeMb = [int]($sizeBytes / 1MB)
Add-Content -Path $REPORT -Value "• Frontend-Ordnergröße: $sizeMb MB"
Add-Content -Path $REPORT -Value "• Report abgeschlossen um $(Get-Date -Format 'HH:mm:ss')."

Write-Host "System-Audit abgeschlossen. Bericht unter $REPORT" -ForegroundColor Green

