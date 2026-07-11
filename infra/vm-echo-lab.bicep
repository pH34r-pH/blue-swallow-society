targetScope = 'resourceGroup'

@description('Azure region for the Cybermap VM API gateway.')
param location string = resourceGroup().location

@description('Virtual machine name')
param vmName string = 'blue-swallow-vm'

@description('Admin username')
param adminUsername string = 'azureuser'

@secure()
@description('SSH public key for the VM user')
param sshPublicKey string

@description('VM size. Cybermap defaults to Standard_B1ms; API-only/lab deployments may explicitly override to Standard_B1s.')
param vmSize string = 'Standard_B1ms'

@description('Resource ID of the shared app subnet used by the VM/API gateway.')
param appSubnetId string

@description('CIDR allowed to reach SSH (22). Cybermap product ingress is HTTPS 443 and is protected by API authentication/rate-limit hooks.')
param allowedSourceIp string = '*'

@description('Daily auto-shutdown time for the VM (HHmm, 24h).')
param autoShutdownTime string = '0200'

@description('Time zone for the auto-shutdown schedule (Windows ID, e.g. "Pacific Standard Time").')
param autoShutdownTimeZone string = 'Pacific Standard Time'

var cybermapApiPackage = loadTextContent('../vm/cybermap-api/package.json')
var cybermapApiServer = loadTextContent('../vm/cybermap-api/server.mjs')
var cybermapApiAuth = loadTextContent('../vm/cybermap-api/auth.mjs')
var cybermapApiSourceRegistry = loadTextContent('../vm/cybermap-api/source-registry.mjs')
var cybermapApiRead = loadTextContent('../vm/cybermap-api/cybermap-read.mjs')
var cybermapApiRateLimit = loadTextContent('../vm/cybermap-api/rate-limit.mjs')
var cybermapApiDb = loadTextContent('../vm/cybermap-api/db.mjs')
var cybermapApiMigrate = loadTextContent('../vm/cybermap-api/migrate.mjs')
var cybermapCoreMigration = loadTextContent('../vm/cybermap-api/db/migrations/0001_cybermap_core.sql')
var cybermapAuthMigration = loadTextContent('../vm/cybermap-api/db/migrations/0002_cybermap_auth_registry.sql')
var cybermapCellsProvenanceMigration = loadTextContent('../vm/cybermap-api/db/migrations/0003_cybermap_cells_provenance.sql')
var cybermapWorkerPackage = loadTextContent('../vm/cybermap-worker/package.json')
var cybermapWorkerSource = loadTextContent('../vm/cybermap-worker/worker.mjs')
var cybermapWorkerCellMaterialization = loadTextContent('../vm/cybermap-worker/cell-materialization.mjs')

#disable-next-line prefer-interpolation
var cloudInit = concat(
  '''#cloud-config
package_update: true
packages:
  - ca-certificates
  - curl
  - gnupg
  - nginx
  - openssl
  - pgbouncer
write_files:
  - path: /opt/cybermap-api/package.json
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapApiPackage),
  '''
  - path: /opt/cybermap-api/server.mjs
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapApiServer),
  '''
  - path: /opt/cybermap-api/auth.mjs
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapApiAuth),
  '''
  - path: /opt/cybermap-api/source-registry.mjs
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapApiSourceRegistry),
  '''
  - path: /opt/cybermap-api/cybermap-read.mjs
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapApiRead),
  '''
  - path: /opt/cybermap-api/rate-limit.mjs
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapApiRateLimit),
  '''
  - path: /opt/cybermap-api/db.mjs
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapApiDb),
  '''
  - path: /opt/cybermap-api/migrate.mjs
    permissions: '0755'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapApiMigrate),
  '''
  - path: /opt/cybermap-api/db/migrations/0001_cybermap_core.sql
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapCoreMigration),
  '''
  - path: /opt/cybermap-api/db/migrations/0002_cybermap_auth_registry.sql
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapAuthMigration),
  '''
  - path: /opt/cybermap-api/db/migrations/0003_cybermap_cells_provenance.sql
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapCellsProvenanceMigration),
  '''
  - path: /opt/cybermap-worker/package.json
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapWorkerPackage),
  '''
  - path: /opt/cybermap-worker/worker.mjs
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapWorkerSource),
  '''
  - path: /opt/cybermap-worker/cell-materialization.mjs
    permissions: '0644'
    defer: true
    encoding: b64
    content: ''',
  base64(cybermapWorkerCellMaterialization),
  '''
  - path: /etc/cybermap-api.env
    permissions: '0640'
    defer: true
    content: |
      # Operator-managed Cybermap API settings. Do not commit credentials.
      # CYBERMAP_DATABASE_URL should normally point at local PgBouncer, not directly at Flexible Server.
      # CYBERMAP_DATABASE_URL=postgresql://cybermap:***@127.0.0.1:6432/cybermap
      CYBERMAP_DB_POOL_MAX=5
      CYBERMAP_DB_CONNECT_TIMEOUT_MS=3000
      CYBERMAP_DB_IDLE_TIMEOUT_MS=10000
      CYBERMAP_EXPECTED_MIGRATION=0003_cybermap_cells_provenance
  - path: /opt/cybermap-api/README.runtime.md
    permissions: '0644'
    defer: true
    content: |
      Runtime env is loaded from /etc/cybermap-api.env. Required DB setting: CYBERMAP_DATABASE_URL. Readiness fails closed when it is absent.
  - path: /etc/systemd/system/cybermap-api.service
    permissions: '0644'
    defer: true
    content: |
      [Unit]
      Description=Blue Swallow Cybermap API gateway
      After=network-online.target
      Wants=network-online.target

      [Service]
      Type=simple
      User=cybermap
      Group=cybermap
      WorkingDirectory=/opt/cybermap-api
      Environment=CYBERMAP_API_HOST=127.0.0.1
      Environment=CYBERMAP_API_PORT=8000
      Environment=CYBERMAP_BODY_LIMIT_BYTES=1048576
      Environment=CYBERMAP_DB_POOL_MAX=5
      Environment=CYBERMAP_DB_CONNECT_TIMEOUT_MS=3000
      Environment=CYBERMAP_EXPECTED_MIGRATION=0003_cybermap_cells_provenance
      EnvironmentFile=-/etc/cybermap-api.env
      ExecStartPre=/usr/bin/node /opt/cybermap-api/migrate.mjs --if-configured
      ExecStart=/usr/bin/node /opt/cybermap-api/server.mjs
      Restart=always
      RestartSec=3
      NoNewPrivileges=true
      PrivateTmp=true
      ProtectSystem=strict
      ProtectHome=true
      ReadWritePaths=/var/log/cybermap

      [Install]
      WantedBy=multi-user.target
  - path: /etc/systemd/system/cybermap-worker.service
    permissions: '0644'
    defer: true
    content: |
      [Unit]
      Description=Blue Swallow Cybermap worker
      After=network-online.target cybermap-api.service
      Wants=network-online.target

      [Service]
      Type=simple
      User=cybermap
      Group=cybermap
      WorkingDirectory=/opt/cybermap-worker
      Environment=CYBERMAP_WORKER_POLL_INTERVAL_MS=60000
      EnvironmentFile=-/etc/cybermap-api.env
      EnvironmentFile=-/etc/cybermap-worker.env
      ExecStart=/usr/bin/node /opt/cybermap-worker/worker.mjs
      Restart=always
      RestartSec=5
      NoNewPrivileges=true
      PrivateTmp=true
      ProtectSystem=strict
      ProtectHome=true
      ReadWritePaths=/var/log/cybermap

      [Install]
      WantedBy=multi-user.target
  - path: /etc/nginx/sites-available/cybermap-api
    permissions: '0644'
    defer: true
    content: |
      server {
        listen 443 ssl http2 default_server;
        listen [::]:443 ssl http2 default_server;
        server_name _;

        ssl_certificate /etc/nginx/ssl/cybermap-api.crt;
        ssl_certificate_key /etc/nginx/ssl/cybermap-api.key;
        client_max_body_size 1m;

        location / {
          proxy_pass http://127.0.0.1:8000;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $remote_addr;
          proxy_set_header X-Forwarded-Proto https;
          proxy_set_header X-Request-Id $request_id;
        }
      }
  - path: /etc/pgbouncer/pgbouncer.ini
    permissions: '0640'
    defer: true
    content: |
      [databases]
      ; Operator-managed placeholder. No DB credentials are committed by cloud-init.
      ; After PostgreSQL Flexible Server exists, inject private host/user secrets and enable pgbouncer.
      ; cybermap = host=<private-postgres-host> port=5432 dbname=cybermap auth_user=cybermap

      [pgbouncer]
      listen_addr = 127.0.0.1
      listen_port = 6432
      auth_type = scram-sha-256
      auth_file = /etc/pgbouncer/userlist.txt
      pool_mode = transaction
      max_client_conn = 50
      default_pool_size = 5
      reserve_pool_size = 2
      server_reset_query = DISCARD ALL
  - path: /etc/pgbouncer/userlist.txt
    permissions: '0640'
    defer: true
    content: |
      ; Operator-managed. Do not commit or cloud-init database credentials.
runcmd:
  - mkdir -p /opt/cybermap-api/db/migrations /opt/cybermap-worker /etc/nginx/ssl /var/log/cybermap
  - useradd --system --home-dir /opt/cybermap-api --shell /usr/sbin/nologin cybermap || true
  - chown -R cybermap:cybermap /opt/cybermap-api /opt/cybermap-worker /var/log/cybermap
  - chown root:cybermap /etc/cybermap-api.env /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/userlist.txt
  - chmod 0640 /etc/cybermap-api.env /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/userlist.txt
  # NodeSource Node.js 20 bootstrap for Ubuntu 22.04.
  - curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  - apt-get install -y nodejs
  - cd /opt/cybermap-api && npm install --omit=dev --ignore-scripts
  - cd /opt/cybermap-worker && npm install --omit=dev --ignore-scripts
  - openssl req -x509 -nodes -newkey rsa:2048 -days 90 -keyout /etc/nginx/ssl/cybermap-api.key -out /etc/nginx/ssl/cybermap-api.crt -subj "/CN=cybermap-api.local"
  - ln -sf /etc/nginx/sites-available/cybermap-api /etc/nginx/sites-enabled/cybermap-api
  - rm -f /etc/nginx/sites-enabled/default
  - nginx -t
  - systemctl daemon-reload
  - systemctl enable --now cybermap-api.service
  - systemctl enable --now cybermap-worker.service
  - systemctl enable --now nginx
  - systemctl disable --now pgbouncer || true
'''
)


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
        name: 'allow-https'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
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

/*
 * Daily auto-shutdown to cap cost. notificationSettings is intentionally
 * omitted — when status=Disabled the 2018-09-15 API can reject partially
 * populated notification blocks with InvalidParameter.
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
    targetResourceId: vm.id
  }
}

output publicIpAddress string = pip.properties.ipAddress
output backendApiBaseUrl string = 'https://${pip.properties.ipAddress}'
