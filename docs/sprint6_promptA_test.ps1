# Run in a second terminal while server is running

$base = "http://localhost:30521/api/character"



# 1) Set profile

$bodyProfile = @{

  user_id = "denis"

  tone = "partnerschaftlich, direkt, motivierend"

  humor = "dezent"

  formality = "mittel"

  focus = @("SHK","ERP","E-Mail","Leads","Sauerland")

  style_notes = "Schwarz-Orange, High-End ERP Look, klare Sprache."

} | ConvertTo-Json

Invoke-RestMethod -Method Put -Uri "$base/profile" -ContentType "application/json" -Body $bodyProfile | Out-Host



# 2) Post events

$events = @(

  @{ user_id="denis"; role="user"; text="Bro, der Follow-up lief super! Angebot ist raus und Feedback war genial!!" },

  @{ user_id="denis"; role="user"; text="Ich bin etwas müde heute, aber wir ziehen das durch." },

  @{ user_id="denis"; role="user"; text="Bitte zeig mir später die KPIs und den Status vom IMAP/SMTP." }

)

foreach ($e in $events) {

  $json = $e | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri "$base/event" -ContentType "application/json" -Body $json | Out-Host

}



# 3) Read state & profile

Invoke-RestMethod -Method Get -Uri "$base/state?user_id=denis" | Out-Host

Invoke-RestMethod -Method Get -Uri "$base/profile?user_id=denis" | Out-Host



# 4) Reset (keep events)

$reset = @{ user_id="denis"; purge_events=$false } | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$base/reset" -ContentType "application/json" -Body $reset | Out-Host



# 5) Read state again

Invoke-RestMethod -Method Get -Uri "$base/state?user_id=denis" | Out-Host



















