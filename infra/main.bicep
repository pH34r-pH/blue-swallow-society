targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Static Web App name. Must be unique within the subscription/region scope of SWA.')
param staticWebAppName string

@description('Resource name prefix used for VM and networking.')
param prefix string = 'blue-swallow'

@description('SSH public key for the VM admin user. Pass via parameter file or pipeline secret.')
@secure()
param sshPublicKey string

@description('CIDR allowed to reach SSH (22) and the echo port (8080). Use your developer IP (e.g. 203.0.113.5/32). Default "*" is wide open — only acceptable for short-lived experiments.')
param allowedSourceIp string = '*'

@description('VM size. Cybermap defaults to Standard_B1ms; API-only/lab deployments may explicitly override to Standard_B1s.')
param vmSize string = 'Standard_B1ms'

@description('PostgreSQL Flexible Server name. Leave empty to derive from prefix plus -pg.')
param postgresServerName string = ''

@description('Cybermap application database name created on PostgreSQL.')
param postgresDatabaseName string = 'cybermap'

@description('Password-auth PostgreSQL administrator login. Output is non-secret; password is never output.')
param postgresAdministratorLogin string = 'cybermapadmin'

@secure()
@description('PostgreSQL administrator password. Pass via pipeline or local secret parameter; do not commit it to parameter files.')
param postgresAdministratorPassword string

@description('PostgreSQL major version for the Cybermap/PostGIS datastore.')
param postgresVersion string = '16'

@description('Set true to deploy an Azure OpenAI account alongside the rest of the stack.')
param deployOpenAi bool = false

@description('Daily auto-shutdown time for the VM (HHmm, 24h, in the schedule time zone).')
param autoShutdownTime string = '0200'

@description('IANA/Windows time zone ID used by the auto-shutdown schedule.')
param autoShutdownTimeZone string = 'Pacific Standard Time'

/*
 * Static Web App (Standard SKU so we can use app settings + linked APIs)
 */
resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {}
  tags: {
    project: 'blue-swallow-society'
  }
}

var vnetName = '${prefix}-vm-vnet'
var postgresPrivateDnsZoneName = '${prefix}.postgres.database.azure.com'
var effectivePostgresServerName = empty(postgresServerName) ? '${prefix}-pg' : postgresServerName

/*
 * Shared network topology for VM/API gateway and private PostgreSQL.
 */
module networkModule 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    vnetName: vnetName
    postgresPrivateDnsZoneName: postgresPrivateDnsZoneName
  }
}

/*
 * Private PostgreSQL Flexible Server datastore for Cybermap/PostGIS.
 */
module postgresModule 'modules/postgres-flexible.bicep' = {
  name: 'postgres-flexible'
  params: {
    location: location
    serverName: effectivePostgresServerName
    databaseName: postgresDatabaseName
    postgresqlVersion: postgresVersion
    administratorLogin: postgresAdministratorLogin
    administratorPassword: postgresAdministratorPassword
    postgresSubnetId: networkModule.outputs.postgresSubnetId
    privateDnsZoneId: networkModule.outputs.postgresPrivateDnsZoneId
  }
}

/*
 * VM consumes the shared app subnet; it no longer creates an isolated VNet.
 */
module vmModule 'vm-echo-lab.bicep' = {
  name: 'vm-echo-lab'
  params: {
    location: location
    vmName: '${prefix}-vm'
    sshPublicKey: sshPublicKey
    allowedSourceIp: allowedSourceIp
    autoShutdownTime: autoShutdownTime
    autoShutdownTimeZone: autoShutdownTimeZone
    vmSize: vmSize
    appSubnetId: networkModule.outputs.appSubnetId
  }
}

/*
 * Optional Azure OpenAI account — only deployed when deployOpenAi=true.
 */
module openAiModule 'modules/openai.bicep' = if (deployOpenAi) {
  name: 'openai'
  params: {
    name: '${prefix}-openai'
    location: location
  }
}

output staticWebAppDefaultHostname string = swa.properties.defaultHostname
output staticWebAppResourceId string = swa.id
output backendEchoBaseUrl string = vmModule.outputs.backendEchoBaseUrl
output vmPublicIp string = vmModule.outputs.publicIpAddress
output vnetId string = networkModule.outputs.vnetId
output appSubnetId string = networkModule.outputs.appSubnetId
output postgresSubnetId string = networkModule.outputs.postgresSubnetId
output postgresPrivateDnsZoneId string = networkModule.outputs.postgresPrivateDnsZoneId
output postgresPrivateDnsZoneName string = networkModule.outputs.postgresPrivateDnsZoneName
output postgresPrivateDnsZoneVirtualNetworkLinkId string = networkModule.outputs.postgresPrivateDnsZoneVirtualNetworkLinkId
output postgresServerName string = postgresModule.outputs.serverName
output postgresHostName string = postgresModule.outputs.hostName
output postgresPort int = postgresModule.outputs.port
output postgresDatabaseName string = postgresModule.outputs.databaseName
output postgresAdministratorLogin string = postgresModule.outputs.administratorLogin
output openAiDeployed bool = deployOpenAi
output openAiEndpoint string = deployOpenAi ? openAiModule!.outputs.endpoint : ''
