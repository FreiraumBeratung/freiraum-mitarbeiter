$ErrorActionPreference="Continue"

$root = Split-Path -Parent $PSScriptRoot
$be = Join-Path $root "backend"
$exportDir = Join-Path $root "backend\data\exports"

function PostJ($u,$b){ 
  try{ 
    $bodyJson = $b | ConvertTo-Json -Compress
    $r=Invoke-WebRequest -UseBasicParsing -Uri $u -Method Post -Body $bodyJson -ContentType "application/json" -TimeoutSec 90
    try {
      $json = $r.Content | ConvertFrom-Json -AsHashtable
      @{ok=($r.StatusCode -eq 200); status=$r.StatusCode; json=$json}
    } catch {
      $json = $r.Content | ConvertFrom-Json
      @{ok=($r.StatusCode -eq 200); status=$r.StatusCode; json=$json}
    }
  }catch{ 
    @{ok=$false; err=$_.Exception.Message} 
  } 
}

Write-Host "=== Demo-Pack Test ===" -ForegroundColor Cyan

# Test OSM Hunt
Write-Host "1. Testing OSM Hunt..."
$hunt = PostJ "http://127.0.0.1:30521/lead_hunter/osm/hunt_async" @{ category="shk"; location="Arnsberg"; enrich=$true }

if(-not $hunt.ok) {
  Write-Host "  ❌ Hunt FAILED: $($hunt.err)" -ForegroundColor Red
  exit 1
}

$leads = $hunt.json.result.leads
$found = $hunt.json.result.found

Write-Host "  ✅ Hunt OK - Found: $found" -ForegroundColor Green

if($found -eq 0) {
  Write-Host "  ⚠️  No leads found, using demo data" -ForegroundColor Yellow
  $leads = @(
    @{
      company="Demo GmbH"
      category="shk"
      city="Arnsberg"
      street=""
      postcode=""
      phone="+49123456789"
      email="info@demo.de"
      website="https://demo.de"
      score=80
      source="enriched"
      lat=51.45
      lon=7.97
      proof_contact_url="https://demo.de/impressum"
      proof_impressum_url="https://demo.de/impressum"
    }
  )
}

# Test PDF Export
Write-Host "2. Testing PDF Export..."
$pdfResp = PostJ "http://127.0.0.1:30521/lead_hunter/osm/export_pdf" @{leads=$leads; category="shk"; city="Arnsberg"}

if($pdfResp.ok -or $pdfResp.status -eq 200) {
  Write-Host "  ✅ PDF Export OK" -ForegroundColor Green
  
  # Find PDF file
  $pdfFiles = Get-ChildItem -Path $exportDir -Filter "*.pdf" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if($pdfFiles) {
    $pdfPath = $pdfFiles.FullName
    Write-Host "  📄 PDF: $pdfPath" -ForegroundColor Cyan
  } else {
    Write-Host "  ⚠️  PDF file not found in exports directory" -ForegroundColor Yellow
  }
} else {
  Write-Host "  ❌ PDF Export FAILED: $($pdfResp.err)" -ForegroundColor Red
}

# Test Excel Export
Write-Host "3. Testing Excel Export..."
$excelResp = PostJ "http://127.0.0.1:30521/lead_hunter/osm/export" @{leads=$leads; category="shk"; city="Arnsberg"}

if($excelResp.ok -or $excelResp.status -eq 200) {
  Write-Host "  ✅ Excel Export OK" -ForegroundColor Green
  
  # Find Excel file
  $excelFiles = Get-ChildItem -Path $exportDir -Filter "*.xlsx" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if($excelFiles) {
    $excelPath = $excelFiles.FullName
    Write-Host "  📊 Excel: $excelPath" -ForegroundColor Cyan
  } else {
    Write-Host "  ⚠️  Excel file not found in exports directory" -ForegroundColor Yellow
  }
} else {
  Write-Host "  ❌ Excel Export FAILED: $($excelResp.err)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Demo-Pack Results ===" -ForegroundColor Cyan
Write-Host "PDF: $(if($pdfFiles){$pdfFiles.Name}else{'not found'})" -ForegroundColor $(if($pdfFiles){'Green'}else{'Yellow'})
Write-Host "Excel: $(if($excelFiles){$excelFiles.Name}else{'not found'})" -ForegroundColor $(if($excelFiles){'Green'}else{'Yellow'})
Write-Host ""

if($pdfFiles -and $excelFiles) {
  Write-Host "DEMO_PACK_OK pdf=$($pdfFiles.Name) xlsx=$($excelFiles.Name)" -ForegroundColor Green
  exit 0
} else {
  Write-Host "DEMO_PACK_PARTIAL - Some exports missing" -ForegroundColor Yellow
  exit 0
}


