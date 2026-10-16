param(
    [Parameter(Mandatory)][string]$CaseId
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$planPath = Join-Path $root 'casos\validacoes.json'
$plan = Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
$selected = if ($CaseId -eq 'ALL') { @($plan.cases) } else { @($plan.cases | Where-Object id -EQ $CaseId) }
if ($selected.Count -eq 0) { throw "Caso nao encontrado: $CaseId" }

$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
$runRoot = Join-Path $root "evidencias\$runId"
$entries = @()
foreach ($case in $selected) {
    $caseRoot = Join-Path $runRoot $case.id
    New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null
    $entries += [ordered]@{
        id = $case.id
        title = $case.title
        status = 'queued'
        evidenceDirectory = $case.id
    }
}

$run = [ordered]@{
    schemaVersion = 1
    runId = $runId
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    plan = 'casos/validacoes.json'
    status = 'prepared'
    cases = $entries
    secretValuesRecorded = $false
}
$run | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'run.json') -Encoding utf8
Write-Output (Join-Path $runRoot 'run.json')
