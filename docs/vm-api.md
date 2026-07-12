# VM API Specification

## Overview
The deployed Blue Swallow Society VM still hosts the echo connectivity proof. The repository now also contains the first executable Cybermap ingest service under `vm/cybermap-api/`: authenticated, strict, idempotent Wardriver observation batches backed by PostgreSQL/PostGIS. That source implementation is not yet promoted to the VM, so the deployed endpoint remains scaffold-only.

The target VM service is the **Cybermap API gateway**: authenticated `/api/v1/*` endpoints for observation ingest, viewport queries, source catalogs, sensorium sessions, direct observation packets, and Mosaic/Murmurs memory sync. The durable datastore is Azure Database for PostgreSQL Flexible Server with PostGIS. See [`docs/cybermap-geospatial-backend.md`](./cybermap-geospatial-backend.md) for the target design and [`vm/cybermap-api/README.md`](../vm/cybermap-api/README.md) for the implemented P0 ingest contract.

## Target Cybermap API

P0 endpoints replacing the echo lab:

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | VM/API health, no secrets |
| `GET /readyz` | DB connectivity, migration state, and materializer readiness |
| `POST /api/v1/observations/batch` | Wardriver/RaID/Greenfeed batch ingest with idempotency |
| `GET /api/v1/cybermap/viewport?bbox=&zoom=&layers=&since=` | Godeye map viewport query |
| `GET /api/v1/cybermap/cells/{h3Cell}` | Cell detail/provenance drilldown |
| `GET /api/v1/entities/{id}` | Entity summary and observation links |
| `GET /api/v1/sources?bbox=&class=` | Greenfeed/source catalog lookup |
| `POST /api/v1/sensorium/sessions` | Start/end RaID or Greenfeed session record |
| `POST /api/v1/direct-observations` | Claim-linked direct observation packet |
| `POST /api/v1/agent-loops/runs` | Start a Mosaic, Murmurs, Bridge, paper tick, or dream run manifest with idempotency |
| `PATCH /api/v1/agent-loops/runs/{run_id}` | Complete/fail a loop run and attach output refs |
| `GET /api/v1/agent-loops/status?agent=&since=` | Loop health, last successful tick, source degradation, and outbox backlog state |
| `POST /api/v1/narrative/fragments` | Append operator-visible Mosaic/Murmurs/Bridge stream-of-consciousness fragments |
| `GET /api/v1/narrative/stream?agent=&cadence=&since=&limit=` | Pull narrative fragments for SWA dashboard stream cards |
| `POST /api/v1/journal-entries` | Append daily Mosaic/Murmurs meta-narrative journal entries |
| `GET /api/v1/journal-entries?agent=&date=&limit=` | Read daily journal history for operator review/export |
| `GET /api/v1/paper/books` | Paper book exposure, PnL, stale marks, cooldowns, and status |
| `POST /api/v1/paper/action-decisions` | Append autonomous paper-only buy/sell/watch/avoid decisions with evidence, risk-policy result, and idempotency key |
| `POST /api/v1/paper/ledger-events` | Append fills, marks, exits, stale-source suppressions, skips, and operator overrides |
| `GET /api/v1/paper/actions?status=&book=&since=` | Read autonomous paper action and override history |
| `GET /api/v1/memories?agent=&since=` | Mosaic/Murmurs memory sync pull |
| `POST /api/v1/memories/patches` | Evidence-backed memory patch writeback, review-gated unless explicitly auto-mergeable |
| `POST /api/v1/source-reliability/events` | Source reliability and retrieval degradation events |

The sections below document the deployed echo proof-of-connectivity state.

### Implemented P0 ingest slice

The source implementation now provides:

- strict `bss.observation_batch.v1` and `bss.sync_receipt.v1` contracts;
- scoped digest-only device credentials;
- required device and idempotency headers;
- exact-replay receipts and changed-content conflicts at batch and observation identity levels;
- passive-observation payload preservation with explicit redaction/retention classes, plus body and count limits;
- PostgreSQL transactions with bounded lock/statement/idle timeouts, live credential revalidation, non-blocking batch advisory locks, sorted observation locks, active-session ownership checks, and retryable busy/error normalization;
- app-computed H3 7/9/11 and server-derived PostGIS geometry;
- migration `0002_device_ingest_contract.sql` for credentials, content hashes, batch links, NULL-closed final receipt constraints, and durable receipt shape checks;
- typed Android batch serialization with semantic timestamp validation, device/idempotency envelope binding, receipt-aware encrypted outbox transitions, and HTTPS-only production upload transport.

Promotion remains blocked on managed-database migration execution, device enrollment/Keystore ownership, real scanner-record export, WorkManager scheduling/status UI, VM service deployment, disposable/managed PostGIS concurrency proof, and a live-device replay test.

Target write semantics for the VM API:

- Mosaic and Murmurs are the only primary loops. `bridge`, `paper`, `narrative`, `memory_sync`, and `source_health` are supporting loops around them.
- Loop/write payload fields use canonical snake_case: `run_id`, `loop_id`, `loop_role`, `generated_at`, `time_window`, `source_refs`, `output_refs`, `paper_only`, `autonomous_execution`, `risk_policy_passed`, `idempotency_key`.
- Browser clients never call the VM directly; SWA Functions proxy token-gated read/observability/override paths.
- Jetson/local agent loops write to `/api/v1/*` with scoped loop/device tokens, idempotency keys, and append-only records.
- Static Web App assets must never contain loop write tokens or database credentials.
- Mosaic and Murmurs execute paper investments autonomously without a per-action human review gate. Machine-enforced capital, exposure, drawdown, cooldown, stale-data, and idempotency controls are mandatory. Real-money/account-bound execution remains outside this P0 contract.

## Service Architecture

### Deployment
- **Host**: Ubuntu 22.04 LTS VM deployed via Bicep + cloud-init
- **Location**: `/opt/echo/echo_server.py` on the VM
- **Process**: Managed by systemd as `echo-server.service`
- **Port**: TCP 8080 (bound to 0.0.0.0 - all interfaces)
- **Access**: Proxied via Azure Static Web App API (`/api/echo`) using `BACKEND_ECHO_BASE_URL` app setting

### Technology Stack
- **Language**: Python 3 (standard library only)
- **HTTP Server**: `http.server` module (`BaseHTTPRequestHandler`, `HTTPServer`)
- **Data Format**: JSON for all requests/responses
- **Process Management**: systemd service with auto-restart
- **Initialization**: cloud-init during VM provisioning

## API Endpoints

### Primary Endpoint: `/echo`
- **Method**: GET
- **Parameters**:
  - `msg` (query string, required): The message to echo back
- **Success Response**:
  - **Status**: 200 OK
  - **Headers**: `Content-Type: application/json`
  - **Body**:
    ```json
    {
      "ok": true,
      "echo": "<original message>",
      "host": "<hostname>",
      "path": "/echo",
      "query": {"msg": ["<original message>"]}
    }
    ```
- **Error Responses**:
  - **Missing msg parameter**:
    - Status: 200 OK (service treats empty as valid)
    - Body: `{"ok": true, "echo": "", "host": "...", "path": "/echo", "query": {"msg": [""]}}`
  - **Invalid path** (anything other than `/echo`):
    - Status: 404 Not Found
    - Body: `{"ok": false, "error": "Not found"}`

### Example Requests
```
GET http://<vm-ip>:8080/echo?msg=hello
```
Response:
```json
{
  "ok": true,
  "echo": "hello",
  "host": "blue-swallow-vm",
  "path": "/echo",
  "query": {"msg": ["hello"]}
}
```

```
GET http://<vm-ip>:8080/echo
```
Response:
```json
{
  "ok": true,
  "echo": "",
  "host": "blue-swallow-vm",
  "path": "/echo",
  "query": {"msg": [""]}
}
```

```
GET http://<vm-ip>:8080/invalid
```
Response:
```json
{
  "ok": false,
  "error": "Not found"
}
```

## Implementation Details

### echo_server.py
The core service implementation is a simple HTTP server:

```python
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
```

### Systemd Service Configuration
The service runs as a systemd service for reliability:

```
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
```

### cloud-init Provisioning
The VM is configured during first boot via cloud-init:

1. **Package Updates**: Ensures latest packages
2. **File Creation**:
   - `/opt/echo/echo_server.py` (executable Python script)
   - `/etc/systemd/system/echo-server.service` (systemd unit file)
3. **Service Management**:
   - Daemon reload
   - Service enablement
   - Service startup

## Azure Functions Proxy Layer

The VM echo service is not called directly from the browser. Instead, requests flow through:

1. **Browser** → Azure Static Web App
2. **Static Web App API** (`/api/echo`) → Azure Function
3. **Azure Function** → VM echo service (using `BACKEND_ECHO_BASE_URL` app setting)
4. **VM echo service** → Processes request and returns response
5. **Azure Function** → Returns response to Static Web App
6. **Static Web App** → Returns response to browser

### Azure Function Implementation (`api/echo/index.js`)
```javascript
module.exports = async function (context, req) {
  const base = process.env.BACKEND_ECHO_BASE_URL;

  if (!base) {
    context.res = {
      status: 500,
      body: { ok: false, error: 'Missing BACKEND_ECHO_BASE_URL' }
    };
    return;
  }

  // Strip trailing slash so we always produce `${base}/echo?...`.
  const cleanBase = base.replace(/\\/+$/, '');
  const msg = req.query.msg || 'empty';
  const url = `${cleanBase}/echo?msg=${encodeURIComponent(msg)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const text = await response.text();
    context.res = {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: {
        ok: response.ok,
        status: response.status,
        body: text
      }
    };
  } catch (err) {
    context.res = {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: `Echo backend failed: ${err.message}` }
    };
  }
};
```

## Security Considerations

### Network Security
- **NSG Rules**: Only ports 22 (SSH) and 8080 (echo) open to `allowedSourceIp` CIDR
- **Default Deny**: All other inbound traffic blocked by Network Security Group
- **Public IP**: VM has a public IP, but access is restricted by NSG

### Service Security
- **Input Validation**: Minimal (only path checking for `/echo`)
- **Message Echo**: User input is reflected in JSON response but not executed
- **No Shell Access**: Service does not provide command execution capabilities
- **Information Disclosure**: Returns hostname and query parameters (low risk in this context)

### Authentication & Authorization
- **Current State**: No authentication on the echo service itself
- **Proxy Protection**: Azure Function can add authentication if needed
- **Network Layer**: Access controlled by NSG rules
- **Future Enhancement**: Could add API key or token validation in the Azure Function

## Reliability Features

### Process Management
- **Auto-restart**: systemd service configured with `Restart=always`
- **Failure Detection**: Service restarted after 3 seconds if it crashes
- **Boot Survival**: Service enabled to start on system boot

### Error Handling
- **HTTP Errors**: Proper status codes (404 for invalid paths, 200 for valid requests)
- **Timeout Handling**: Azure Function implements 5-second timeout for VM requests
- **Network Resilience**: Function catches network errors and returns 502 Bad Gateway

### Resource Usage
- **Lightweight**: Uses only Python standard library
- **Low Memory**: Minimal footprint suitable for B1s VM
- **CPU Efficient**: Simple request/response processing

## Deployment & Configuration

### Provisioning Process
1. **Bicep Deployment**: Creates VM, networking, NSG, public IP
2. **cloud-init**: Runs on first boot to install and configure echo service
3. **Systemd**: Manages service lifecycle
4. **Azure Function**: Configured with `BACKEND_ECHO_BASE_URL` app setting pointing to VM

### Configuration Points
- **VM Size**: Parameterized in Bicep (`vmSize`, default `Standard_B1s`)
- **Access Control**: `allowedSourceIp` parameter (default `*` - should be restricted)
- **Auto-shutdown**: Time and timezone parameters for cost control
- **Echo Port**: Hardcoded to 8080 in cloud-init and NSG
- **Hostname**: Set during VM provisioning (`computerName` in osProfile)

### Scaling Considerations
- **Vertical Scaling**: Change `vmSize` parameter for more powerful VM
- **Horizontal Scaling**: Would require load balancer and multiple VM instances
- **Service Duplication**: Multiple echo services could run on different ports
- **Alternative Deployment**: Could containerize and deploy to Azure Container Instances or AKS

## Current Limitations

### Functional Limitations
- **Single Endpoint**: Only provides `/echo` functionality
- **HTTP Methods**: Only implements GET (no POST, PUT, etc.)
- **Query Parsing**: Basic implementation, no support for complex nested queries
- **Payload Size**: Limited by HTTP server capabilities (suitable for small messages)
- **Concurrency**: Python's `HTTPServer` is single-threaded (handles one request at a time)

### Operational Limitations
- **Structured Logging**: Added via `context.log` in Azure Function proxy; systemd journal captures service logs
- **No Metrics**: No built-in metrics collection or monitoring endpoints
- **No Health Check**: Beyond basic endpoint responsiveness
- **No TLS**: Plain HTTP only (could be added with reverse proxy or Azure Front Door)

### Security Limitations
- **No Authentication**: Open to anyone who can reach the VM on port 8080
- **No Rate Limiting**: Vulnerable to abuse or accidental DoS
- **Input Sanitization**: Minimal (JSON encoding prevents injection, but no validation)
- **Information Exposure**: Returns internal hostname and query data

## Enhancement Opportunities

### Functional Enhancements
- Add POST endpoint for JSON payload handling
- Implement additional API endpoints (health, status, metrics)
- Add support for different content types (plain text, HTML)
- Implement query parameter validation and sanitization
- Add request/response logging capabilities

### Operational Enhancements
- Add structured logging to stdout/journald
- Implement Prometheus metrics endpoint
- Add health check endpoint (`/health`)
- Implement graceful shutdown handling
- Add configuration via environment variables or config file

### Security Enhancements
- Add API key or token authentication in Azure Function layer
- Implement rate limiting in Azure Function
- Add input validation and length limits
- Consider TLS termination at Azure Front Door or Application Gateway
- Implement request/response size limits

### Deployment Enhancements
- Containerize the service for easier deployment
- Add support for blue/green deployments
- Implement backup/restore mechanisms for VM
- Add monitoring and alerting via Azure Monitor
- Implement automated patching for VM OS

## Integration Points

### With Static Web App
- **App Setting**: `BACKEND_ECHO_BASE_URL` configured by Bicep deployment
- **API Path**: `/api/echo` proxies to VM service
- **Message Flow**: Frontend → SWA API → Azure Function → VM → Azure Function → SWA → Frontend

### With Azure OpenAI (Optional)
- While the echo service is independent, the overall architecture supports:
  - VM-hosted local models for experimentation
  - Azure OpenAI deployment via optional Bicep module
  - Future integration where echo service could be replaced or augmented with AI capabilities

## Current State
The VM echo service provides a simple, reliable backend for testing connectivity between the Static Web App and the VM infrastructure. It fulfills its role as a proof-of-concept backend service that demonstrates:
- Successful VM provisioning and configuration
- Network connectivity between SWA and VM
- Basic API request/response processing
- Service reliability through systemd management
- Cost control through auto-shutdown scheduling

The service is intentionally simple to serve as a foundation for more complex backend services while validating the core infrastructure deployment pipeline.
