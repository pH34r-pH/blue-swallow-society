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

var cloudInit = '''#cloud-config
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
    content: |
      {"name":"cybermap-api","version":"0.1.0","private":true,"type":"module","scripts":{"start":"node server.mjs"},"engines":{"node":">=20"}}
  - path: /opt/cybermap-api/server.mjs
    permissions: '0644'
    defer: true
    content: |
      import http from 'node:http';
      import { randomUUID } from 'node:crypto';

      const host = process.env.CYBERMAP_API_HOST || '127.0.0.1';
      const port = Number.parseInt(process.env.CYBERMAP_API_PORT || '8000', 10);
      const authTokens = [process.env.CYBERMAP_API_TOKEN, process.env.CYBERMAP_API_TOKENS, process.env.BLUE_SWALLOW_OPERATOR_TOKEN].filter(Boolean).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
      const bodyLimitBytes = Number.parseInt(process.env.CYBERMAP_BODY_LIMIT_BYTES || '1048576', 10);
      const rateLimitHook = async () => ({allowed:true});

      function send(res, statusCode, requestId, body) {
        const payload = JSON.stringify(body);
        res.writeHead(statusCode, {'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(payload),'Cache-Control':'no-store','X-Request-Id':requestId});
        res.end(payload);
      }

      function bearer(req) {
        const authorization = req.headers.authorization || '';
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        return (match && match[1]) || req.headers['x-blue-swallow-operator-token'] || req.headers['x-cybermap-token'] || '';
      }

      const server = http.createServer(async (req, res) => {
        const startedAt = Date.now();
        const requestId = req.headers['x-request-id'] || randomUUID();
        const url = new URL(req.url || '/', 'http://localhost');
        res.on('finish', () => console.log(JSON.stringify({service:'cybermap-api',structured:true,requestId,method:req.method,path:url.pathname,statusCode:res.statusCode,durationMs:Date.now() - startedAt})));

        const rateLimitDecision = await rateLimitHook({req,requestId,path:url.pathname});
        if (rateLimitDecision?.allowed === false) {
          send(res, 429, requestId, {ok:false,error:{code:'rate_limited',message:rateLimitDecision.message || 'Request rejected by rate limit hook.'}});
          return;
        }

        if (req.method === 'GET' && url.pathname === '/healthz') {
          send(res, 200, requestId, {ok:true,service:'cybermap-api',version:'0.1.0',time:new Date().toISOString()});
          return;
        }

        if (req.method === 'GET' && url.pathname === '/readyz') {
          send(res, 503, requestId, {ok:false,service:'cybermap-api',dependencies:{postgres:{status:'pending-db-task',detail:'Readiness becomes DB-backed in the database connection task.'}}});
          return;
        }

        if (url.pathname.startsWith('/api/v1/')) {
          const token = bearer(req);
          if (!authTokens.length) {
            send(res, 503, requestId, {ok:false,error:{code:'auth_not_configured',message:'Cybermap API token configuration is pending.'}});
            return;
          }
          if (!token) {
            send(res, 401, requestId, {ok:false,error:{code:'auth_required',message:'Bearer token required for /api/v1 endpoints.'}});
            return;
          }
          if (!authTokens.includes(token)) {
            send(res, 403, requestId, {ok:false,error:{code:'auth_forbidden',message:'Bearer token was not accepted.'}});
            return;
          }
          const length = Number.parseInt(req.headers['content-length'] || '0', 10);
          if (Number.isFinite(length) && length > bodyLimitBytes) {
            req.resume();
            send(res, 413, requestId, {ok:false,error:{code:'body_too_large',message:'Request body exceeds configured Cybermap API limit.'}});
            return;
          }
          send(res, 501, requestId, {ok:false,service:'cybermap-api',error:{code:'not_implemented',message:'Cybermap API route scaffolded; DB-backed implementation lands later.'}});
          return;
        }

        send(res, 404, requestId, {ok:false,error:{code:'not_found',message:'Route not found.'}});
      });

      server.listen(port, host, () => console.log(JSON.stringify({service:'cybermap-api',structured:true,event:'listening',host,port})));
  - path: /opt/cybermap-worker/package.json
    permissions: '0644'
    defer: true
    content: |
      {"name":"cybermap-worker","version":"0.1.0","private":true,"type":"module","scripts":{"start":"node worker.mjs"},"engines":{"node":">=20"}}
  - path: /opt/cybermap-worker/worker.mjs
    permissions: '0644'
    defer: true
    content: |
      const pollIntervalMs = Number.parseInt(process.env.CYBERMAP_WORKER_POLL_INTERVAL_MS || '60000', 10);
      function log(entry) { console.log(JSON.stringify({service:'cybermap-worker',structured:true,...entry})); }
      function tick(reason = 'interval') { log({event:'tick',reason,pollIntervalMs,jobs:[{name:'greenfeed-polling',status:'pending-db-task'},{name:'cybermap-cell-materialization',status:'pending-db-task'}]}); }
      const timer = setInterval(tick, pollIntervalMs);
      tick('start');
      process.on('SIGTERM', () => { clearInterval(timer); log({event:'shutdown',signal:'SIGTERM'}); process.exit(0); });
      process.on('SIGINT', () => { clearInterval(timer); log({event:'shutdown',signal:'SIGINT'}); process.exit(0); });
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
      EnvironmentFile=-/etc/cybermap-api.env
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
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto https;
          proxy_set_header X-Request-Id $request_id;
        }
      }
  - path: /etc/pgbouncer/pgbouncer.ini
    permissions: '0640'
    defer: true
    content: |
      [databases]
      ; Placeholder only. DB connection task will replace this with the private PostgreSQL hostname.
      ; cybermap = host=blue-swallow-pg.postgres.database.azure.com port=5432 dbname=cybermap auth_user=pgbouncer

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
      ; Placeholder. Do not commit or cloud-init database credentials; inject via operator-controlled secret path in the DB task.
runcmd:
  - mkdir -p /opt/cybermap-api /opt/cybermap-worker /etc/nginx/ssl /var/log/cybermap
  - useradd --system --home-dir /opt/cybermap-api --shell /usr/sbin/nologin cybermap || true
  - chown -R cybermap:cybermap /opt/cybermap-api /opt/cybermap-worker /var/log/cybermap
  # NodeSource Node.js 20 bootstrap for Ubuntu 22.04.
  - curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  - apt-get install -y nodejs
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
