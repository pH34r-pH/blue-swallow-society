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

@description('CIDR allowed to reach SSH (22) and echo (8080). Use your dev IP (e.g. 203.0.113.5/32). Default "*" is wide open.')
param allowedSourceIp string = '*'

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

@description('Public repository tarball used by the VM extension to install vm/cybermap-api.')
param cybermapSourceTarballUrl string = 'https://github.com/pH34r-pH/blue-swallow-society/archive/refs/heads/main.tar.gz'

@description('Port exposed by the Cybermap API on the VM. SWA Functions proxy to this port.')
param cybermapApiPort int = 8080

@description('Opaque value used to force the VM Custom Script extension to re-run on each deployment.')
param cybermapDeploymentVersion string = utcNow()

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

var cybermapInstallScriptTemplate = loadTextContent('scripts/install-cybermap-api.sh')
var cybermapInstallScript = replace(
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
)

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
output backendEchoBaseUrl string = 'http://${pip.properties.ipAddress}:8080'
output backendCybermapBaseUrl string = 'http://${pip.properties.ipAddress}:${cybermapApiPort}'
