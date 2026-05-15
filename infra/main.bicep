targetScope = 'resourceGroup'

param location string = resourceGroup().location

var prefix = 'blue-swallow'

/*
 * Static Web App
 */
resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: '${prefix}-swa'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
}

/*
 * VM Public IP
 */
resource pip 'Microsoft.Network/publicIPAddresses@2023-04-01' = {
  name: '${prefix}-pip'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

/*
 * Network Security Group
 */
resource nsg 'Microsoft.Network/networkSecurityGroups@2023-04-01' = {
  name: '${prefix}-nsg'
  location: location
  properties: {
    securityRules: [
      {
        name: 'allow-http'
        properties: {
          priority: 1000
          protocol: 'Tcp'
          access: 'Allow'
          direction: 'Inbound'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '80'
        }
      }
      {
        name: 'allow-8080'
        properties: {
          priority: 1001
          protocol: 'Tcp'
          access: 'Allow'
          direction: 'Inbound'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '8080'
        }
      }
    ]
  }
}

/*
 * Virtual Network
 */
resource vnet 'Microsoft.Network/virtualNetworks@2023-04-01' = {
  name: '${prefix}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/16']
    }
    subnets: [
      {
        name: 'default'
        properties: {
          addressPrefix: '10.0.0.0/24'
          networkSecurityGroup: {
            id: nsg.id
          }
        }
      }
    ]
  }
}

/*
 * Network Interface
 */
resource nic 'Microsoft.Network/networkInterfaces@2023-04-01' = {
  name: '${prefix}-nic'
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig'
        properties: {
          subnet: {
            id: vnet.properties.subnets[0].id
          }
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: {
            id: pip.id
          }
        }
      }
    ]
  }
}

/*
 * VM
 */
resource vm 'Microsoft.Compute/virtualMachines@2023-03-01' = {
  name: '${prefix}-vm'
  location: location
  properties: {
    hardwareProfile: {
      vmSize: 'Standard_B1s'
    }
    osProfile: {
      computerName: '${prefix}-vm'
      adminUsername: 'azureuser'
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/azureuser/.ssh/authorized_keys'
              keyData: '<YOUR_SSH_PUBLIC_KEY>'
            }
          ]
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
        }
      ]
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
      }
    }
  }
}

/*
 * Output VM IP
 */
output backendEchoBaseUrl string = 'http://${pip.properties.ipAddress}:8080'
