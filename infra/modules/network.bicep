targetScope = 'resourceGroup'

@description('Azure region for SWA/VM/backend gateway network resources.')
param location string = resourceGroup().location

@description('Azure region for the PostgreSQL delegated VNet. Can differ from location when PostgreSQL provisioning is restricted in the VM region.')
param postgresLocation string = location

@description('Virtual network name. Defaults from main.bicep to the existing VM lab VNet name so refactors do not create a second VM VNet.')
param vnetName string

@description('Virtual network address space for the VM/API gateway.')
param vnetAddressPrefix string = '10.40.0.0/16'

@description('Subnet name for the VM/API gateway. Defaults to the existing lab subnet name so repeat deployments do not move the NIC off the live subnet.')
param appSubnetName string = 'default'

@description('Subnet CIDR for the VM/API gateway.')
param appSubnetAddressPrefix string = '10.40.0.0/24'

@description('Legacy PostgreSQL subnet retained in the VM VNet so incremental deployments do not delete previously-created subnet state.')
param legacyPostgresSubnetName string = 'postgres-subnet'

@description('Legacy PostgreSQL subnet CIDR retained in the VM VNet.')
param legacyPostgresSubnetAddressPrefix string = '10.40.1.0/28'

@description('PostgreSQL private-access VNet name. Uses a separate address space so it can peer with the existing VM VNet across Azure regions.')
param postgresVnetName string

@description('PostgreSQL private-access VNet address space.')
param postgresVnetAddressPrefix string = '10.41.0.0/16'

@description('Subnet name delegated to Azure Database for PostgreSQL Flexible Server in the PostgreSQL VNet.')
param postgresSubnetName string = 'postgres-subnet'

@description('Subnet CIDR delegated to Azure Database for PostgreSQL Flexible Server in the PostgreSQL VNet.')
param postgresSubnetAddressPrefix string = '10.41.0.0/28'

@description('Private DNS zone used by Azure Database for PostgreSQL Flexible Server private access. Azure requires private-access zones to end with .postgres.database.azure.com.')
param postgresPrivateDnsZoneName string = 'cybermap.postgres.database.azure.com'

resource appVnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
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
        name: legacyPostgresSubnetName
        properties: {
          addressPrefix: legacyPostgresSubnetAddressPrefix
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

resource postgresVnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: postgresVnetName
  location: postgresLocation
  properties: {
    addressSpace: {
      addressPrefixes: [
        postgresVnetAddressPrefix
      ]
    }
    subnets: [
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

resource appVnetPostgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: postgresPrivateDnsZone
  name: '${vnetName}-postgres-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: appVnet.id
    }
  }
}

resource postgresVnetDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: postgresPrivateDnsZone
  name: '${postgresVnetName}-postgres-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: postgresVnet.id
    }
  }
}

resource appToPostgresPeering 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2024-01-01' = {
  parent: appVnet
  name: 'peer-${postgresVnetName}'
  properties: {
    allowForwardedTraffic: false
    allowGatewayTransit: false
    allowVirtualNetworkAccess: true
    remoteVirtualNetwork: {
      id: postgresVnet.id
    }
    useRemoteGateways: false
  }
}

resource postgresToAppPeering 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2024-01-01' = {
  parent: postgresVnet
  name: 'peer-${vnetName}'
  properties: {
    allowForwardedTraffic: false
    allowGatewayTransit: false
    allowVirtualNetworkAccess: true
    remoteVirtualNetwork: {
      id: appVnet.id
    }
    useRemoteGateways: false
  }
}

output vnetId string = appVnet.id
output postgresVnetId string = postgresVnet.id
output appSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, appSubnetName)
output postgresSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', postgresVnetName, postgresSubnetName)
output postgresPrivateDnsZoneId string = postgresPrivateDnsZone.id
output postgresPrivateDnsZoneName string = postgresPrivateDnsZone.name
output postgresPrivateDnsZoneVirtualNetworkLinkId string = appVnetPostgresDnsLink.id
output postgresPrivateDnsZonePostgresVirtualNetworkLinkId string = postgresVnetDnsLink.id
output appToPostgresPeeringId string = appToPostgresPeering.id
output postgresToAppPeeringId string = postgresToAppPeering.id
