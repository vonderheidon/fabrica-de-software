param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$caseRoot = Join-Path $root "evidencias\$RunId\MCP-ISO-04"
if (Test-Path -LiteralPath $caseRoot) { throw 'RunId already exists' }
$fixture = Join-Path $root "casos\$RunId\SDK Isolamento"
$null = New-Item -ItemType Directory -Path $fixture, "$caseRoot\isolated", "$caseRoot\private-agent", "$caseRoot\browser", "$caseRoot\gitnexus-home"
$previous = Join-Path $root 'casos\20261016T025007657Z\SDK Isolamento\.omp'
Copy-Item -LiteralPath $previous -Destination $fixture -Recurse
Copy-Item -LiteralPath (Join-Path $root 'evidencias\20261016T025007657Z\MCP-ISO-04\private-agent\RULES.md') -Destination "$caseRoot\private-agent\RULES.md"
Copy-Item -LiteralPath (Join-Path $root 'evidencias\20261016T025007657Z\MCP-ISO-04\private-agent\skills') -Destination "$caseRoot\private-agent\skills" -Recurse
$playwright = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx\9833c18b2d85bc59\node_modules\@playwright\mcp\cli.js'
$gitnexus = Join-Path $env:APPDATA 'npm\node_modules\gitnexus\dist\cli\index.js'
$configs = @{
    'ensaio-chrome' = @{ type='stdio'; command=(Get-Command node.exe).Source; cwd=$fixture; args=@($playwright,'--browser','chrome','--isolated','--output-dir',"$caseRoot\browser",'--viewport-size','1280x720') }
    'ensaio-gitnexus' = @{ type='stdio'; command=(Get-Command node.exe).Source; cwd=$fixture; args=@($gitnexus,'mcp'); env=@{ GITNEXUS_HOME="$caseRoot\gitnexus-home" } }
}
$sources = @{}
foreach ($name in $configs.Keys) { $sources[$name] = @{ level='project'; path="$caseRoot\selected-mcp.json"; providerName='Ensaio explicit product MCP'; provider='ensaio-sdk' } }
@{ configs=$configs; sources=$sources } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath "$caseRoot\selected-mcp.json" -Encoding utf8
@{ runId=$RunId; startedAt=[DateTime]::UtcNow.ToString('o'); status='prepared'; terminalId='ed93deb1-16bd-478e-9bcf-0c20d23f07c9'; provider='openai-codex'; model='gpt-6-luna'; thinking='high'; playwright='0.0.83'; gitnexus='1.6.9'; scope='fixtures only; no controller acceptance' } | ConvertTo-Json | Set-Content -LiteralPath "$caseRoot\run.json" -Encoding utf8
$RunId
