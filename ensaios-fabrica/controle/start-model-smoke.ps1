param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $root "evidencias\$RunId\MCP-ISO-04\model-smoke"
$fixture = Join-Path $root "casos\$RunId\Modelo"
Set-Location -LiteralPath $fixture
$omp = (Get-Command omp -CommandType Application).Source
& $omp --cwd $fixture --model openai-codex/gpt-6-luna --thinking high --no-prewalk --no-extensions --config (Join-Path $evidence 'overlay.yml') --session-dir (Join-Path $evidence 'sessoes') ('@' + (Join-Path $evidence 'tarefa.txt'))
