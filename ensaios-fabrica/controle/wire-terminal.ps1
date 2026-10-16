param(
    [Parameter(Mandatory)][string]$CredentialPath,
    [Parameter(Mandatory)][string]$TerminalId,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$InputText,
    [ValidateRange(1,30)][int]$Seconds = 3
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

public static class EnsaioWireTerminal {
    public static async Task<string> Run(string endpoint, string token, string pin, string terminal, string input, int seconds) {
        using var socket = new ClientWebSocket();
        socket.Options.RemoteCertificateValidationCallback = (sender, certificate, chain, errors) => {
            if (certificate == null) return false;
            using var cert = new X509Certificate2(certificate);
            var digest = SHA256.HashData(cert.PublicKey.ExportSubjectPublicKeyInfo());
            return Convert.ToBase64String(digest) == pin;
        };
        var address = new UriBuilder(endpoint) {
            Scheme = "wss", Path = "/api/terminals/" + Uri.EscapeDataString(terminal) + "/stream",
            Query = "token=" + Uri.EscapeDataString(token)
        };
        using var connectTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await socket.ConnectAsync(address.Uri, connectTimeout.Token);
        if (!String.IsNullOrEmpty(input)) {
            var message = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { type = "input", data = input }));
            await socket.SendAsync(new ArraySegment<byte>(message), WebSocketMessageType.Text, true, connectTimeout.Token);
        }
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
        using var output = new MemoryStream();
        var buffer = new byte[32768];
        try {
            while (socket.State == WebSocketState.Open) {
                var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), deadline.Token);
                if (result.MessageType == WebSocketMessageType.Close) break;
                if (result.MessageType == WebSocketMessageType.Binary) output.Write(buffer, 0, result.Count);
            }
        } catch (OperationCanceledException) when (deadline.IsCancellationRequested) { }
        return Encoding.UTF8.GetString(output.ToArray());
    }
}
'@
$record = Import-Clixml -LiteralPath $CredentialPath
$token = [System.Net.NetworkCredential]::new('', $record.token).Password
$pin = $record.pinnedPublicKey -replace '^sha256//', ''
try {
    $screen = [EnsaioWireTerminal]::Run($record.endpoint, $token, $pin, $TerminalId, $InputText, $Seconds).GetAwaiter().GetResult()
} catch {
    throw ('Falha no stream Wire: ' + $_.Exception.GetType().Name)
}
$screen | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output ('Stream salvo em ' + $OutputPath)
