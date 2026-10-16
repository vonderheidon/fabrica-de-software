param(
    [Parameter(Mandatory)][string]$RunId,
    [Parameter(Mandatory)][ValidateSet('normal','cancel','crash')][string]$Scenario
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$base = Join-Path $root "evidencias/$RunId"
$fixture = Join-Path $root "casos/$RunId/TUI Ambiente Minimo"
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$binary = Join-Path $fixture 'windows-omp-study.exe'
Set-Location -LiteralPath $root
if (Test-Path $binary) { throw 'Run already compiled; use fresh RunId' }
$probeSource = (Resolve-Path -LiteralPath (Join-Path $base 'sources/windows-job-probe.cs')).ProviderPath
$runtimeSource = (Resolve-Path -LiteralPath (Join-Path $base 'sources/windows-job-runtime.cs')).ProviderPath
@{probeSource=$probeSource;runtimeSource=$runtimeSource;binary=$binary} | ConvertTo-Json | Set-Content (Join-Path $base 'compile-inputs.json')
$compile = & $compiler /nologo /target:exe /platform:x64 /define:RUNTIME_STUDY /optimize+ /r:System.Web.Extensions.dll "/out:$binary" $probeSource $runtimeSource 2>&1
$code = $LASTEXITCODE
$compile | Set-Content "$base/compile.log"
@{at=[DateTime]::UtcNow.ToString('o');exitCode=$code;compiler=(Get-Item $compiler).VersionInfo.FileVersion;scenario=$Scenario} | ConvertTo-Json | Set-Content "$base/compile.json"
if ($code -ne 0) { throw "Compile failed: $code" }
@{at=[DateTime]::UtcNow.ToString('o');binarySha256=(Get-FileHash $binary -Algorithm SHA256).Hash;terminalId=$env:MAESTRI_TERMINAL_ID;maestriPipePresent=[bool]$env:MAESTRI_PIPE;scenario=$Scenario} | ConvertTo-Json | Set-Content "$base/launch.json"
& $binary runtime "$base/WIN-OMP-01" $fixture (Join-Path $PSScriptRoot 'sdk-runtime/node_modules/@oven/bun-windows-x64/bin/bun.exe') (Join-Path $PSScriptRoot 'sdk-runtime/tui-minimal-env.ts') $RunId $Scenario
$code = $LASTEXITCODE
@{at=[DateTime]::UtcNow.ToString('o');exitCode=$code;scenario=$Scenario;expected=if($Scenario -eq 'crash'){199}else{0}} | ConvertTo-Json | Set-Content "$base/supervisor-exit.json"
if ($Scenario -ne 'crash' -and $code -ne 0) { throw "Supervisor failed: $code" }
