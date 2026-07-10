targetScope = 'resourceGroup'

@description('Azure region for network resources.')
param location string = resourceGroup().location

@description('Virtual network name. Defaults from main.bicep to the existing VM lab VNet name so refactors do not create a second VNet.')
param vnetName string

@description('Virtual network address space for the Cybermap backend.')
param vnetAddressPrefix string = '10.40.0.0/16'

@description('Subnet name for the VM/API gateway.')
param appSubnetName string = 'app-subnet'

@description('Subnet CIDR for the VM/API gateway.')
param appSubnetAddressPrefix string = '10.40.0.0/24'

@description('Subnet name delegated to Azure Database for PostgreSQL Flexible Server.')
param postgresSubnetName string = 'postgres-subnet'

@description('Subnet CIDR delegated to Azure Database for PostgreSQL Flexible Server.')
param postgresSubnetAddressPrefix string = '10.40.1.0/28'

@description('Private DNS zone used by Azure Database for PostgreSQL Flexible Server private access. Azure requires private-access zones to end with .postgres.database.azure.com.')
param postgresPrivateDnsZoneName string = 'cybermap.postgres.database.azure.com'

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        vnetAddressPrefix
      ]
    }
    subnets: [
      {
        name: appSubnetName
        properties: {
          addressPrefix: appSubnetAddressPrefix
        }
      }
      {
        name: postgresSubnetName
        properties: {
          addressPrefix: postgresSubnetAddressPrefix
          delegations: [
            {
              name: 'postgres-flexible-server-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

resource postgresPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: postgresPrivateDnsZoneName
  location: 'global'
}

resource postgresPrivateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: postgresPrivateDnsZone
  name: '${vnetName}-postgres-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

output vnetId string = vnet.id
output appSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, appSubnetName)
output postgresSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, postgresSubnetName)
output postgresPrivateDnsZoneId string = postgresPrivateDnsZone.id
output postgresPrivateDnsZoneName string = postgresPrivateDnsZone.name
output postgresPrivateDnsZoneVirtualNetworkLinkId string = postgresPrivateDnsZoneVnetLink.id
