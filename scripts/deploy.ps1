[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$ParameterFile,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if ($Apply) {
    throw 'Local deployments are disabled. Push to main or open a same-repository PR and use the Verify and deploy GitHub Actions workflow.'
}
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$parameters = (Resolve-Path $ParameterFile).Path
$values = (Get-Content -Raw -LiteralPath $parameters | ConvertFrom-Json -AsHashtable).parameters
foreach ($name in @('webAppName', 'entraApplicationClientId', 'allowedEntraGroupObjectId', 'authKeyVaultName', 'authSecretName')) {
    if (-not $values[$name].value -or $values[$name].value -match '^REPLACE') {
        throw "Set the approved value for $name in the parameter file."
    }
}
$budgetAlertEmails = @($values.budgetAlertEmails.value)
if (-not $budgetAlertEmails.Count -or $budgetAlertEmails -contains 'REPLACE_WITH_BUDGET_ALERT_EMAIL') {
    throw 'Set at least one budget alert recipient in the parameter file.'
}
$current = & az account show --query id --output tsv
if ($LASTEXITCODE -ne 0) { throw 'Sign in with az login before running deployment validation.' }
if ($current.Trim() -ne $SubscriptionId) { throw 'The active Azure subscription does not match SubscriptionId. Select the approved subscription explicitly.' }
$vaultRbac = & az keyvault show --name $values.authKeyVaultName.value --resource-group $ResourceGroupName --query properties.enableRbacAuthorization --output tsv
if ($LASTEXITCODE -ne 0 -or $vaultRbac.Trim() -ne 'true') { throw 'The existing authentication Key Vault must be in the target resource group and use Azure RBAC.' }
$appJson = & az ad app show --id $values.entraApplicationClientId.value --output json
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the approved Entra web application registration.' }
$registration = $appJson | ConvertFrom-Json
$callback = "https://$($values.webAppName.value).azurewebsites.net/.auth/login/aad/callback"
if ($registration.signInAudience -ne 'AzureADMyOrg' -or $callback -notin $registration.web.redirectUris) {
    throw "Use a single-tenant Entra web registration with this exact redirect URI: $callback"
}
$template = Join-Path $root 'infra\main.bicep'
& az bicep build --file $template --stdout | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Bicep compilation failed.' }
Write-Host "Subscription: $SubscriptionId`nResource group: $ResourceGroupName`nRegion: $($values.location.value)`nLive enabled: $($values.enableLive.value)"
& az deployment group what-if --resource-group $ResourceGroupName --template-file $template --parameters "@$parameters"
if ($LASTEXITCODE -ne 0) { throw 'Azure what-if validation failed.' }
Write-Host 'Validation only. No resources were provisioned. Application deployment is GitHub Actions only.'
