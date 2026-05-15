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

@description('VM size. Keep this small for experimentation.')
param vmSize string = 'Standard_B1s'

@description('CIDR allowed to reach SSH (22) and echo (8080). Use your dev IP (e.g. 203.0.113.5/32). Default "*" is wide open.')
param allowedSourceIp string = '*'

@description('Daily auto-shutdown time for the VM (HHmm, 24h).')
param autoShutdownTime string = '0200'

@description('Time zone for the auto-shutdown schedule (Windows ID, e.g. "Pacific Standard Time").')
param autoShutdownTimeZone string = 'Pacific Standard Time'

var cloudInit = '''#cloud-config
package_update: true
write_files:
  - path: /opt/echo/echo_server.py
    permissions: '0755'
    content: |
      from http.server import BaseHTTPRequestHandler, HTTPServer
      from urllib.parse import urlparse, parse_qs
      import json, socket

      class Handler(BaseHTTPRequestHandler):
          def do_GET(self):
              parsed = urlparse(self.path)
              if parsed.path != '/echo':
                  self.send_response(404)
                  self.send_header('Content-Type', 'application/json')
                  self.end_headers()
                  self.wfile.write(json.dumps({'ok': False, 'error': 'Not found'}).encode())
                  return
              query = parse_qs(parsed.query)
              msg = query.get('msg', [''])[0]
              body = {
                  'ok': True,
                  'echo': msg,
                  'host': socket.gethostname(),
                  'path': parsed.path,
                  'query': query
              }
              payload = json.dumps(body).encode()
              self.send_response(200)
              self.send_header('Content-Type', 'application/json')
              self.send_header('Content-Length', str(len(payload)))
              self.end_headers()
              self.wfile.write(payload)

      HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
  - path: /etc/systemd/system/echo-server.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Simple Echo Server
      After=network.target

      [Service]
      Type=simple
      ExecStart=/usr/bin/python3 /opt/echo/echo_server.py
      Restart=always
      RestartSec=3

      [Install]
      WantedBy=multi-user.target
runcmd:
  - mkdir -p /opt/echo
  - systemctl daemon-reload
  - systemctl enable echo-server.service
  - systemctl start echo-server.service
'''

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: '${vmName}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.40.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'default'
        properties: {
          addressPrefix: '10.40.0.0/24'
        }
      }
    ]
  }
}

resource pip 'Microsoft.Network/publicIPAddresses@2024-01-01' = {
  name: '${vmName}-pip'
  location: location
  sku: { name: 'Standard' }
  properties: { publicIPAllocationMethod: 'Static' }
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
        name: 'allow-echo'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '8080'
          sourceAddressPrefix: allowedSourceIp
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1010
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
          subnet: { id: vnet.properties.subnets[0].id }
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
      customData: base64(cloudInit)
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

/*
 * Daily auto-shutdown to cap cost. Notification disabled — purely best-effort.
 */
resource autoShutdown 'Microsoft.DevTestLab/schedules@2018-09-15' = {
  name: 'shutdown-computevm-${vmName}'
  location: location
  properties: {
    status: 'Enabled'
    taskType: 'ComputeVmShutdownTask'
    dailyRecurrence: {
      time: autoShutdownTime
    }
    timeZoneId: autoShutdownTimeZone
    notificationSettings: {
      status: 'Disabled'
      timeInMinutes: 30
    }
    targetResourceId: vm.id
  }
}

output publicIpAddress string = pip.properties.ipAddress
output backendEchoBaseUrl string = 'http://${pip.properties.ipAddress}:8080'
