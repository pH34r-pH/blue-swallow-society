targetScope = 'resourceGroup'

@description('Azure region for PostgreSQL Flexible Server.')
param location string = resourceGroup().location

@description('PostgreSQL Flexible Server name. The public FQDN is <name>.postgres.database.azure.com even when public network access is disabled.')
@minLength(3)
@maxLength(63)
param serverName string

@description('Cybermap application database name created on the PostgreSQL Flexible Server.')
@minLength(1)
@maxLength(63)
param databaseName string = 'cybermap'

@description('PostgreSQL major version. Version 16 is suitable for PostGIS on Azure Database for PostgreSQL Flexible Server.')
@allowed([
  '15'
  '16'
])
param postgresqlVersion string = '16'

@description('Password-auth administrator login. Safe to expose to VM app settings; the password is not output.')
@minLength(1)
@maxLength(63)
param administratorLogin string

@secure()
@description('Password for the PostgreSQL administrator login. Pass from a secure deployment secret; never commit it to parameter files.')
@minLength(8)
@maxLength(128)
param administratorPassword string

@description('Resource ID of the subnet delegated to Microsoft.DBforPostgreSQL/flexibleServers.')
param postgresSubnetId string

@description('Resource ID of the private DNS zone linked to the backend VNet.')
param privateDnsZoneId string

@description('Burstable Flexible Server compute SKU. Cybermap P0 uses B1MS for the private PostGIS datastore.')
@allowed([
  'Standard_B1ms'
])
param skuName string = 'Standard_B1ms'

@description('Initial PostgreSQL storage in GiB. Azure storage can grow but not shrink, so keep the P0 baseline explicit.')
@minValue(32)
param storageSizeGB int = 32

@description('Point-in-time backup retention in days.')
@minValue(7)
@maxValue(35)
param backupRetentionDays int = 7

@description('Comma-separated Azure PostgreSQL extensions allowed for CREATE EXTENSION by migrations.')
param azureExtensions string = 'POSTGIS,PGCRYPTO'

var postgresPort = 5432
var hostName = '${serverName}.postgres.database.azure.com'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: 'Burstable'
  }
  properties: {
    version: postgresqlVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: postgresSubnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
      publicNetworkAccess: 'Disabled'
    }
    storage: {
      storageSizeGB: storageSizeGB
      autoGrow: 'Disabled'
    }
  }
  tags: {
    project: 'blue-swallow-society'
    component: 'cybermap-postgresql'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource allowedExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: {
    value: azureExtensions
    source: 'user-override'
  }
}

output serverName string = server.name
output hostName string = hostName
output port int = postgresPort
output databaseName string = database.name
output administratorLogin string = administratorLogin
