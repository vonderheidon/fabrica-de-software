param(
    [Parameter(Mandatory)][string]$RunId,
    [Parameter(Mandatory)][ValidateSet('late-response','lost-response')][string]$Mode,
    [Parameter(Mandatory)][string]$WorkspaceId,
    [string]$CredentialPath = (Join-Path $env:LOCALAPPDATA 'NovaFabricaSoftware\validation\maestri-wire.xml')
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

public sealed class EnsaioLateContent : HttpContent {
    private readonly byte[] body;
    private readonly string journal;
    public string CancelRequestedAt { get; private set; }
    public string UploadCompletedAt { get; private set; }
    public EnsaioLateContent(string json, string journalPath) {
        body = Encoding.UTF8.GetBytes(json);
        journal = journalPath;
        Headers.ContentType = new MediaTypeHeaderValue("application/json");
    }
    protected override bool TryComputeLength(out long length) { length = body.Length; return true; }
    protected override async Task SerializeToStreamAsync(Stream stream, TransportContext context) {
        await stream.WriteAsync(body, 0, body.Length - 1);
        await stream.FlushAsync();
        CancelRequestedAt = DateTime.UtcNow.ToString("o");
        File.WriteAllText(journal, JsonSerializer.Serialize(new {
            phase = "cancel-requested-during-upload", at = CancelRequestedAt,
            injection = "in-flight transport completes after cancellation flag"
        }));
        // Modela uma escrita de rede ja em voo que conclui apesar do cancelamento.
        await Task.Delay(250);
        await stream.WriteAsync(body, body.Length - 1, 1);
        await stream.FlushAsync();
        UploadCompletedAt = DateTime.UtcNow.ToString("o");
    }
}
public sealed class EnsaioLateResponse {
    public string CancelRequestedAt { get; set; }
    public string UploadCompletedAt { get; set; }
    public int HttpStatus { get; set; }
    public string ResponseJson { get; set; }
    public bool ResponseDiscarded { get; set; }
}
public static class EnsaioLateCreate {
    public static async Task<EnsaioLateResponse> Run(string endpoint, string token, string pin, string route, string body, string journal, bool discard) {
        using var handler = new HttpClientHandler { AllowAutoRedirect = false };
        handler.ServerCertificateCustomValidationCallback = (request, cert, chain, errors) => {
            if (cert == null) return false;
            return Convert.ToBase64String(SHA256.HashData(cert.PublicKey.ExportSubjectPublicKeyInfo())) == pin;
        };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(15) };
        using var content = new EnsaioLateContent(body, journal);
        using var message = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(endpoint.TrimEnd('/') + "/"), route.TrimStart('/')));
        message.Version = new Version(1, 1);
        message.VersionPolicy = HttpVersionPolicy.RequestVersionExact;
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        message.Headers.ConnectionClose = true;
        message.Content = content;
        using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead);
        return new EnsaioLateResponse {
            CancelRequestedAt = content.CancelRequestedAt,
            UploadCompletedAt = content.UploadCompletedAt,
            HttpStatus = (int)response.StatusCode,
            ResponseJson = discard ? null : await response.Content.ReadAsStringAsync(),
            ResponseDiscarded = discard
        };
    }
}
'@
$root = Split-Path -Parent $PSScriptRoot
$helper = Join-Path $PSScriptRoot 'wire-request.ps1'
$evidence = Join-Path $root "evidencias\$RunId\CAN-LATE-02\$Mode"
$runner = Join-Path $evidence 'runner'
New-Item -ItemType Directory -Path $runner -Force | Out-Null
if (Test-Path -LiteralPath (Join-Path $evidence 'intencao.json')) {
    throw 'Esta rodada/cenario ja possui intencao registrada. Consulte o feed e as evidencias; use outro RunId para um novo ensaio.'
}
$name = "Ensaio Criacao $RunId $Mode"
$mutationId = [guid]::NewGuid().ToString()
$command = 'pwsh -NoLogo -File "' + (Join-Path $PSScriptRoot 'lifecycle-case.ps1') + '" -Mode initializing -OutputDirectory "' + $runner + '"'
$body = @{name=$name;command=$command;monitorActivity=$true;maestroMode=$false;mutationId=$mutationId} | ConvertTo-Json -Compress
@{name=$name;mutationId=$mutationId;phase='recruiting';at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'intencao.json') -Encoding utf8
$record = Import-Clixml -LiteralPath $CredentialPath
$token = [System.Net.NetworkCredential]::new('', $record.token).Password
$pin = $record.pinnedPublicKey -replace '^sha256//',''
try {
    $reply = [EnsaioLateCreate]::Run($record.endpoint,$token,$pin,"/api/workspaces/$WorkspaceId/terminals",$body,(Join-Path $evidence 'cancelamento.json'),($Mode -eq 'lost-response')).GetAwaiter().GetResult()
} catch {
    throw ('Falha no transporte de ensaio: ' + $_.Exception.GetType().Name + '. Consulte o feed pelo nome registrado antes de repetir qualquer criacao.')
}
$reply | Select-Object CancelRequestedAt,UploadCompletedAt,HttpStatus,ResponseDiscarded | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'transporte.json') -Encoding utf8
if ($reply.HttpStatus -lt 200 -or $reply.HttpStatus -ge 300) { throw "Criacao respondeu HTTP $($reply.HttpStatus)." }
$returnedId = if ($reply.ResponseJson) { ($reply.ResponseJson | ConvertFrom-Json).terminalId } else { $null }
$found = @()
for ($poll=0; $poll -lt 20; $poll++) {
    $feed = & $helper -CredentialPath $CredentialPath -Route "/api/workspaces/$WorkspaceId/feed" | ConvertFrom-Json
    $found = @($feed.items | Where-Object {$_.terminal.name -eq $name} | ForEach-Object terminal)
    if ($found.Count) { break }
    Start-Sleep -Milliseconds 200
}
if ($found.Count -ne 1) { throw "Identidade ambigua ou desconhecida: $($found.Count) recursos. Preserve a intencao e reconcilie antes de novo lancamento." }
$terminal = $found[0]
if ($returnedId -and $returnedId -ne $terminal.id) { throw 'Identidade retornada difere do recurso encontrado.' }
@{terminalId=$terminal.id;name=$terminal.name;returnedId=$returnedId;at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'recurso-reconciliado.json') -Encoding utf8
$ack = & $helper -CredentialPath $CredentialPath -Route "/api/terminals/$($terminal.id)/kill" -Method POST | ConvertFrom-Json
$stableStopped = 0
for ($poll=0; $poll -lt 30; $poll++) {
    $feed = & $helper -CredentialPath $CredentialPath -Route "/api/workspaces/$WorkspaceId/feed" | ConvertFrom-Json
    $current = ($feed.items | Where-Object {$_.terminal.id -eq $terminal.id}).terminal
    if ($null -ne $current -and -not $current.isRunning) { $stableStopped++ } else { $stableStopped=0 }
    if ($stableStopped -ge 3) { break }
    Start-Sleep -Milliseconds 250
}
$workers = @(Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($runner)} | Select-Object ProcessId,ParentProcessId,Name,CreationDate)
ConvertTo-Json -InputObject @($workers) -Depth 4 | Set-Content -LiteralPath (Join-Path $evidence 'workers-residuais.json') -Encoding utf8
$result = [ordered]@{
    mode=$Mode
    terminalId=$terminal.id
    createRequests=1
    matchingResources=$found.Count
    cancellationInjected=$true
    transportDeliberatelyCompletedAfterCancel=$true
    cancelRequestedAt=$reply.CancelRequestedAt
    uploadCompletedAt=$reply.UploadCompletedAt
    responseDiscarded=$reply.ResponseDiscarded
    terminalStopped=($stableStopped -ge 3)
    workerCount=$workers.Count
    completionMarkerExists=(Test-Path -LiteralPath (Join-Path $runner 'concluido.txt'))
    factoryControllerValidated=$false
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'resultado.json') -Encoding utf8
$result | ConvertTo-Json
if ($stableStopped -lt 3 -or $workers.Count -gt 0) { throw 'Cleanup nao comprovado; recurso mantido no diagnostico.' }
