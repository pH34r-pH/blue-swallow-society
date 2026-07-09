targetScope = 'resourceGroup'

@description('Name of the existing Static Web App.')
param staticWebAppName string

@description('Azure DNS zone name.')
param dnsZoneName string

@description('The TXT validation token emitted by the custom-domain deployment.')
param apexValidationToken string

@description('The Static Web App default hostname.')
param staticWebAppDefaultHostname string

resource swa 'Microsoft.Web/staticSites@2023-01-01' existing = {
  name: staticWebAppName
}

resource dnsZone 'Microsoft.Network/dnsZones@2018-05-01' existing = {
  name: dnsZoneName
}

resource apexTxtRecord 'Microsoft.Network/dnsZones/TXT@2018-05-01' = {
  parent: dnsZone
  name: '@'
  properties: {
    TTL: 300
    TXTRecords: [
      {
        value: [apexValidationToken]
      }
    ]
  }
}

resource wwwCnameRecord 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = {
  parent: dnsZone
  name: 'www'
  properties: {
    TTL: 300
    CNAMERecord: {
      cname: staticWebAppDefaultHostname
    }
  }
}

resource apexAliasRecord 'Microsoft.Network/dnsZones/A@2018-05-01' = {
  parent: dnsZone
  name: '@'
  properties: {
    TTL: 300
    targetResource: {
      id: swa.id
    }
  }
}

output apexTxtRecordName string = apexTxtRecord.name
output wwwRecordName string = wwwCnameRecord.name
output apexAliasRecordName string = apexAliasRecord.name
