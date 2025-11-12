# Sprint I - Audit Smoke Tests
$base = "http://localhost:30521/api"

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "AUDIT SMOKE TESTS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

# Trigger ein paar Actions
Write-Host "`n1. Trigger Actions..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Method Post -Uri "$base/offers/draft" -ContentType "application/json" -Body (@{ customer = "Test GmbH"; items = @(@{ name = "Service"; qty = 1; unit_price = 100 }) } | ConvertTo-Json) | Out-Null
    Write-Host "  ✓ Offer Draft" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Offer Draft: $_" -ForegroundColor Red
}

try {
    Invoke-RestMethod -Method Post -Uri "$base/lead_hunter/hunt" -ContentType "application/json" -Body (@{ category = "shk"; location = "arnsberg"; count = 2; save_to_db = $false } | ConvertTo-Json) | Out-Null
    Write-Host "  ✓ Lead Hunt" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Lead Hunt: $_" -ForegroundColor Red
}

try {
    Invoke-RestMethod -Method Post -Uri "$base/decision/execute" -ContentType "application/json" -Body (@{ user_id = "denis"; actions = @(@{ key = "reports.show_kpis"; title = "KPIs"; reason = "test"; score = 0.8 }) } | ConvertTo-Json) | Out-Null
    Write-Host "  ✓ Decision Execute" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Decision Execute: $_" -ForegroundColor Red
}

# Liste holen
Write-Host "`n2. Fetch Audit Log..." -ForegroundColor Cyan
try {
    $logs = Invoke-RestMethod -Method Get -Uri "$base/audit/list?limit=20"
    Write-Host "  ✓ Found $($logs.Count) entries" -ForegroundColor Green
    if ($logs.Count -gt 0) {
        Write-Host "  Latest: $($logs[0].action) at $($logs[0].ts)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ✗ Fetch failed: $_" -ForegroundColor Red
}

# PDF oder CSV testen
Write-Host "`n3. Test Export..." -ForegroundColor Cyan
try {
    $pdf = Invoke-WebRequest -Uri "$base/audit/export.pdf?limit=50" -UseBasicParsing
    if ($pdf.Headers."Content-Type" -like "application/pdf*") {
        $outDir = Join-Path $PSScriptRoot ".." "exports"
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        $out = Join-Path $outDir "audit_report.pdf"
        [IO.File]::WriteAllBytes($out, $pdf.Content)
        Write-Host "  ✓ PDF export gespeichert: $out" -ForegroundColor Green
    } else {
        $csv = Invoke-WebRequest -Uri "$base/audit/export.csv?limit=50" -UseBasicParsing
        $outDir = Join-Path $PSScriptRoot ".." "exports"
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        $out = Join-Path $outDir "audit_export.csv"
        [IO.File]::WriteAllText($out, $csv.Content)
        Write-Host "  ✓ CSV export gespeichert: $out (PDF nicht verfügbar)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ Export fehlgeschlagen: $_" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "SMOKE TESTS ABGESCHLOSSEN" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

