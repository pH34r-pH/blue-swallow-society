targetScope = 'resourceGroup'

@description('Name of the existing Static Web App.')
param staticWebAppName string

@description('Resource group containing the existing Static Web App.')
param staticWebAppResourceGroup string = resourceGroup().name

@description('Canonical apex hostname.')
param apexHostname string = 'blueswallow.co.in'

@description('WWW hostname.')
param wwwHostname string = 'www.blueswallow.co.in'

@description('Azure DNS zone name.')
param dnsZoneName string = 'blueswallow.co.in'

@description('Resource group containing the Azure DNS zone.')
param dnsZoneResourceGroup string = resourceGroup().name

resource swa 'Microsoft.Web/staticSites@2023-01-01' existing = {
  name: staticWebAppName
  scope: resourceGroup(staticWebAppResourceGroup)
}

resource apexCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-11-01' = {
  parent: swa
  name: apexHostname
  properties: {
    validationMethod: 'dns-txt-token'
  }
}

module dnsRecords 'custom-domains-dns.bicep' = {
  name: 'dnsRecords'
  params: {
    staticWebAppName: staticWebAppName
    staticWebAppResourceGroup: staticWebAppResourceGroup
    dnsZoneName: dnsZoneName
    dnsZoneResourceGroup: dnsZoneResourceGroup
    apexValidationToken: apexCustomDomain.properties.validationToken
    staticWebAppDefaultHostname: swa.properties.defaultHostname
  }
  dependsOn: [
    apexCustomDomain
  ]
}

resource wwwCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-11-01' = {
  parent: swa
  name: wwwHostname
  properties: {
    validationMethod: 'cname-delegation'
  }
  dependsOn: [
    dnsRecords
  ]
}

output apexValidationToken string = apexCustomDomain.properties.validationToken
output staticWebAppDefaultHostname string = swa.properties.defaultHostname
output staticWebAppId string = swa.id
output wwwValidationStatus string = wwwCustomDomain.properties.status
