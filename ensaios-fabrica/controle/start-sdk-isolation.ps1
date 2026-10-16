param(
    [Parameter(Mandatory)][string]$RunId,
    [Parameter(Mandatory)][ValidateSet('control','isolated','manual')][string]$Scenario
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$caseRoot = Join-Path $root "evidencias\$RunId\MCP-ISO-04"
$env:ENSAIO_AUTH_DIR = if ($env:PI_CODING_AGENT_DIR) { $env:PI_CODING_AGENT_DIR } else { Join-Path $env:USERPROFILE '.omp\agent' }
$previousAgentDir = $env:PI_CODING_AGENT_DIR
$previousProfile = $env:OMP_PROFILE
$env:PI_CODING_AGENT_DIR = Join-Path $caseRoot 'private-agent'
$env:OMP_PROFILE = ''
Set-Location -LiteralPath (Join-Path $root "casos\$RunId\SDK Isolamento")
try {
    & (Join-Path $PSScriptRoot 'sdk-runtime\node_modules\@oven\bun-windows-x64\bin\bun.exe') (Join-Path $PSScriptRoot 'sdk-runtime\bootstrap.ts') $RunId $Scenario
} finally {
    $env:PI_CODING_AGENT_DIR = $previousAgentDir
    $env:OMP_PROFILE = $previousProfile
    Remove-Item Env:\ENSAIO_AUTH_DIR
}
