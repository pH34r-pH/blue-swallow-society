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
}

/*
 * VM + networking via shared module — single source of truth for the echo lab.
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
output backendEchoBaseUrl string = vmModule.outputs.backendEchoBaseUrl
output vmPublicIp string = vmModule.outputs.publicIpAddress
output openAiDeployed bool = deployOpenAi
