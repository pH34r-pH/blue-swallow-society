targetScope = 'resourceGroup'

@description('Azure region for the VM lab')
param location string = resourceGroup().location

@description('Virtual machine name')
param vmName string = 'vm-echo-lab'

@description('Admin username')
param adminUsername string = 'azureuser'

@secure()
@description('SSH public key for the VM user')
param sshPublicKey string

@description('VM size. Cybermap defaults to Standard_B1ms; API-only/lab deployments may explicitly override to Standard_B1s.')
param vmSize string = 'Standard_B1ms'

@description('Resource ID of the shared app subnet used by the VM/API gateway.')
param appSubnetId string

@description('CIDR allowed to reach SSH (22). Use your dev IP (e.g. 203.0.113.5/32); the checked-in default is deny-by-default.')
param allowedSourceIp string = '127.0.0.1/32'

@description('Daily auto-shutdown time for the VM (HHmm, 24h).')
param autoShutdownTime string = '0200'

@description('Time zone for the auto-shutdown schedule (Windows ID, e.g. "Pacific Standard Time").')
param autoShutdownTimeZone string = 'Pacific Standard Time'

@description('Set true to keep the VM auto-shutdown schedule enabled. Cybermap hot-stack validation disables it.')
param enableAutoShutdown bool = false

@description('PostgreSQL Flexible Server FQDN for the Cybermap API.')
param postgresServerFqdn string

@description('PostgreSQL database name for the Cybermap API.')
param postgresDatabaseName string = 'cybermap'

@description('PostgreSQL administrator login used by the P0 Cybermap service and migration runner.')
param postgresAdministratorLogin string = 'bssadmin'

@secure()
@description('PostgreSQL administrator password. Passed into the VM extension as a protected setting.')
param postgresAdministratorLoginPassword string

@secure()
@description('Shared backend read token used by SWA Functions when proxying operator-only Cybermap viewport reads to the VM API.')
param cybermapReadToken string

@secure()
@description('Dedicated token for canonical autonomous paper-state writes and reads.')
param paperStateToken string

@secure()
@description('Dedicated token for private morning-brief archive reads and writes.')
param morningBriefToken string

@secure()
@description('Random loopback-only secret that Caddy injects after successful Wardriver mTLS verification.')
param mtlsProxySecret string

@secure()
@description('PEM public certificate used by Caddy to verify the Wardriver client certificate. Never pass a PFX or private key.')
param wardriverMtlsTrustCertificatePem string

@description('Full immutable Git commit that identifies the Cybermap VM source archive.')
param cybermapSourceRevision string

@description('Immutable full-commit GitHub archive used by the VM extension to install vm/cybermap-api.')
param cybermapSourceTarballUrl string

@description('SHA-256 digest of the exact Cybermap archive. The VM verifies it before extraction or migration.')
param cybermapSourceTarballSha256 string

@description('Loopback-only Cybermap API port behind the HTTPS gateway.')
param cybermapApiPort int = 8080

@description('Globally unique Azure public DNS label used for the HTTPS backend gateway certificate.')
param backendDnsLabel string = toLower('${vmName}-${uniqueString(resourceGroup().id, location)}')

@description('Opaque value used to force the VM Custom Script extension to re-run on each deployment.')
param cybermapDeploymentVersion string = utcNow()

resource pip 'Microsoft.Network/publicIPAddresses@2024-01-01' = {
  name: '${vmName}-pip'
  location: location
  sku: { name: 'Standard' }
  properties: {
    publicIPAllocationMethod: 'Static'
    dnsSettings: {
      domainNameLabel: backendDnsLabel
    }
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-01-01' = {
  name: '${vmName}-nsg'
  location: location
  properties: {
    securityRules: [
      {
        name: 'allow-ssh'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '22'
          sourceAddressPrefix: allowedSourceIp
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1000
          direction: 'Inbound'
        }
      }
      {
        name: 'allow-http-acme'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1010
          direction: 'Inbound'
        }
      }
      {
        name: 'allow-wardriver-mtls'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '8443'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1030
          direction: 'Inbound'
        }
      }
      {
        name: 'allow-https-backend'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1020
          direction: 'Inbound'
        }
      }
    ]
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2024-01-01' = {
  name: '${vmName}-nic'
  location: location
  properties: {
    networkSecurityGroup: { id: nsg.id }
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: { id: appSubnetId }
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: { id: pip.id }
        }
      }
    ]
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: vmName
  location: location
  properties: {
    hardwareProfile: { vmSize: vmSize }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: sshPublicKey
            }
          ]
        }
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: { storageAccountType: 'Standard_LRS' }
      }
    }
    networkProfile: {
      networkInterfaces: [ { id: nic.id } ]
    }
  }
}

var cybermapInstallScriptTemplate = loadTextContent('scripts/install-cybermap-api.sh')
var backendFqdn = pip.properties.dnsSettings.fqdn
var cybermapInstallScriptWithoutPaperToken = replace(
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                cybermapInstallScriptTemplate,
                '__POSTGRES_PASSWORD_B64__',
                base64(postgresAdministratorLoginPassword)
              ),
              '__CYBERMAP_READ_TOKEN_B64__',
              base64(cybermapReadToken)
            ),
            '__CYBERMAP_SOURCE_TARBALL_URL__',
            cybermapSourceTarballUrl
          ),
          '__POSTGRES_SERVER_FQDN__',
          postgresServerFqdn
        ),
        '__POSTGRES_DATABASE_NAME__',
        postgresDatabaseName
      ),
      '__POSTGRES_ADMINISTRATOR_LOGIN__',
      postgresAdministratorLogin
    ),
    '__CYBERMAP_API_PORT__',
    string(cybermapApiPort)
  ),
  '__BACKEND_FQDN__',
  backendFqdn
)
var cybermapInstallScriptWithPaperToken = replace(
  cybermapInstallScriptWithoutPaperToken,
  '__PAPER_STATE_TOKEN_B64__',
  base64(paperStateToken)
)
var cybermapInstallScriptWithMorningBriefToken = replace(
  cybermapInstallScriptWithPaperToken,
  '__MORNING_BRIEF_TOKEN_B64__',
  base64(morningBriefToken)
)
var cybermapInstallScriptWithMtlsProxySecret = replace(
  cybermapInstallScriptWithMorningBriefToken,
  '__BSS_MTLS_PROXY_SECRET_B64__',
  base64(mtlsProxySecret)
)
var cybermapInstallScriptWithSourceIdentity = replace(
  replace(
    replace(
      cybermapInstallScriptWithMtlsProxySecret,
      '__CYBERMAP_SOURCE_REVISION__',
      cybermapSourceRevision
    ),
    '__CYBERMAP_SOURCE_TARBALL_SHA256__',
    cybermapSourceTarballSha256
  ),
  '__WARDIVER_MTLS_TRUST_CERT_PEM_B64__',
  base64(wardriverMtlsTrustCertificatePem)
)
var cybermapInstallScript = cybermapInstallScriptWithSourceIdentity

resource cybermapApiExtension 'Microsoft.Compute/virtualMachines/extensions@2024-03-01' = {
  parent: vm
  name: 'install-cybermap-api'
  location: location
  properties: {
    publisher: 'Microsoft.Azure.Extensions'
    type: 'CustomScript'
    typeHandlerVersion: '2.1'
    autoUpgradeMinorVersion: true
    forceUpdateTag: cybermapDeploymentVersion
    settings: {}
    protectedSettings: {
      script: base64(cybermapInstallScript)
    }
  }
}

/*
 * Daily auto-shutdown to cap cost. notificationSettings is intentionally
 * omitted — when status=Disabled the 2018-09-15 API can reject partially
 * populated notification blocks with InvalidParameter.
 */
resource autoShutdown 'Microsoft.DevTestLab/schedules@2018-09-15' = {
  name: 'shutdown-computevm-${vmName}'
  location: location
  properties: {
    status: enableAutoShutdown ? 'Enabled' : 'Disabled'
    taskType: 'ComputeVmShutdownTask'
    dailyRecurrence: {
      time: autoShutdownTime
    }
    timeZoneId: autoShutdownTimeZone
    targetResourceId: vm.id
  }
}

output publicIpAddress string = pip.properties.ipAddress
output backendCybermapBaseUrl string = 'https://${backendFqdn}'
