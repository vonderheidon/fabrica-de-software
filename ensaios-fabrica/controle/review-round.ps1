param([Parameter(Mandatory)][ValidateSet('R1','R2')][string]$Round, [switch]$Isolated)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = $OutputEncoding
$root = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $root "evidencias\20261015T230824329Z\REV-01\$Round"
$snapshot = Join-Path $evidence 'captura'
$sessions = Join-Path $evidence $(if ($Isolated) { 'sessoes-isoladas' } else { 'sessoes' })
New-Item -ItemType Directory -Path $sessions -Force | Out-Null
Set-Location -LiteralPath $snapshot
$prompt = 'Leia exclusivamente criterios.txt e classificar.mjs na pasta atual. Nao leia outros arquivos, diretorios pai, historico, outras capturas ou evidencias. Julgue somente a funcao classificar para entradas negativas, zero e positivas. Responda APROVADO ou REPROVADO, com evidencia para cada uma dessas tres entradas e arquivos lidos. Finalize assim que avaliar os tres criterios. Termine com REVISAO-CONCLUIDA.'
$outputName = if ($Isolated) { 'parecer-isolado.txt' } else { 'parecer.txt' }
& omp --print --no-skills --no-extensions --no-rules --no-lsp --no-title --tools read --system-prompt 'Voce e um revisor estatico de uma fixture de ensaio. Seu unico escopo sao os dois arquivos indicados na pasta atual. Use apenas leitura desses arquivos e entregue um parecer curto. Nao explore o repositorio.' --session-dir $sessions $prompt 2>&1 | Tee-Object -FilePath (Join-Path $evidence $outputName)
if ($LASTEXITCODE -ne 0) { throw "OMP terminou com codigo $LASTEXITCODE" }
