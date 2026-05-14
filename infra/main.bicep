targetScope = 'subscription'

@description('Azure region for the deployment')
param location string = 'westus2'

@description('Resource group name for the personal site')
param resourceGroupName string = 'rg-personal-site-demo'

@description('Name of the Static Web App resource')
param staticWebAppName string = 'personal-site-demo'

@description('Tags applied to resources')
param tags object = {
  owner: 'personal'
  workload: 'personal-site'
  environment: 'dev'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: { name: 'Standard' tier: 'Standard' }
  tags: tags
  properties: {
    allowConfigFileUpdates: true
    repositoryUrl: ''
    branch: 'main'
    provider: 'GitHub'
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

output staticWebAppName string = staticSite.name
output resourceGroupName string = rg.name
