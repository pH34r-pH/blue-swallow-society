targetScope = 'resourceGroup'

@description('Azure region for the SWA/VM/backend gateway resources.')
param location string = resourceGroup().location

@description('Azure region for PostgreSQL Flexible Server. Kept separate because some subscriptions restrict PostgreSQL provisioning in the VM/SWA region.')
param postgresLocation string = location

@description('Static Web App name. Must be unique within the subscription/region scope of SWA.')
param staticWebAppName string

@description('Resource name prefix used for VM and networking.')
param prefix string = 'blue-swallow'

@description('SSH public key for the VM admin user. Pass via parameter file or pipeline secret.')
@secure()
param sshPublicKey string

@description('CIDR allowed to reach SSH (22). Use your developer IP (e.g. 203.0.113.5/32); checked-in deployments deny public SSH by default.')
param allowedSourceIp string = '127.0.0.1/32'

@description('VM size. Cybermap defaults to Standard_B1ms; API-only/lab deployments may explicitly override to Standard_B1s.')
param vmSize string = 'Standard_B1ms'

@description('Set true to deploy an Azure OpenAI account alongside the rest of the stack.')
param deployOpenAi bool = false

@description('Daily auto-shutdown time for the VM (HHmm, 24h, in the schedule time zone).')
param autoShutdownTime string = '0200'

@description('IANA/Windows time zone ID used by the auto-shutdown schedule.')
param autoShutdownTimeZone string = 'Pacific Standard Time'

@description('Set true to keep daily VM auto-shutdown enabled. Leave false for hot-stack Cybermap validation.')
param enableAutoShutdown bool = false

@description('PostgreSQL Flexible Server name. Must be globally unique.')
param postgresServerName string = '${prefix}-pg'

@description('PostgreSQL database name for Cybermap/PostGIS state.')
param postgresDatabaseName string = 'cybermap'

@description('PostgreSQL administrator login used by the P0 migration runner/API service.')
param postgresAdministratorLogin string = 'bssadmin'

@secure()
@description('PostgreSQL administrator password. Pass via GitHub secret POSTGRES_ADMIN_PASSWORD.')
param postgresAdministratorLoginPassword string

@description('Lowest-tier PostgreSQL Flexible Server SKU for validation. Do not raise without explicit cost review.')
param postgresSkuName string = 'Standard_B1ms'

@description('Initial PostgreSQL storage size in GiB. Azure minimum is 32 GiB.')
param postgresStorageSizeGiB int = 32

@description('PostgreSQL backup retention days.')
param postgresBackupRetentionDays int = 7

@secure()
@description('Shared backend read token used by SWA Functions when proxying operator-only Cybermap viewport reads to the VM API.')
param cybermapReadToken string

@secure()
@description('Dedicated token used by the local autonomous paper engine and SWA to write/read the canonical VM paper-state snapshot.')
param paperStateToken string

@secure()
@description('Dedicated token used by the private morning-brief archive path between the scheduler, SWA, and VM API.')
param morningBriefToken string

@description('Public repository tarball used by the VM extension to install vm/cybermap-api.')
param cybermapSourceTarballUrl string = 'https://github.com/pH34r-pH/blue-swallow-society/archive/refs/heads/main.tar.gz'

@description('Opaque value used to force the VM Custom Script extension to re-run on each deployment.')
param cybermapDeploymentVersion string = utcNow()

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
var postgresVnetName = '${prefix}-pg-vnet'
var postgresPrivateDnsZoneName = '${prefix}.postgres.database.azure.com'

/*
 * Shared network topology for VM/API gateway and private PostgreSQL.
 */
module networkModule 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    postgresLocation: postgresLocation
    vnetName: vnetName
    postgresVnetName: postgresVnetName
    postgresPrivateDnsZoneName: postgresPrivateDnsZoneName
  }
}

/*
 * Low-cost managed PostgreSQL/PostGIS backend for Cybermap state.
 */
module postgresModule 'modules/postgres-flexible.bicep' = {
  name: 'postgres-flexible'
  params: {
    location: postgresLocation
    serverName: postgresServerName
    databaseName: postgresDatabaseName
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorLoginPassword
    skuName: postgresSkuName
    storageSizeGiB: postgresStorageSizeGiB
    backupRetentionDays: postgresBackupRetentionDays
    delegatedSubnetResourceId: networkModule.outputs.postgresSubnetId
    privateDnsZoneArmResourceId: networkModule.outputs.postgresPrivateDnsZoneId
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
    enableAutoShutdown: enableAutoShutdown
    vmSize: vmSize
    appSubnetId: networkModule.outputs.appSubnetId
    postgresServerFqdn: postgresModule.outputs.fullyQualifiedDomainName
    postgresDatabaseName: postgresModule.outputs.databaseName
    postgresAdministratorLogin: postgresAdministratorLogin
    postgresAdministratorLoginPassword: postgresAdministratorLoginPassword
    cybermapReadToken: cybermapReadToken
    paperStateToken: paperStateToken
    morningBriefToken: morningBriefToken
    cybermapSourceTarballUrl: cybermapSourceTarballUrl
    cybermapDeploymentVersion: cybermapDeploymentVersion
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

/*
 * Dedicated private storage for signed Wardriver releases. The public Blob
 * endpoint serves only short-lived, per-object SAS redirects after the
 * authenticated Functions gate; the container itself remains non-public.
 */
module wardriverReleaseStorage 'modules/wardriver-release-storage.bicep' = {
  name: 'wardriver-release-storage'
  params: {
    prefix: prefix
    location: location
  }
}

output staticWebAppDefaultHostname string = swa.properties.defaultHostname
output staticWebAppResourceId string = swa.id
output backendEchoBaseUrl string = vmModule.outputs.backendEchoBaseUrl
output backendCybermapBaseUrl string = vmModule.outputs.backendCybermapBaseUrl
output vmPublicIp string = vmModule.outputs.publicIpAddress
output vnetId string = networkModule.outputs.vnetId
output postgresVnetId string = networkModule.outputs.postgresVnetId
output appSubnetId string = networkModule.outputs.appSubnetId
output postgresSubnetId string = networkModule.outputs.postgresSubnetId
output postgresPrivateDnsZoneId string = networkModule.outputs.postgresPrivateDnsZoneId
output postgresPrivateDnsZoneName string = networkModule.outputs.postgresPrivateDnsZoneName
output postgresPrivateDnsZoneVirtualNetworkLinkId string = networkModule.outputs.postgresPrivateDnsZoneVirtualNetworkLinkId
output postgresServerName string = postgresModule.outputs.serverName
output postgresServerFqdn string = postgresModule.outputs.fullyQualifiedDomainName
output postgresDatabaseName string = postgresModule.outputs.databaseName
output postgresSkuName string = postgresModule.outputs.skuName
output postgresStorageSizeGiB int = postgresModule.outputs.storageSizeGiB
output postgresGeoRedundantBackup string = postgresModule.outputs.geoRedundantBackup
output wardriverReleaseStorageAccountName string = wardriverReleaseStorage.outputs.storageAccountName
output wardriverReleaseContainerName string = wardriverReleaseStorage.outputs.releaseContainerName
output postgresHighAvailabilityMode string = postgresModule.outputs.highAvailabilityMode
output openAiDeployed bool = deployOpenAi
output openAiEndpoint string = deployOpenAi ? openAiModule!.outputs.endpoint : ''
