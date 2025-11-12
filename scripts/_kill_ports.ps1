$ports = 30521, 5173
Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue |
    Select-Object OwningProcess -Unique |
    ForEach-Object {
        try {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        } catch {}
    }
Write-Host "Ports freed: $($ports -join ', ')"





