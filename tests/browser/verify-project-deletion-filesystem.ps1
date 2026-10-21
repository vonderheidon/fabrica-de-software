param([Parameter(Mandatory)][string]$ResultPath)
$ErrorActionPreference = 'Stop'
$result = Get-Content -LiteralPath $ResultPath -Raw | ConvertFrom-Json
if (-not $result.passed -or $result.run -notmatch '^deletion-ui-\d+-[a-z0-9]+$' -or $result.fixtures.Count -ne 3) {
    throw 'The browser regression must pass with its three local fixtures first.'
}
$root = [IO.Path]::GetFullPath($result.projectsRoot).TrimEnd([char[]]'\/')
foreach ($fixture in $result.fixtures) {
    $directory = [IO.Path]::GetFullPath($fixture.directory)
    $parent = [IO.Path]::GetDirectoryName($directory).TrimEnd([char[]]'\/')
    if ($parent -ne $root -or [IO.Path]::GetFileName($directory) -ne $fixture.relative -or
        -not $fixture.relative.StartsWith($result.run + '-')) {
        throw 'Fixture does not belong to this run and the configured projects root.'
    }
    if (Test-Path -LiteralPath $directory -ErrorAction Stop) {
        throw ('A temporary project directory remains: ' + $directory)
    }
}
[pscustomobject]@{ passed = $true; checkedDirectories = $result.fixtures.Count; run = $result.run } | ConvertTo-Json
