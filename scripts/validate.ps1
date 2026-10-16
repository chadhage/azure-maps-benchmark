[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    & npm run verify
    if ($LASTEXITCODE -ne 0) { throw 'Application validation failed.' }
    & az bicep build --file (Join-Path $PSScriptRoot '..\infra\main.bicep') --stdout | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Bicep compilation failed.' }
    $parseErrors = @()
    foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1') {
        $tokens = $null
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
        $parseErrors += $errors
    }
    if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
}
finally { Pop-Location }
