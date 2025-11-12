$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
cd "$root\electron"
if (!(Test-Path ".\node_modules")) { npm i }
npm run start
























