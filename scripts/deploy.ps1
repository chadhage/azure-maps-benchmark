[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$ParameterFile,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$parameters = (Resolve-Path $ParameterFile).Path
$values = (Get-Content -Raw -LiteralPath $parameters | ConvertFrom-Json -AsHashtable).parameters
foreach ($name in @('webAppName', 'entraApplicationClientId', 'allowedEntraGroupObjectId', 'authKeyVaultName', 'authSecretName')) {
    if (-not $values[$name].value -or $values[$name].value -match '^REPLACE') {
        throw "Set the approved value for $name in the parameter file."
    }
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
if (-not $Apply) {
    Write-Host 'Validation only. No resources were provisioned. Use -Apply after approval.'
    return
}
if (-not $PSCmdlet.ShouldProcess("$SubscriptionId / $ResourceGroupName", 'Provision the approved POC and deploy its application code')) { return }
$name = "maps-poc-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
$deploymentJson = & az deployment group create --name $name --resource-group $ResourceGroupName --template-file $template --parameters "@$parameters" --output json
if ($LASTEXITCODE -ne 0) { throw 'Infrastructure deployment failed.' }
$outputs = ($deploymentJson | ConvertFrom-Json).properties.outputs
$archive = & (Join-Path $PSScriptRoot 'package.ps1')
& az webapp deploy --resource-group $ResourceGroupName --name $values.webAppName.value --src-path $archive --type zip --async false
if ($LASTEXITCODE -ne 0) { throw 'Application deployment failed. Inspect App Service build logs.' }
$healthUrl = "$($outputs.siteUrl.value)/healthz"
$healthy = $false
for ($attempt = 1; $attempt -le 12; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 15
        if ($response.status -eq 'ok') { $healthy = $true; break }
        Write-Warning 'Health endpoint returned an unexpected payload.'
    }
    catch [System.Net.Http.HttpRequestException] {
        Write-Warning "Health probe $attempt failed: $($_.Exception.Message)"
    }
    catch [System.Threading.Tasks.TaskCanceledException] {
        Write-Warning "Health probe $attempt timed out."
    }
    Start-Sleep -Seconds 10
}
if (-not $healthy) { throw 'The deployed application did not become responsive. Maps connectivity and Entra sign-in are not yet verified.' }
Write-Host "Application responsive: $($outputs.siteUrl.value)"
Write-Host 'Next: verify Entra group access and denied access, Key Vault resolution, and an explicitly approved live Maps case. Health alone does not verify these.'
Write-Host "Deployment record: $name. Preserve its outputs for targeted cleanup; do not delete the existing Key Vault or its resource group."
