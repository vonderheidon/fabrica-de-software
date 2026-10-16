param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$working = Join-Path $root "casos\$RunId\captura"
$evidence = Join-Path $root "evidencias\$RunId\SNAP-02"
$source = Join-Path $working 'implementacao'
$snapshot = Join-Path $evidence 'captura'
$review = Join-Path $working 'revisao'
$publication = Join-Path $working 'publicacao'
if (Test-Path -LiteralPath (Join-Path $evidence 'manifesto.json')) {
    throw 'Esta rodada ja possui captura. Use outro RunId para preservar a evidencia anterior.'
}
foreach ($directory in @($source,$snapshot,$review,$publication)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
$fileName = 'relatório de versão.txt'
$sourceFile = Join-Path $source $fileName
$snapshotFile = Join-Path $snapshot $fileName
$reviewFile = Join-Path $review $fileName
$publicationFile = Join-Path $publication $fileName
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($sourceFile, 'Versão aprovada: ação e correção.', $utf8)
Copy-Item -LiteralPath $sourceFile -Destination $snapshotFile
$approvedHash = (Get-FileHash -LiteralPath $snapshotFile -Algorithm SHA256).Hash
@{path=$fileName;sha256=$approvedHash;kind='regular-file';scope='fixture-not-Git-manifest'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'manifesto.json') -Encoding utf8

[System.IO.File]::WriteAllText($sourceFile, 'Checkout mutável alterado após a captura.', $utf8)
Copy-Item -LiteralPath $snapshotFile -Destination $reviewFile
Copy-Item -LiteralPath $snapshotFile -Destination $publicationFile
[System.IO.File]::WriteAllText($reviewFile, 'Produto alterado pelo revisor nesta fixture.', $utf8)

$sourceHash = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash
$snapshotHash = (Get-FileHash -LiteralPath $snapshotFile -Algorithm SHA256).Hash
$reviewHash = (Get-FileHash -LiteralPath $reviewFile -Algorithm SHA256).Hash
$publicationHash = (Get-FileHash -LiteralPath $publicationFile -Algorithm SHA256).Hash
if ($sourceHash -eq $approvedHash) { throw 'A mutacao da fonte nao ocorreu.' }
if ($snapshotHash -ne $approvedHash) { throw 'A captura foi alterada.' }
if ($publicationHash -ne $approvedHash) { throw 'A materializacao nao usou a captura aprovada.' }
if ($reviewHash -eq $approvedHash) { throw 'A mutacao do revisor nao foi detectada.' }

$result = [ordered]@{
    status='passed-file-copy-mechanism'
    sourceChanged=$true
    snapshotPreserved=$true
    reviewMutationDetected=$true
    publicationUsesApprovedSnapshot=$true
    approvedSha256=$approvedHash
    sourceSha256=$sourceHash
    snapshotSha256=$snapshotHash
    reviewSha256=$reviewHash
    publicationSha256=$publicationHash
    factoryWriterCoordinationValidated=$false
    factoryReviewerRejectionValidated=$false
    gitCloneAndFullManifestValidated=$false
    filesystemLockRequiredBySpec=$false
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'resultado.json') -Encoding utf8
$result | ConvertTo-Json
Write-Output 'SNAP-02-CONCLUIDO'
