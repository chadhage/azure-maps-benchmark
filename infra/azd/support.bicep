targetScope = 'resourceGroup'

param name string
param location string
param tags object
param deployerObjectId string

module vault 'br/public:avm/res/key-vault/vault:0.14.0' = {
  name: 'auth-vault'
  params: {
    name: name
    location: location
    tags: tags
    enableTelemetry: false
    enablePurgeProtection: true
    enableRbacAuthorization: true
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
    roleAssignments: [
      {
        principalId: deployerObjectId
        principalType: 'User'
        roleDefinitionIdOrName: 'Key Vault Secrets Officer'
      }
    ]
  }
}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-${name}'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.247.0.0/24'
      ]
    }
    subnets: [
      {
        name: 'app-integration'
        properties: {
          addressPrefix: '10.247.0.0/26'
          delegations: [
            {
              name: 'app-service'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: 'private-endpoints'
        properties: {
          addressPrefix: '10.247.0.64/27'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource vaultDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
  tags: tags
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: vaultDns
  name: 'demo-vault'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: network.id
    }
  }
}

resource vaultEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: 'pe-${name}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: '${network.id}/subnets/private-endpoints'
    }
    privateLinkServiceConnections: [
      {
        name: 'vault'
        properties: {
          privateLinkServiceId: vault.outputs.resourceId
          groupIds: [
            'vault'
          ]
        }
      }
    ]
  }
}

resource vaultDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: vaultEndpoint
  name: 'vault'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'vault'
        properties: {
          privateDnsZoneId: vaultDns.id
        }
      }
    ]
  }
}

module workspace 'br/public:avm/res/operational-insights/workspace:0.16.0' = {
  name: 'operational-workspace'
  params: {
    name: 'log-${name}'
    location: location
    tags: tags
    enableTelemetry: false
    skuName: 'PerGB2018'
    dataRetention: 30
    dailyQuotaGb: '0.1'
  }
}

// No SDK/agent is enabled: address-bearing requests must not enter automatic telemetry.
module insights 'br/public:avm/res/insights/component:0.8.0' = {
  name: 'application-insights'
  params: {
    name: 'appi-${name}'
    location: location
    tags: tags
    enableTelemetry: false
    workspaceResourceId: workspace.outputs.resourceId
    disableLocalAuth: true
  }
}

output vaultName string = vault.outputs.name
output workspaceResourceId string = workspace.outputs.resourceId
output insightsResourceId string = insights.outputs.resourceId
output appIntegrationSubnetId string = '${network.id}/subnets/app-integration'
