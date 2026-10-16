param(
    [Parameter(Mandatory)][ValidateSet('initializing','running')][string]$Mode,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$childId = $null
if ($Mode -eq 'running') {
    $child = Start-Process -FilePath 'pwsh' -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 120' -WindowStyle Hidden -PassThru
    $childId = $child.Id
}
[ordered]@{pid=$PID; childPid=$childId; phase=$Mode; startedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'processo.json') -Encoding utf8
Write-Output ('FASE=' + $Mode)
if ($Mode -eq 'initializing') {
    Start-Sleep -Seconds 90
} else {
    for ($step=0; $step -lt 90; $step++) {
        @{step=$step; at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $OutputDirectory 'heartbeat.jsonl')
        Start-Sleep -Seconds 1
    }
}
'completed' | Set-Content -LiteralPath (Join-Path $OutputDirectory 'concluido.txt') -Encoding utf8
