$ErrorActionPreference = "Stop"

function Ensure-Dir { param([string]$p) if (!(Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }

function Kill-Port { param([int]$Port)
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($c) { $pid = $c[0].OwningProcess; if ($pid) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } }
  } catch {}
}

function Append { 
  param([string]$path,[string]$txt)
  Add-Content -Path $path -Value $txt -Encoding UTF8 
}

