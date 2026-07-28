# Azure Resources Specification

**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd`, reviewed 2026-07-28. This is an IaC declaration, not a statement that the resources currently exist or are healthy.

## Composition

`infra/main.bicep` deploys the following source-defined topology:

```text
Azure Static Web App (Standard)
  -> Azure Functions (Node 22)
  -> HTTPS VM gateway (Caddy :443)
  -> loopback Cybermap API (Node 24 :8080)
  -> private PostgreSQL Flexible Server + PostGIS

Azure Storage private release container
  -> authenticated Function
  -> short-lived read-only Blob SAS redirect
```

| Resource | Source owner | Important declaration |
|---|---|---|
| Static Web App | `infra/main.bicep` | Standard SKU, public cover and managed Functions deployment. |
| Shared network | `infra/modules/network.bicep` | VM app subnet, delegated PostgreSQL subnet, private PostgreSQL DNS zone and VNet link. |
| PostgreSQL Flexible Server | `infra/modules/postgres-flexible.bicep` | Private-network database with PostGIS migration target. |
| VM gateway | `infra/vm-echo-lab.bicep` | Ubuntu 22.04, public static IP/DNS label, Caddy-facing HTTPS ingress. |
| Cybermap service | `infra/scripts/install-cybermap-api.sh` | Node 24 systemd service on loopback; Caddy reverse proxy. |
| Wardriver release storage | `infra/modules/wardriver-release-storage.bicep` | Non-public Blob container used only after operator authorization. |
| Azure OpenAI | `infra/modules/openai.bicep` | Optional; disabled unless `deployOpenAi=true`. |

## Network and ingress

The checked-in parameter file makes SSH deny-by-default with `allowedSourceIp = 127.0.0.1/32`. A maintenance deployment may override it with an operator `/32`; do not use `*`.

The VM NSG exposes:

- TCP 22 from `allowedSourceIp`;
- TCP 80 from Internet for ACME HTTP validation; and
- TCP 443 from Internet for the HTTPS backend gateway.

It does **not** expose port 8080. The Node service binds to `127.0.0.1:8080`, and Caddy proxies the public HTTPS name to it. PostgreSQL uses the delegated subnet and private DNS; it has no browser or public-internet path in this topology.

Cloud-init creates a legacy echo service, but the Cybermap installer disables it after it installs `bss-cybermap-api.service`. The Node service still retains `GET /echo` as a compatibility route; it is not the product data plane.

## Parameters and outputs

| Parameter | Checked-in value or default | Meaning |
|---|---|---|
| `location` | `westus2` | Static Web App/VM resource-group region. |
| `postgresLocation` | `westus3` | PostgreSQL region, independently configurable. |
| `staticWebAppName` | `blue-swallow-swa` | Static Web App resource name. |
| `vmSize` | `Standard_B1ms` | VM size. |
| `enableAutoShutdown` | `false` | VM shutdown schedule is disabled for hot-stack validation by default. |
| `postgresSkuName` | `Standard_B1ms` | PostgreSQL compute SKU. |
| `postgresStorageSizeGiB` | `32` | Initial PostgreSQL storage. |
| `postgresBackupRetentionDays` | `7` | PostgreSQL backup retention. |
| `deployOpenAi` | `false` | Optional Azure OpenAI account. |

Secure deployment inputs are `sshPublicKey`, `postgresAdministratorLoginPassword`, `cybermapReadToken`, and `paperStateToken`. GitHub Actions validates their shapes and passes them to Bicep; no value belongs in the repository.

The Bicep outputs `backendEchoBaseUrl` and `backendCybermapBaseUrl` as `https://<backend-fqdn>`, plus database/network/release-storage identifiers. A source output is not a runtime health receipt.

## GitHub Actions deployment declaration

`.github/workflows/deploy-static-web-app.yml` runs on push to `main` and workflow dispatch. It:

1. obtains Azure access through GitHub OIDC;
2. validates SSH, PostgreSQL, Cybermap-read, and paper-state secret shapes;
3. deploys `infra/main.bicep` with a source-version force-update tag;
4. writes the required Static Web App settings, including backend HTTPS URLs and operator/release secrets;
5. uploads `app/` and `api/`; and
6. ensures the Azure DNS zone exists before attempting apex and `www` custom-domain wiring.

The installer downloads the mutable `main` tarball. The deployment path therefore lacks an immutable service artifact and independent checksum/signature verification. This is a supply-chain remediation item, not a claim that a live system is compromised.

## Release storage

The release container is private. `api/operator-downloads` verifies the operator token, validates the current release manifest (including `buildType: release`, package ID, commit/tag, SHA-256, signer SHA-256, and expected Blob path), then issues a five-minute HTTPS read-only Blob SAS redirect. The API must not fall back to a bundled debug APK.

## Runtime proof boundary

To assert an actual deployment, retain separate dated receipts for:

- the resolved Bicep deployment and created resource IDs;
- Caddy certificate and service health;
- applied migration versions and `readyz` response;
- authenticated device replay and operator map-read requests;
- release manifest retrieval and SHA-256 verification; and
- custom-domain DNS and Static Web App binding.

Without those receipts, documentation must say “defined in source” or “declared by IaC,” not “deployed” or “operational.”
