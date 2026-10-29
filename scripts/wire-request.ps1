param(
    [Parameter(Mandatory)][string]$CredentialPath,
    [Parameter(Mandatory)][string]$Route,
    [ValidateSet('GET','POST')][string]$Method = 'GET',
    [string]$Body
)
$ErrorActionPreference = 'Stop'
$record = Import-Clixml -LiteralPath $CredentialPath
$token = [System.Net.NetworkCredential]::new('', $record.token).Password
$pin = $record.pinnedPublicKey
if (-not $pin.StartsWith('sha256//')) { $pin = 'sha256//' + $pin }
$url = $record.endpoint.TrimEnd('/') + $Route
function Escape-CurlConfig([string]$value) {
    return $value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n')
}
$config = @(
    'silent', 'show-error', 'insecure', 'max-time = 20',
    ('pinnedpubkey = "' + (Escape-CurlConfig $pin) + '"'),
    ('url = "' + (Escape-CurlConfig $url) + '"'),
    ('request = "' + $Method + '"'),
    ('header = "Authorization: Bearer ' + (Escape-CurlConfig $token) + '"'),
    'fail-with-body'
)
if ($Body) {
    $config += 'header = "Content-Type: application/json"'
    $config += 'data = "' + (Escape-CurlConfig $Body) + '"'
}
$start = [System.Diagnostics.ProcessStartInfo]::new('curl.exe')
$start.ArgumentList.Add('--config')
$start.ArgumentList.Add('-')
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::Start($start)
$outTask = $process.StandardOutput.ReadToEndAsync()
$errTask = $process.StandardError.ReadToEndAsync()
$process.StandardInput.Write(($config -join "`n"))
$process.StandardInput.Close()
$process.WaitForExit()
$output = $outTask.GetAwaiter().GetResult()
if ($process.ExitCode -ne 0) {
    throw "Wire request failed (curl exit $($process.ExitCode)): $($errTask.GetAwaiter().GetResult())"
}
$output
