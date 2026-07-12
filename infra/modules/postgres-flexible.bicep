targetScope = 'resourceGroup'

@description('Azure region for PostgreSQL Flexible Server.')
param location string = resourceGroup().location

@description('PostgreSQL Flexible Server name. Must be globally unique.')
param serverName string

@description('PostgreSQL database name used by the Cybermap API.')
param databaseName string = 'cybermap'

@description('PostgreSQL administrator login. Do not use postgres, azure_superuser, azure_pg_admin, admin, administrator, root, guest, or public.')
param administratorLogin string = 'bssadmin'

@secure()
@description('PostgreSQL administrator password. Pass via CI secret; never commit it.')
param administratorLoginPassword string

@description('Burstable Flexible Server SKU. Keep Standard_B1ms for the low-cost Cybermap validation stack unless load proves otherwise.')
param skuName string = 'Standard_B1ms'

@description('PostgreSQL major version.')
param postgresVersion string = '16'

@description('Initial PostgreSQL storage size in GiB. Azure minimum for Flexible Server is 32 GiB.')
@minValue(32)
param storageSizeGiB int = 32

@description('Backup retention days. Seven days is the low-cost baseline.')
@minValue(7)
@maxValue(35)
param backupRetentionDays int = 7

@description('Delegated subnet resource ID for PostgreSQL private VNet access.')
param delegatedSubnetResourceId string

@description('Private DNS zone resource ID for PostgreSQL private VNet access.')
param privateDnsZoneArmResourceId string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: 'Burstable'
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    createMode: 'Default'
    storage: {
      storageSizeGB: storageSizeGiB
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: delegatedSubnetResourceId
      privateDnsZoneArmResourceId: privateDnsZoneArmResourceId
    }
  }
  tags: {
    project: 'blue-swallow-society'
    role: 'cybermap-postgis'
    costTier: 'lowest-flexible-server-b1ms'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource azureExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-06-01-preview' = {
  parent: server
  name: 'azure.extensions'
  properties: {
    source: 'user-override'
    value: 'POSTGIS,PGCRYPTO'
  }
}

output serverName string = server.name
output databaseName string = database.name
output fullyQualifiedDomainName string = server.properties.fullyQualifiedDomainName
output skuName string = skuName
output storageSizeGiB int = storageSizeGiB
output backupRetentionDays int = backupRetentionDays
output geoRedundantBackup string = 'Disabled'
output highAvailabilityMode string = 'Disabled'
