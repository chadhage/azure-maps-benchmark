[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\artifacts')
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output = (Resolve-Path $OutputDirectory).Path
$id = [guid]::NewGuid().ToString()
$stage = Join-Path $output "stage-$id"
$archive = Join-Path $output "azure-maps-poc-$id.zip"
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    # An explicit allowlist keeps private datasets, results, .env and credentials out of the zip.
    foreach ($file in @('package.json', 'package-lock.json')) {
        Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage
    }
    foreach ($directory in @('src', 'public', 'fixtures')) {
        Copy-Item -LiteralPath (Join-Path $root $directory) -Destination $stage -Recurse
    }
    $dataDirectory = Join-Path $stage 'data'
    New-Item -ItemType Directory -Path $dataDirectory | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'data\sample-addresses.json') -Destination $dataDirectory
    $items = Get-ChildItem -LiteralPath $stage -Force | Select-Object -ExpandProperty FullName
    Compress-Archive -LiteralPath $items -DestinationPath $archive
    Write-Output $archive
}
finally {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
