@description('Rate-limit account name prefix. The final account name is deterministic and globally unique.')
param prefix string

@description('Azure region for the dedicated passcode rate-limit storage account.')
param location string

@description('Table that stores hashed caller failure windows for the passcode API.')
param tableName string = 'passcodeFailures'

var storageAccountName = toLower('bssrl${uniqueString(subscription().id, resourceGroup().id, prefix)}')

resource rateLimitStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: true
    defaultToOAuthAuthentication: false
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    project: 'blue-swallow-society'
    purpose: 'passcode-shared-rate-limit'
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: rateLimitStorage
  name: 'default'
}

resource failureWindows 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: tableName
}

output storageAccountName string = rateLimitStorage.name
output tableName string = failureWindows.name
