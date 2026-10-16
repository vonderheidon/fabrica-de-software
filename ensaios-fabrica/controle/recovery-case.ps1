param([string]$ResumeSession)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = $OutputEncoding
$root = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $root 'evidencias\20261015T230824329Z\REC-01'
$working = Join-Path $root 'casos\execucao-20261015T230824329Z\recuperacao'
$sessions = Join-Path $evidence 'sessoes'
New-Item -ItemType Directory -Path $working,$sessions -Force | Out-Null
Set-Location -LiteralPath $working
if ($ResumeSession) {
    & omp --restore $ResumeSession --session-dir $sessions --no-skills --no-extensions --no-lsp --no-title
} else {
    $prompt = 'Ensaio REC-01 de interrupcao e retomada. Trabalhe somente na pasta atual. A operacao tem identificador fixo rec-001. Primeiro leia o estado existente. Registre em eventos.json uma unica entrada para rec-001, com status iniciado, preservando o mesmo id e sem duplicar entradas se ja existir. Em seguida execute uma espera real de 45 segundos com Node: node -e "setTimeout(()=>{},45000)". Esta espera simula trabalho interrompivel e e obrigatoria. Somente depois atualize a mesma entrada para concluido e grave resultado.json com jobId rec-001 e status concluido. Se esta sessao for retomada depois de interrupcao, reconcilie os arquivos existentes e continue a mesma operacao sem criar ids, entradas ou resultados duplicados. Nao crie agentes nem acesse outros projetos. Termine com REC-01-CONCLUIDO.'
    & omp --print --session-dir $sessions --no-skills --no-extensions --no-lsp --no-title $prompt 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'inicial.txt')
}
if ($LASTEXITCODE -ne 0) { throw "OMP terminou com codigo $LASTEXITCODE" }
