# VM API Specification

## Overview
The Blue Swallow Society VM hosts a simple echo service that serves as the backend for API calls from the Static Web App. This service runs on an Ubuntu VM and is accessed via the Azure Functions proxy layer which forwards requests to the VM's public IP address.

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
