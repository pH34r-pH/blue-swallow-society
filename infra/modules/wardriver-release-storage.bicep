@description('Release-account name prefix. The final account name is deterministic and globally unique.')
param prefix string

@description('Azure region for the dedicated Wardriver release storage account.')
param location string

@description('Private Blob container containing immutable Wardriver APKs and manifests.')
param containerName string = 'wardriver-releases'

@description('Public Blob container containing only the BSS-hosted Wardriver basemap style and vector tiles.')
param basemapContainerName string = 'wardriver-basemap'

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
    // The release container stays private. This account also has one blob-read-only basemap
    // container so MapLibre can request public style and tile bytes without a client secret.
    allowBlobPublicAccess: true
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
    cors: {
      corsRules: [
        {
          allowedOrigins: [
            'https://blueswallow.net'
            'https://www.blueswallow.net'
          ]
          allowedMethods: [
            'GET'
            'HEAD'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
          exposedHeaders: [
            'Content-Length'
            'Content-Type'
            'ETag'
          ]
          maxAgeInSeconds: 86400
        }
      ]
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

// `Blob` permits anonymous reads of named style/tile objects but not container listing.
resource wardriverBasemapContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: basemapContainerName
  properties: {
    publicAccess: 'Blob'
  }
}

output storageAccountName string = releaseStorage.name
output releaseContainerName string = releaseContainer.name
output basemapContainerName string = wardriverBasemapContainer.name
output wardriverBasemapStyleUrl string = 'https://${releaseStorage.name}.blob.${environment().suffixes.storage}/${wardriverBasemapContainer.name}/v1/style.json'
