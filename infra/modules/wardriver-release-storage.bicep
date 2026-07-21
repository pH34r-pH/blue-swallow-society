@description('Release-account name prefix. The final account name is deterministic and globally unique.')
param prefix string

@description('Azure region for the dedicated Wardriver release storage account.')
param location string

@description('Private Blob container containing immutable Wardriver APKs and manifests.')
param containerName string = 'wardriver-releases'

var storageAccountName = toLower('bsswd${uniqueString(subscription().id, resourceGroup().id, prefix)}')

resource releaseStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
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
    defaultToOAuthAuthentication: true
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    project: 'blue-swallow-society'
    purpose: 'wardriver-immutable-release-delivery'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: releaseStorage
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: {
      enabled: true
      days: 30
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 30
    }
  }
}

resource releaseContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}

output storageAccountName string = releaseStorage.name
output releaseContainerName string = releaseContainer.name
