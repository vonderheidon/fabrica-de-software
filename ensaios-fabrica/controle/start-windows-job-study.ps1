param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$base = Join-Path $root "evidencias/$RunId"
$fixture = Join-Path $root "casos/$RunId/Windows Job Estudo"
Set-Location -LiteralPath $root
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$binary = Join-Path $fixture 'windows-job-probe.exe'
if (Test-Path -LiteralPath $binary) { throw 'Run already compiled; use a fresh RunId' }
$output = & $compiler /nologo /target:exe /platform:x64 /optimize+ /r:System.Web.Extensions.dll "/out:$binary" (Join-Path $base 'sources/windows-job-probe.cs') 2>&1
$compileCode = $LASTEXITCODE
$output | Set-Content -LiteralPath "$base/compile.log"
@{at=[DateTime]::UtcNow.ToString('o');compilerVersion=(Get-Item $compiler).VersionInfo.FileVersion;exitCode=$compileCode;compileOnceForStudy=$true} | ConvertTo-Json | Set-Content -LiteralPath "$base/compile.json"
if ($compileCode -ne 0) { throw "Study compile failed with $compileCode" }
@{at=[DateTime]::UtcNow.ToString('o');binarySha256=(Get-FileHash $binary -Algorithm SHA256).Hash;sourceSha256=(Get-FileHash "$base/sources/windows-job-probe.cs" -Algorithm SHA256).Hash;maestriContextPresent=@{cli=[bool]$env:MAESTRI_CLI;pipe=[bool]$env:MAESTRI_PIPE;terminal=[bool]$env:MAESTRI_TERMINAL_ID};terminalId=$env:MAESTRI_TERMINAL_ID} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$base/runtime.json"
& $binary suite (Join-Path $base 'WIN-JOB-01')
$suiteCode = $LASTEXITCODE
@{at=[DateTime]::UtcNow.ToString('o');exitCode=$suiteCode} | ConvertTo-Json | Set-Content -LiteralPath "$base/suite-exit.json"
if ($suiteCode -ne 0) { throw "Study suite failed with $suiteCode" }
