$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
& node (Join-Path $PSScriptRoot 'preflight.mjs')
Write-Host 'Terminal exclusivo do ensaio. Nenhum agente iniciado.'
