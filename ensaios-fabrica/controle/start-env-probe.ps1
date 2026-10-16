param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
& (Join-Path $PSScriptRoot 'sdk-runtime/node_modules/@oven/bun-windows-x64/bin/bun.exe') (Join-Path $PSScriptRoot 'sdk-runtime/env-probe.ts') $RunId
if ($LASTEXITCODE -ne 0) { throw "SDK probe exited with code $LASTEXITCODE" }
