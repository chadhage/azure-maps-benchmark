[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ArchivePath
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$expected = @('package.json', 'package-lock.json', 'data/sample-addresses.json')
foreach ($directory in @('src', 'public', 'fixtures')) {
    $expected += Get-ChildItem -LiteralPath (Join-Path $root $directory) -Recurse -File |
        ForEach-Object { [IO.Path]::GetRelativePath($root, $_.FullName).Replace('\', '/') }
}
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ArchivePath).Path)
try {
    $actual = @($archive.Entries | Where-Object { $_.Name } |
        ForEach-Object { $_.FullName.Replace('\', '/') })
    $difference = @(Compare-Object ($expected | Sort-Object) ($actual | Sort-Object))
    if ($difference.Count) {
        throw "Package differs from the allowlist: $($difference | ConvertTo-Json -Compress)"
    }
    Write-Host "Package verified: exactly $($actual.Count) allowlisted files; no private datasets, results, environment files or infrastructure."
}
finally {
    $archive.Dispose()
}
