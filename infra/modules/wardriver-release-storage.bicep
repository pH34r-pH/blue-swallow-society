@description('Release-account name prefix. The final account name is deterministic and globally unique.')
param prefix string

@description('Azure region for the dedicated Wardriver release storage account.')
param location string

@description('Private Blob container containing immutable Wardriver APKs and manifests.')
param containerName string = 'wardriver-releases'

@description('The system $web container. It exposes only static website paths; ordinary Blob containers remain private.')
param basemapContainerName string = '$web'

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
    // Azure Policy forbids ordinary anonymous Blob access. $web remains the one public,
    // read-only static-website surface; every normal Blob container stays private.
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

// Microsoft documents $web as anonymously readable even when ordinary Blob anonymous
// access is disabled. It is the only public delivery surface in this account.
resource basemapStaticWebsite 'Microsoft.Storage/storageAccounts/staticWebsite@2023-05-01' = {
  parent: releaseStorage
  name: 'default'
  properties: {
    indexDocument: 'index.html'
    error404Document: '404.html'
  }
}

resource releaseContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}

// `$web` is created by the staticWebsite setting. Do not declare it with Blob public access.

output storageAccountName string = releaseStorage.name
output releaseContainerName string = releaseContainer.name
output basemapContainerName string = basemapContainerName
output wardriverBasemapStyleUrl string = '${releaseStorage.properties.primaryEndpoints.web}wardriver-basemap/v1/style.json'
