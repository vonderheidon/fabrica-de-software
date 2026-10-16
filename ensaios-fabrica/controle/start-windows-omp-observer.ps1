param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$base = Join-Path $root "evidencias/$RunId"
$binary = Join-Path $root "casos/$RunId/TUI Ambiente Minimo/windows-omp-study.exe"
Set-Location -LiteralPath $root
& $binary observe-runtime-crash "$base/WIN-OMP-01"
$code = $LASTEXITCODE
@{at=[DateTime]::UtcNow.ToString('o');exitCode=$code} | ConvertTo-Json | Set-Content "$base/observer-exit.json"
if ($code -ne 0) { throw "Observer failed: $code" }
