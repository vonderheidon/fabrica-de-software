param(
    [Parameter(Mandatory)][string]$RunId,
    [Parameter(Mandatory)][ValidateSet('baseline','injected','native-off')][string]$Scenario
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $root "casos\$RunId\Projeto Portatil"
$evidence = Join-Path $root "evidencias\$RunId\PORT-02\$Scenario"
$sessions = Join-Path $evidence 'sessoes'
New-Item -ItemType Directory -Path $sessions -Force | Out-Null
$overlay = Join-Path $evidence 'overlay.yml'
$projectConfig = if ($Scenario -eq 'native-off') { 'false' } else { 'true' }
@"
autoResume: false
retry:
  modelFallback: false
mcp:
  enableProjectConfig: $projectConfig
  startupTimeoutMs: 0
"@ | Set-Content -LiteralPath $overlay -Encoding utf8
$ompPath = (Get-Command omp -CommandType Application).Source
Set-Location -LiteralPath $fixture
[ordered]@{
    scenario=$Scenario
    cwd=(Get-Location).Path
    pid=$PID
    ompExecutable=$ompPath
    maestriCliPresent=[bool]$env:MAESTRI_CLI
    maestriPipePresent=[bool]$env:MAESTRI_PIPE
    maestriTerminalPresent=[bool]$env:MAESTRI_TERMINAL_ID
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'launcher.json') -Encoding utf8
$ompArgs = @('--cwd',$fixture,'--model','openai-codex/gpt-6-luna','--thinking','high','--no-prewalk','--no-extensions','--config',$overlay,'--session-dir',$sessions)
if ($Scenario -ne 'injected') {
    $prompt = if ($Scenario -eq 'baseline') {
        'Ensaio PORT-02. Trabalhe somente na pasta atual. Chame a ferramenta ensaio-local.greet com name Portabilidade. Depois execute Node pelo shell para mostrar process.cwd(). Use tambem a ferramenta de leitura para ler .omp/mcp.json. Nao altere arquivos, nao abra agentes nem acesse recursos externos. Ao terminar informe os resultados reais e termine com PORT-02-CONCLUIDO.'
    } else {
        'Ensaio MCP-ISO-02 native-off. Neste cenario os MCPs de projeto foram desativados por overlay para testar o efeito; isso e intencional e nao deve ser consertado. Execute Node pelo shell para mostrar process.cwd() e leia .omp/mcp.json com a ferramenta de leitura. Nao altere arquivos, nao abra agentes nem acesse recursos externos. Termine com NATIVE-OFF-CONCLUIDO.'
    }
    $promptFile = Join-Path $evidence 'tarefa.txt'
    $prompt | Set-Content -LiteralPath $promptFile -Encoding utf8
    $ompArgs += '@' + $promptFile
}
& $ompPath @ompArgs
