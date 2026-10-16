param(
    [Parameter(Mandatory)][string]$RunId,
    [Parameter(Mandatory)][ValidateSet('global-control','bridge')][string]$Scenario
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $root "casos\$RunId\Projeto Isolamento"
$caseRoot = Join-Path $root "evidencias\$RunId\MCP-ISO-03"
$evidence = Join-Path $caseRoot $Scenario
Set-Location -LiteralPath $fixture
$env:ENSAIO_EVIDENCE = $evidence
$env:ENSAIO_MODE = $Scenario
$env:ENSAIO_NODE = (Get-Command node.exe -CommandType Application).Source
if ($Scenario -eq 'global-control') {
    $env:PI_CODING_AGENT_DIR = Join-Path $caseRoot 'private-agent'
    $env:OMP_PROFILE = ''
}
$omp = (Get-Command omp -CommandType Application).Source
$overlay = Join-Path $evidence 'overlay.yml'
$argsOmp = @('--cwd',$fixture,'--model','openai-codex/gpt-6-luna','--thinking','high','--no-prewalk','--no-extensions','-e',(Join-Path $PSScriptRoot 'probe-mcp-isolation.ts'),'--config',$overlay,'--session-dir',(Join-Path $evidence 'sessoes'))
if ($Scenario -eq 'bridge') {
    $argsOmp += '@' + (Join-Path $evidence 'tarefa.txt')
}
[ordered]@{scenario=$Scenario;pid=$PID;ompExecutable=$omp;cwd=$fixture;maestriTerminalId=$env:MAESTRI_TERMINAL_ID} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'launcher.json') -Encoding utf8
& $omp @argsOmp
