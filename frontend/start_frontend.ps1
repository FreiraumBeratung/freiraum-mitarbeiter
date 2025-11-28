Set-Location -Path "$PSScriptRoot\fm-app"

# Prüfe ob Port 5173 bereits belegt ist und beende den Prozess falls nötig
$port = 5173
$connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connection) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "Port $port ist belegt durch Prozess: $($process.Name) (PID: $($process.Id))"
        Write-Host "Beende Prozess..."
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "Port $port ist jetzt frei."
    }
}

npm install

npm run dev -- --port $port
