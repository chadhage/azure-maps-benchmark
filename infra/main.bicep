targetScope = 'resourceGroup'

@description('Azure region for the App Service plan. Azure Maps itself is a global resource.')
param location string = resourceGroup().location

@minLength(3)
@maxLength(40)
@description('Globally unique, approved App Service name. Register its exact authentication callback in Entra before deploying.')
param webAppName string

@description('Existing single-tenant Entra web application client ID, not the Maps account uniqueId.')
param entraApplicationClientId string

@description('Only members of this Entra group may use the hosted POC.')
param allowedEntraGroupObjectId string

@description('Existing RBAC-enabled Key Vault in this resource group, containing the Entra web application client secret.')
param authKeyVaultName string

@description('Existing Key Vault secret name. No secret value is accepted by this template.')
param authSecretName string

@allowed([
  'global'
  'us'
  'eu'
])
param mapsGeography string = 'global'

@description('Keep false until the data owner has approved live Azure Maps submissions.')
param enableLive bool = false

@description('Optional workspace for platform metrics only. Request and application logs are not collected.')
param diagnosticsWorkspaceId string = ''

@description('Optional delegated subnet for private Key Vault connectivity in the dedicated deployment.')
param appIntegrationSubnetId string = ''

@minValue(0)
@description('Optional shared persistent HTTP-attempt cap. Keep one instance; 0 disables the cap for the original evaluation workflow.')
param liveHttpAttemptLimit int = 0

@minLength(1)
@maxLength(5)
@description('Email recipients for the $100 monthly resource-group budget alerts.')
param budgetAlertEmails array

param budgetStartDate string = utcNow('yyyy-MM-01T00:00:00Z')
param budgetEndDate string = dateTimeAdd(utcNow('yyyy-MM-01T00:00:00Z'), 'P12M')

param tags object = {
  workload: 'azure-maps-efficacy-poc'
  dataClassification: 'restricted'
  environment: 'poc'
}

var suffix = uniqueString(resourceGroup().id, webAppName)
var mapsReaderRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '423170ca-a8f6-4b0f-8487-9e4eb8f49bfa')
var vaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource maps 'Microsoft.Maps/accounts@2023-06-01' = {
  name: 'maps-poc-${suffix}'
  location: 'global'
  kind: 'Gen2'
  sku: {
    name: 'G2'
  }
  properties: {
    disableLocalAuth: true
  }
  tags: tags
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-maps-${suffix}'
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
    capacity: 1
  }
  properties: {
    reserved: true
  }
  tags: tags
}

resource authVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: authKeyVaultName
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    virtualNetworkSubnetId: empty(appIntegrationSubnetId) ? null : appIntegrationSubnetId
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node src/server.js'
      alwaysOn: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      healthCheckPath: '/healthz'
      vnetRouteAllEnabled: !empty(appIntegrationSubnetId)
      appSettings: [
        { name: 'HOST', value: '0.0.0.0' }
        { name: 'PORT', value: '8080' }
        { name: 'NODE_ENV', value: 'production' }
        { name: 'ENABLE_LIVE', value: enableLive ? 'true' : 'false' }
        { name: 'LIVE_HTTP_ATTEMPT_LIMIT', value: string(liveHttpAttemptLimit) }
        { name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE', value: 'true' }
        { name: 'REQUIRE_PLATFORM_AUTH', value: 'true' }
        { name: 'AZURE_MAPS_CLIENT_ID', value: maps.properties.uniqueId }
        { name: 'AZURE_MAPS_GEOGRAPHY', value: mapsGeography }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET', value: '@Microsoft.KeyVault(SecretUri=https://${authKeyVaultName}${environment().suffixes.keyvaultDns}/secrets/${authSecretName}/)' }
      ]
    }
  }
  tags: union(tags, { 'azd-service-name': 'web' })
}

resource mapsReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(maps.id, app.id, mapsReaderRoleId)
  scope: maps
  properties: {
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: mapsReaderRoleId
  }
}

resource vaultReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(authVault.id, app.id, vaultSecretsUserRoleId)
  scope: authVault
  properties: {
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: vaultSecretsUserRoleId
  }
}

resource auth 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: true
      runtimeVersion: '~1'
    }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: [
        '/healthz'
      ]
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: entraApplicationClientId
          clientSecretSettingName: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET'
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            entraApplicationClientId
            'api://${entraApplicationClientId}'
          ]
          defaultAuthorizationPolicy: {
            allowedPrincipals: {
              groups: [
                allowedEntraGroupObjectId
              ]
            }
          }
        }
      }
    }
    login: {
      tokenStore: {
        enabled: false
      }
    }
    httpSettings: {
      requireHttps: true
    }
  }
}

resource scmPublishing 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: app
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpPublishing 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: app
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource monthlyBudget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'maps-poc-monthly-budget'
  properties: {
    category: 'Cost'
    amount: 100
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
      endDate: budgetEndDate
    }
    notifications: {
      Actual_GreaterThan_80_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: budgetAlertEmails
        locale: 'en-us'
      }
      Actual_GreaterThan_100_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: budgetAlertEmails
        locale: 'en-us'
      }
    }
  }
}

resource appMetrics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(diagnosticsWorkspaceId)) {
  name: 'platform-metrics'
  scope: app
  properties: {
    workspaceId: diagnosticsWorkspaceId
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    logs: []
  }
}

output siteUrl string = 'https://${app.properties.defaultHostName}'
output webAppResourceId string = app.id
output planResourceId string = plan.id
output mapsResourceId string = maps.id
output mapsClientId string = maps.properties.uniqueId
output managedIdentityPrincipalId string = app.identity.principalId
output mapsRoleAssignmentId string = mapsReader.id
output vaultRoleAssignmentId string = vaultReader.id
