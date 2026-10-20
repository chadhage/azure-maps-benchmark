[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = Join-Path $root 'artifacts\azd-app'
$archive = & (Join-Path $PSScriptRoot 'package.ps1')
try {
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $target
    Write-Host "Allowlisted azd deployment artifact prepared: $target"
}
finally {
    Remove-Item -LiteralPath $archive -Force
}
