targetScope = 'subscription'

@minLength(3)
@maxLength(24)
param environmentName string
param location string
param entraApplicationClientId string
param allowedEntraGroupObjectId string
param deployerObjectId string
param budgetAlertEmail string

@minLength(3)
@maxLength(40)
@description('Approved globally unique web app name; its exact callback is registered in Entra before provisioning.')
param webAppName string

@allowed([
  'global'
  'us'
  'eu'
])
param mapsGeography string = 'global'

@description('Leave false until hosted access is verified and the bounded pilot is approved to start.')
param enableLive bool = false

@description('Public demo access. Set false to restore the retained Entra/group gate.')
param publicDemo bool = true

@minValue(1)
param liveHttpAttemptLimit int = 30

var suffix = take(uniqueString(subscription().id, environmentName), 10)
var vaultName = 'kv-maps-${suffix}'
var tags = {
  'azd-env-name': environmentName
  workload: 'azure-maps-efficacy-poc'
  dataClassification: 'restricted'
  environment: 'poc'
}

resource rg 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: 'rg-maps-${environmentName}'
  location: location
  tags: tags
}

module support './support.bicep' = {
  name: 'support'
  scope: rg
  params: {
    name: vaultName
    location: location
    tags: tags
    deployerObjectId: deployerObjectId
  }
}

module workbench '../main.bicep' = {
  name: 'workbench'
  scope: rg
  params: {
    location: location
    webAppName: webAppName
    entraApplicationClientId: entraApplicationClientId
    allowedEntraGroupObjectId: allowedEntraGroupObjectId
    authKeyVaultName: support.outputs.vaultName
    authSecretName: 'entra-web-client-secret'
    mapsGeography: mapsGeography
    enableLive: enableLive
    publicDemo: publicDemo
    liveHttpAttemptLimit: liveHttpAttemptLimit
    budgetAlertEmails: [
      budgetAlertEmail
    ]
    diagnosticsWorkspaceId: support.outputs.workspaceResourceId
    appIntegrationSubnetId: support.outputs.appIntegrationSubnetId
    tags: tags
  }
}

output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_WEB_APP_NAME string = webAppName
output AZURE_KEY_VAULT_NAME string = support.outputs.vaultName
output AZURE_AUTH_SECRET_NAME string = 'entra-web-client-secret'
output AZURE_LOG_ANALYTICS_WORKSPACE_ID string = support.outputs.workspaceResourceId
output AZURE_APPLICATION_INSIGHTS_RESOURCE_ID string = support.outputs.insightsResourceId
output AZURE_MAPS_CLIENT_ID string = workbench.outputs.mapsClientId
output AZURE_MAPS_RESOURCE_ID string = workbench.outputs.mapsResourceId
output AZURE_WEB_PRINCIPAL_ID string = workbench.outputs.managedIdentityPrincipalId
output WEB_URL string = workbench.outputs.siteUrl
