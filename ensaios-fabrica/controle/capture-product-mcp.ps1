param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "evidencias\$RunId\MCP-ISO-04"
$snapshot = Join-Path $source 'captura'
if (Test-Path -LiteralPath $snapshot) { throw 'Capture already exists' }
if (!(Test-Path -LiteralPath "$source\isolated\shutdown.json")) { throw 'Close the writer session before capture' }
$null = New-Item -ItemType Directory -Path $snapshot
foreach ($name in @('isolated','browser')) {
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $snapshot $name) -Recurse
}
foreach ($name in @('run.json','selected-mcp.json','cleanup.json','owned-processes-active.json','http-ready.json','index-main.txt','index-decoy.txt')) {
    $path = Join-Path $source $name
    if (Test-Path -LiteralPath $path) { Copy-Item -LiteralPath $path -Destination $snapshot }
}
$audit = foreach ($file in Get-ChildItem -LiteralPath "$snapshot\isolated\sessoes" -File -Recurse) {
    foreach ($line in Get-Content -LiteralPath $file.FullName) {
        $entry = $line | ConvertFrom-Json
        if ($entry.message.role -eq 'assistant') {
            foreach ($block in $entry.message.content) {
                if ($block.type -eq 'toolCall') { @{type='call';id=$block.id;name=$block.name;arguments=$block.arguments} | ConvertTo-Json -Depth 20 -Compress }
            }
        } elseif ($entry.message.role -eq 'toolResult') {
            @{type='result';id=$entry.message.toolCallId;name=$entry.message.toolName;isError=$entry.message.isError;text=@($entry.message.content | Where-Object type -eq 'text' | ForEach-Object text)} | ConvertTo-Json -Depth 20 -Compress
        }
    }
}
$audit | Set-Content -LiteralPath "$snapshot\audit.jsonl" -Encoding utf8
$manifest = @(Get-ChildItem -LiteralPath $snapshot -Recurse -File | ForEach-Object {
    @{ path=[IO.Path]::GetRelativePath($snapshot,$_.FullName); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash; bytes=$_.Length }
})
@{ runId=$RunId; capturedAt=[DateTime]::UtcNow.ToString('o'); files=$manifest } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$source\manifesto-captura.json" -Encoding utf8
@{runId=$RunId;files=$manifest.Count;snapshot=$snapshot} | ConvertTo-Json
