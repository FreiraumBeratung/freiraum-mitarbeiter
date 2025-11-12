param([int]$b=30521,[int]$f=5173)
$ErrorActionPreference = "SilentlyContinue"
foreach ($p in @($b,$f)) {
  $conns = Get-NetTCPConnection -LocalPort $p -State Listen
  foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force }
}
