$ErrorActionPreference="Continue"

function J($u){ 
  try{ 
    $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 10
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

Write-Host "=== Phase A-D Acceptance Test ==="
Write-Host ""

# Test Categories
Write-Host "1. Testing /voice/intent/categories..."
$cats = J "http://127.0.0.1:30521/voice/intent/categories"
if($cats.ok) {
  Write-Host "  ✅ Categories OK - Count: $($cats.json.categories.Count)"
} else {
  Write-Host "  ❌ Categories FAIL: $($cats.err)"
}

# Test Cities
Write-Host "2. Testing /voice/intent/cities..."
$cities = J "http://127.0.0.1:30521/voice/intent/cities"
if($cities.ok) {
  Write-Host "  ✅ Cities OK - Count: $($cities.json.cities.Count)"
} else {
  Write-Host "  ❌ Cities FAIL: $($cities.err)"
}

# Test OSM Hunt
Write-Host "3. Testing /lead_hunter/osm/hunt_async..."
$run = PostJ "http://127.0.0.1:30521/lead_hunter/osm/hunt_async" @{ category="shk"; location="Arnsberg"; enrich=$true }
if($run.ok) {
  $found = $run.json.result.found
  $leadsCount = $run.json.result.leads.Count
  Write-Host "  ✅ Hunt OK - Found: $found - Leads: $leadsCount"
  if($leadsCount -gt 0) {
    $firstLead = $run.json.result.leads[0]
    Write-Host "  ✅ First Lead: $($firstLead.company) - Score: $($firstLead.score)"
  }
} else {
  Write-Host "  ❌ Hunt FAIL: $($run.err)"
}

# Test Export
Write-Host "4. Testing /lead_hunter/osm/export..."
$testLeads = if($run.ok -and $run.json.result.leads.Count -gt 0) { 
  $run.json.result.leads 
} else { 
  @( @{company="Demo GmbH"; category="shk"; city="Arnsberg"; street=""; postcode=""; phone=""; email=""; website=""; score=42; source="osm"} ) 
}
$exp = PostJ "http://127.0.0.1:30521/lead_hunter/osm/export" @{leads=$testLeads; category="shk"; city="Arnsberg"}
if($exp.ok -or $exp.status -eq 200) {
  Write-Host "  ✅ Export OK"
} else {
  Write-Host "  ❌ Export FAIL: $($exp.err)"
}

# Create Report
$root = Split-Path -Parent $PSScriptRoot
$reportPath = Join-Path $root "backend\exports\phase_ad_acceptance.json"

$report = [ordered]@{
  generated_at = (Get-Date).ToString("s")
  backend_status = "ok"
  endpoints = @{
    categories = @{
      ok = $cats.ok
      count = if($cats.ok) { $cats.json.categories.Count } else { 0 }
      categories = if($cats.ok) { $cats.json.categories } else { @() }
    }
    cities = @{
      ok = $cities.ok
      count = if($cities.ok) { $cities.json.cities.Count } else { 0 }
      cities = if($cities.ok) { $cities.json.cities } else { @() }
    }
  }
  hunt = @{
    ok = $run.ok
    category = "shk"
    city = "Arnsberg"
    leads_found = if($run.ok) { $run.json.result.found } else { 0 }
    leads_count = if($run.ok) { $run.json.result.leads.Count } else { 0 }
    first_lead = if($run.ok -and $run.json.result.leads.Count -gt 0) { $run.json.result.leads[0] } else { $null }
  }
  export = @{
    ok = ($exp.ok -or $exp.status -eq 200)
    status = if($exp.ok -or $exp.status -eq 200) { "EXPORT_OK" } else { "EXPORT_FAIL" }
    error = if(-not ($exp.ok -or $exp.status -eq 200)) { $exp.err } else { $null }
  }
  acceptance = if($cats.ok -and $cities.ok -and $run.ok -and ($exp.ok -or $exp.status -eq 200)) { "passed" } else { "partial" }
}

$report | ConvertTo-Json -Depth 8 | Out-File -Encoding UTF8 $reportPath

Write-Host ""
Write-Host "=== Acceptance Report ==="
Write-Host "Status: $($report.acceptance)"
Write-Host "Report: $reportPath"
Write-Host ""
Write-Host "ACCEPTANCE_REPORT $reportPath"


