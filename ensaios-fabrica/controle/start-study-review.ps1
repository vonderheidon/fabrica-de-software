param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& (Join-Path $PSScriptRoot 'sdk-runtime/node_modules/@oven/bun-windows-x64/bin/bun.exe') (Join-Path $PSScriptRoot 'sdk-runtime/review-study.ts') $RunId
if ($LASTEXITCODE -ne 0) { throw "Reviewer exited with $LASTEXITCODE" }
