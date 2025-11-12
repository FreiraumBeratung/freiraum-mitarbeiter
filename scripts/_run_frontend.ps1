Push-Location "$PSScriptRoot\..\frontend\fm-app"

if (Test-Path "package-lock.json") {
    npm ci
} else {
    npm install
}

npm run dev -- --port 5173 --host

Pop-Location
