$ErrorActionPreference="Continue"

$cats = @("shk","elektro","aerzte","steuerberater","makler","handel","galabau")
$cities = @("Arnsberg","Sundern","Neheim","Meschede","Bestwig","Eslohe","Olsberg","Brilon","Marsberg","Schmallenberg","Winterberg","Hallenberg")

function PostJ($url,$body){ 
  try{ 
    $bodyJson = $body | ConvertTo-Json -Compress
    $r=Invoke-WebRequest -UseBasicParsing -Uri $url -Method Post -Body $bodyJson -ContentType "application/json" -TimeoutSec 90
    try {
      $json = $r.Content | ConvertFrom-Json -AsHashtable
      return @{ok=($r.StatusCode -eq 200); status=$r.StatusCode; json=$json}
    } catch {
      $json = $r.Content | ConvertFrom-Json
      return @{ok=($r.StatusCode -eq 200); status=$r.StatusCode; json=$json}
    }
  }catch{ 
    return @{ok=$false; err=$_.Exception.Message} 
  } 
}

$rows = @()
$total = $cats.Count * $cities.Count
$current = 0

Write-Host "Starting OSM Matrix Hunt: $total combinations"
foreach($c in $cats){
  foreach($city in $cities){
    $current++
    Write-Host "[$current/$total] Category: $c, City: $city"
    Start-Sleep -Milliseconds 600
    
    $resp = PostJ "http://127.0.0.1:30521/lead_hunter/osm/hunt_async" @{ category=$c; location=$city }
    
    if($resp.ok -and $resp.json.result -and $resp.json.result.leads){
      foreach($x in $resp.json.result.leads){ 
        $rows += [pscustomobject]@{
          category=$c
          city=$city
          company=$x.company
          phone=$x.phone
          email=$x.email
          website=$x.website
          score=$x.score
          street=$x.street
          postcode=$x.postcode
        }
      }
      Write-Host "  Found: $($resp.json.result.leads.Count) leads"
    } else {
      if($resp.err){
        Write-Host "  Error: $($resp.err)"
      } else {
        Write-Host "  Found: 0 leads"
      }
    }
  }
}

$root = Split-Path -Parent $PSScriptRoot
$exportDir = Join-Path $root "backend\data\exports"
New-Item -ItemType Directory -Force -Path $exportDir | Out-Null

$csv = Join-Path $exportDir ("osm_matrix_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".csv")
$rows | Export-Csv -NoTypeInformation -Encoding UTF8 $csv

Write-Host ""
Write-Host ("OSM-MATRIX EXPORT: {0} rows={1}" -f $csv, $rows.Count)


