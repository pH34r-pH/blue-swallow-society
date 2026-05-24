# Feature Specification: Blue Swallow Society VM Echo API

**Feature Branch**: `002-vm-api`

**Created**: 2026-05-23

**Status**: Draft

**Input**: User description: "Create a simple Python echo service on an Ubuntu VM with an Azure Functions proxy layer, exposed through the Static Web App at /api/echo"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Echo Message Round-Trip (Priority: P1)

Users must be able to send a message through the Static Web App API and receive the same message echoed back from the VM, confirming end-to-end connectivity.

**Why this priority**: This is the foundational backend feature that validates the entire VM-to-SWA infrastructure pipeline works.

**Independent Test**: Can be fully tested by calling `GET /api/echo?msg=hello` from any HTTP client and verifying the response contains the original message, VM hostname, and query parameters.

**Acceptance Scenarios**:
1. **Given** the backend is healthy, **When** a user sends `GET /api/echo?msg=hello`, **Then** the response returns HTTP 200 with JSON body containing `echo: "hello"`
2. **Given** the backend is healthy, **When** a user sends a request with URL-encoded special characters, **Then** the response echoes the decoded message accurately
3. **Given** the backend is healthy, **When** a user omits the `msg` parameter, **Then** the response returns an empty echo string without error

### User Story 2 - Proxy Resilience and Error Handling (Priority: P2)

The Azure Function proxy must gracefully handle backend failures, network timeouts, and misconfiguration without exposing internal details to the client.

**Why this priority**: Resilient error handling ensures users receive meaningful feedback when the VM is unreachable or misconfigured, rather than hanging requests or leaking stack traces.

**Independent Test**: Can be fully tested by simulating a missing `BACKEND_ECHO_BASE_URL`, stopping the VM service, or sending an invalid path and observing the proxy's JSON error responses.

**Acceptance Scenarios**:
1. **Given** the `BACKEND_ECHO_BASE_URL` app setting is missing, **When** a user calls `/api/echo`, **Then** the proxy returns HTTP 500 with JSON `{"ok": false, "error": "Missing BACKEND_ECHO_BASE_URL"}`
2. **Given** the VM echo service is stopped, **When** a user calls `/api/echo`, **Then** the proxy returns HTTP 502 within 5 seconds with a JSON error describing the backend failure
3. **Given** the VM is unreachable, **When** a user calls `/api/echo`, **Then** the request times out after 5 seconds and returns a controlled error response

### User Story 3 - Automated VM Service Provisioning (Priority: P2)

The echo service must be automatically installed, enabled, and started on the VM during initial cloud-init provisioning without manual intervention.

**Why this priority**: Reliable automated provisioning ensures reproducible deployments and eliminates manual setup errors when the infrastructure is recreated.

**Independent Test**: Can be fully tested by deploying the VM through Bicep and verifying the echo service responds on port 8080 immediately after the VM boots.

**Acceptance Scenarios**:
1. **Given** a fresh VM deployment via Bicep and cloud-init, **When** the VM completes first boot, **Then** the systemd service `echo-server.service` is active and listening on `0.0.0.0:8080`
2. **Given** the VM has been rebooted, **When** the system comes back online, **Then** the echo service automatically restarts due to systemd `Restart=always` and `WantedBy=multi-user.target`
3. **Given** the echo service process crashes, **When** it exits unexpectedly, **Then** systemd restarts it within 3 seconds

### User Story 4 - Backend Security Hardening (Priority: P3)

The VM echo service and its network path must restrict unauthorized access and minimize the attack surface exposed to the public internet.

**Why this priority**: Even a simple echo service can be abused if exposed without network controls, and society operations require defense-in-depth for all infrastructure.

**Independent Test**: Can be fully tested by scanning the VM public IP with nmap from an unauthorized source IP and verifying only allowed ports respond.

**Acceptance Scenarios**:
1. **Given** the NSG is configured with a restricted `allowedSourceIp`, **When** traffic originates from an unauthorized IP, **Then** all inbound connections to ports 22 and 8080 are silently dropped
2. **Given** a request reaches the echo service, **When** the path is not `/echo`, **Then** the service returns HTTP 404 with a generic JSON error and does not leak file system information
3. **Given** a request contains malicious input, **When** it is reflected in the JSON response, **Then** it is encoded safely without enabling HTML or script injection

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: The VM MUST run a Python HTTP service on TCP port 8080 that responds to `GET /echo?msg={message}`
- **FR-002**: The echo service MUST return a JSON response containing `ok`, `echo`, `host`, `path`, and `query` fields
- **FR-003**: The Azure Function proxy MUST read `BACKEND_ECHO_BASE_URL` from environment variables and forward requests to `${BACKEND_ECHO_BASE_URL}/echo?msg={message}`
- **FR-004**: The Azure Function proxy MUST implement a 5-second timeout with `AbortController` to prevent hung requests
- **FR-005**: The Azure Function proxy MUST catch network errors and return HTTP 502 with a descriptive JSON error body
- **FR-006**: The VM MUST be provisioned via cloud-init to create `/opt/echo/echo_server.py` and `/etc/systemd/system/echo-server.service`
- **FR-007**: The systemd service MUST be configured with `Restart=always`, `RestartSec=3`, and enabled for boot via `multi-user.target`
- **FR-008**: The VM NSG MUST restrict inbound ports 22 and 8080 to the `allowedSourceIp` CIDR

### Key Entities *(include if feature involves data)*
- **EchoRequest**: Represents an incoming API call containing a query string message parameter
- **EchoResponse**: Represents the JSON payload returned by the VM, containing the echoed message, host metadata, and parsed query dictionary
- **ProxyResponse**: Represents the JSON payload returned by the Azure Function, containing the proxied status, body text, and ok flag
- **EchoService**: Represents the systemd-managed Python process bound to port 8080 on the VM

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: The `/api/echo` endpoint returns a successful response with the original message in under 2 seconds under normal network conditions
- **SC-002**: The Azure Function proxy returns a 502 or 500 error within 5 seconds when the backend is unreachable or misconfigured
- **SC-003**: The VM echo service is automatically running and responsive within 120 seconds of first boot completion
- **SC-004**: The systemd service recovers from a simulated crash within 5 seconds and resumes handling requests
- **SC-005**: Port scanning from an unauthorized IP reveals no open ports (22 and 8080 are inaccessible)

## Assumptions
- The Azure Static Web App and VM are deployed within the same Azure subscription and region
- The VM receives a public IP address and the NSG allows outbound traffic for cloud-init package updates
- Python 3 is available on the Ubuntu 22.04 LTS image without requiring manual installation
- The `BACKEND_ECHO_BASE_URL` app setting is populated after the VM public IP is known from Bicep deployment outputs
- The echo service is intentionally minimal and single-threaded; high concurrency is not a requirement for this phase
- TLS/HTTPS termination is handled by the Static Web App front door, not the VM echo service

