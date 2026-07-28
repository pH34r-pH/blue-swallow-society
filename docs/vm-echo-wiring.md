# VM echo compatibility wiring

**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd`, reviewed 2026-07-28. This describes the declared deployment path; it is not a live-service assertion.

## Current route

`GET /api/echo?msg=…` remains a public compatibility probe.

```text
browser
  -> Azure Static Web Apps Function: api/echo
  -> ${BACKEND_ECHO_BASE_URL}/echo?msg=…
  -> HTTPS Caddy gateway on the VM
  -> loopback Node Cybermap API: GET /echo
```

`api/echo/index.js` reads `BACKEND_ECHO_BASE_URL`, removes its trailing slash, URL-encodes `msg`, forwards with a five-second abort timeout, and returns the backend status/body envelope. Missing configuration returns `500`; an unreachable backend returns `502`.

## Network and process state declared in IaC

- `infra/vm-echo-lab.bicep` opens VM ports 80 (ACME) and 443 (HTTPS gateway). It does **not** open 8080 in the NSG.
- Cloud-init initially creates an `echo-server.service` bound to `0.0.0.0:8080` as bootstrap scaffolding.
- The `install-cybermap-api` custom extension installs the Node 24 Cybermap service bound to `127.0.0.1:8080`, writes the Caddy reverse-proxy configuration, and disables `echo-server.service`.
- After that extension succeeds, `GET /echo` is served by the Cybermap API through Caddy, not the Python bootstrap process.

Set the Function app setting to the **HTTPS** backend FQDN, for example:

```text
BACKEND_ECHO_BASE_URL=https://<backend-fqdn>
```

The Cybermap Functions independently use `BACKEND_CYBERMAP_BASE_URL` and require HTTPS.

## Deployment integrity note

The VM extension receives a full Git commit SHA, its GitHub archive URL, and an expected SHA-256 from the deployment workflow. The installer verifies the URL/revision agreement and digest before extraction or migration, then records the revision/digest receipt in `/etc/bss/cybermap-api-release.json`.

## Scope

The echo route is a connectivity compatibility surface. It is not the Cybermap data plane and must not be used as evidence that the Cybermap API, PostgreSQL migrations, or operator routes are healthy.
