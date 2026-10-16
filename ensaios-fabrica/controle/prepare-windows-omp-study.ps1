param([Parameter(Mandatory)][ValidateSet('cancel','crash')][string]$Scenario)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$base = Join-Path $root "evidencias/$runId"
$fixture = Join-Path $root "casos/$runId/TUI Ambiente Minimo"
$null = New-Item -ItemType Directory -Path "$base/sources","$base/TUI-ENV-01",$fixture
foreach ($name in @('windows-job-probe.cs','windows-job-runtime.cs','start-windows-omp-study.ps1','start-windows-omp-observer.ps1','mcp-minimal-launcher.mjs','tui-env-server.mjs','sdk-runtime/tui-minimal-env.ts')) {
    $target = Join-Path "$base/sources" $name
    $null = New-Item -ItemType Directory (Split-Path -Parent $target) -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $target
}
@"
Ensaio local autorizado $Scenario de OMP TUI dentro de Job. Trabalhe somente na fixture cwd. Nao leia ambiente, configuracoes ou credenciais; nao use subagentes, nao inicie servidores. O MCP ja esta conectado.
Leia xd://mcp__ensaio_minimo_inspect e chame inspect com name job-$Scenario-pronto. Informe os booleanos reais. Termine com JOB-RUNTIME-PRONTO e aguarde novas mensagens na mesma sessao, sem encerrar o programa e sem alterar arquivos.
"@ | Set-Content "$base/TUI-ENV-01/task.txt"
@{runId=$runId;scenario=$Scenario;at=[DateTime]::UtcNow.ToString('o');phase='pre-development-studies';model='openai-codex/gpt-6-luna';thinking='high';fallback=$false;scope='actual SDK TUI, MCP and native tool inside original owned Job';limits=@('Local fixture barriers, no authenticated product stop IPC','Known handles only after supervisor death','No all-inheritable-handle allowlist','No direct ConPTY creation or broker sandbox')} | ConvertTo-Json -Depth 4 | Set-Content "$base/intent.json"
@{runId=$runId;base=$base;scenario=$Scenario} | ConvertTo-Json -Compress
