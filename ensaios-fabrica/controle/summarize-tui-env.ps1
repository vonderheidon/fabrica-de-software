param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$base = Join-Path $root "evidencias/$RunId/TUI-ENV-01"
$fixture = Join-Path $root "casos/$RunId/TUI Ambiente Minimo"
if (!(Test-Path "$base/shutdown.json")) { throw 'Close writer before summarizing' }
if (Test-Path "$base/result.json") { throw 'Summary already exists' }
$ready = Get-Content "$base/ready.json" -Raw | ConvertFrom-Json
$after = Get-Content "$base/after-task.json" -Raw | ConvertFrom-Json
$post = Get-Content "$base/after-input-1.json" -Raw | ConvertFrom-Json
$during = Get-Content "$base/after-input-2.json" -Raw | ConvertFrom-Json
$new = Get-Content "$base/after-input-3.json" -Raw | ConvertFrom-Json
$server = @(Get-Content "$base/server.jsonl" | ForEach-Object { $_ | ConvertFrom-Json })
$events = @(Get-Content "$base/events.jsonl" | ForEach-Object { $_ | ConvertFrom-Json })
$audit = @()
foreach ($file in Get-ChildItem "$base/sessions" -File -Recurse) {
    $entries = @(Get-Content $file.FullName | ForEach-Object { $_ | ConvertFrom-Json })
    $sessionId = ($entries | Where-Object type -eq session | Select-Object -First 1).id
    foreach ($entry in $entries) {
        if ($entry.message.role -eq 'assistant') {
            foreach ($block in $entry.message.content) {
                if ($block.type -eq 'toolCall') { $audit += @{type='call';sessionId=$sessionId;timestamp=$entry.timestamp;id=$block.id;name=$block.name;arguments=$block.arguments} }
            }
        } elseif ($entry.message.role -eq 'toolResult') {
            $audit += @{type='result';sessionId=$sessionId;timestamp=$entry.timestamp;id=$entry.message.toolCallId;name=$entry.message.toolName;isError=$entry.message.isError;text=@($entry.message.content | Where-Object type -eq text | ForEach-Object text)}
        } elseif ($entry.message.role -eq 'user') {
            $audit += @{type='user';sessionId=$sessionId;timestamp=$entry.timestamp;text=@($entry.message.content | Where-Object type -eq text | ForEach-Object text)}
        }
    }
}
$audit | ConvertTo-Json -Depth 12 | Set-Content "$base/tool-audit.json"
$start = Get-Content "$fixture/tool-active.json" -Raw | ConvertFrom-Json
$end = Get-Content "$fixture/tool-done.json" -Raw | ConvertFrom-Json
$sent = Get-Content "$base/during-tool-sent.json" -Raw | ConvertFrom-Json
$successes = @($server | Where-Object { $_.event -eq 'tool-call' -and !$_.isError })
$responses = @($successes | ForEach-Object { $_.result.content[0].text | ConvertFrom-Json })
$assistant = @($events | Where-Object event -eq assistant-message)
$validation = @($audit | Where-Object { $_.type -eq 'result' -and $_.isError -and ($_.text -join "`n") -match 'name: is required' })
$checks = [ordered]@{
    realTui = ($ready.tty.stdin -and $ready.tty.stdout)
    exactModelEffort = ($assistant.Count -gt 0 -and @($assistant | Where-Object { $_.provider -ne 'openai-codex' -or $_.model -ne 'gpt-6-luna' -or $_.thinkingLevel -ne 'high' }).Count -eq 0)
    parentContextPresent = ($ready.parentMarkerPresent -and $ready.maestriContextPresent)
    serverSecretAndMarkerIsolation = ($responses.Count -ge 4 -and @($responses | Where-Object { !$_.configuredSecretCorrect -or $_.unconfiguredParentMarkerInherited -or $_.maestriControlContextInherited }).Count -eq 0)
    schemaErrorObservedByAgent = ($validation.Count -eq 1)
    agentCorrectedCall = ('recuperado' -in $responses.name)
    nativeReadWriteEdit = ((Get-Content "$fixture/prova-nativa.txt" -Raw).Trim() -eq 'editado' -and @($audit | Where-Object { $_.type -eq 'call' -and $_.name -eq 'edit' }).Count -gt 0 -and @($audit | Where-Object { $_.type -eq 'call' -and $_.name -eq 'write' -and $_.arguments.path -eq 'prova-nativa.txt' }).Count -gt 0 -and @($audit | Where-Object { $_.type -eq 'call' -and $_.name -eq 'read' -and $_.arguments.path -eq 'prova-nativa.txt' }).Count -gt 0)
    nativeShell = (@($audit | Where-Object { $_.type -eq 'result' -and $_.name -eq 'bash' -and ($_.text -join "`n").Trim() -eq '5' }).Count -eq 1)
    postResultSameSession = ($post.sessionId -eq $ready.sessionId -and 'pos-resultado' -in $responses.name)
    duringToolDelivery = ([DateTimeOffset]$sent.sentAt -gt [DateTimeOffset]$start.at -and [DateTimeOffset]$sent.sentAt -lt [DateTimeOffset]$end.at -and 'durante-ferramenta' -in $responses.name -and $during.sessionId -eq $ready.sessionId)
    duringMessageCodeConfirmed = (@($assistant | Where-Object { ($_.text -join "`n") -match 'INTERACAO-DURANTE-731' }).Count -eq 1 -and @($audit | Where-Object { $_.type -eq 'user' -and $_.sessionId -eq $ready.sessionId -and ($_.text -join "`n") -match 'INTERACAO-DURANTE-731' }).Count -eq 1)
    nativeNewSessionObserved = ($new.sessionId -ne $ready.sessionId -and $new.model -eq 'gpt-6-luna' -and $new.thinkingLevel -eq 'high' -and 'nova-sessao' -in $responses.name)
    serverExitObserved = (@($server | Where-Object { $_.event -eq 'server-exit' -and $_.code -eq 0 }).Count -eq 1)
}
@{
    runId=$RunId;at=[DateTime]::UtcNow.ToString('o');checks=$checks
    status=if (@($checks.Values | Where-Object { !$_ }).Count -eq 0) { 'mechanism-pass-awaiting-independent-review' } else { 'partial-or-failure' }
    sessions=@{initial=$ready.sessionId;postResult=$post.sessionId;duringTool=$during.sessionId;afterNativeNew=$new.sessionId}
    timeline=@{toolStarted=$start.at;messageSent=$sent.sentAt;toolFinished=$end.at}
    errorBoundary='Missing required argument rejected by xd runtime with toolResult.isError=true before tools/call; agent corrected without operator assistance'
    limits=@('Trusted launcher inherits parent environment; only actual server receives reduced environment','Synthetic secret and two excluded markers tested, not a general sandbox','Model used existing auth; auth material not copied','Native /new observed only; no factory tracking invalidation or stale-result enforcement','Messages simulated via Wire, no new manual-human confirmation','No question/confirmation interaction, real product MCP, Job Object, or protocol durability proof','Initial numeric argument was coerced to string in previous run; no strict numeric rejection claim')
} | ConvertTo-Json -Depth 8 | Set-Content "$base/result.json"
$checks
