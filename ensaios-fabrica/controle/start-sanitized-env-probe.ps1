param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $root "evidencias/$RunId"
$nodeDirectory = Split-Path -Parent (Get-Command node.exe).Source
$start = [System.Diagnostics.ProcessStartInfo]::new((Join-Path $PSScriptRoot 'sdk-runtime/node_modules/@oven/bun-windows-x64/bin/bun.exe'))
$start.ArgumentList.Add((Join-Path $PSScriptRoot 'sdk-runtime/env-probe.ts'))
$start.ArgumentList.Add($RunId)
$start.ArgumentList.Add('sanitized')
$start.WorkingDirectory = $root
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.RedirectStandardInput = $true
$start.Environment.Clear()
foreach ($name in @('SystemRoot','WINDIR','TEMP','TMP')) {
    if ([Environment]::GetEnvironmentVariable($name)) { $start.Environment[$name] = [Environment]::GetEnvironmentVariable($name) }
}
$start.Environment['PATH'] = $nodeDirectory
$start.Environment['PI_CODING_AGENT_DIR'] = Join-Path $evidence 'private-agent'
$previous = $env:ENSAIO_PARENT_ONLY
try {
    $env:ENSAIO_PARENT_ONLY = [Guid]::NewGuid().ToString('N')
    @{at=[DateTime]::UtcNow.ToString('o');parentHasMarker=[bool]$env:ENSAIO_PARENT_ONLY;parentHasMaestriPipe=[bool]$env:MAESTRI_PIPE;childEnvironmentNames=@($start.Environment.Keys);source='ProcessStartInfo.Environment.Clear plus explicit allowlist'} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$evidence/sanitized-launch.json"
    $process = [System.Diagnostics.Process]::Start($start)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Close()
    if (!$process.WaitForExit(45000)) { $process.Kill($true); throw 'Owned SDK host exceeded 45 second deadline' }
    $stdout.GetAwaiter().GetResult() | Set-Content -LiteralPath "$evidence/host.stdout"
    $stderr.GetAwaiter().GetResult() | Set-Content -LiteralPath "$evidence/host.stderr"
    @{pid=$process.Id;exitCode=$process.ExitCode;at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath "$evidence/host-exit.json"
    if ($process.ExitCode -ne 0) { throw "SDK host exited with $($process.ExitCode)" }
} finally { $env:ENSAIO_PARENT_ONLY = $previous }
