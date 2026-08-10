# Wardriver local mTLS proof

This is the disposable acceptance lane for real PostGIS, Cybermap API persistence, Caddy mTLS, and a loopback-only TCP byte relay. It never uses the in-memory store.

## Boundary

- PostGIS and API run on an internal Docker proof network.
- Caddy shares the API network namespace and proxies to `127.0.0.1:8080`; the backend therefore admits only its loopback proxy assertion.
- The relay is the only host listener: `127.0.0.1:18080` → opaque bytes → Caddy `:8443`. It cannot terminate TLS or inject headers.
- The desktop client private key remains only in the protected credential directory. The repository contains only the debug local CA public certificate.

## Preconditions

- Docker Desktop is healthy.
- The protected desktop credential directory contains:
  - `local-mtls-lab/server.pem`
  - `local-mtls-lab/server-key.pem`
  - `local-mtls-lab/ca.pem`
  - the desktop public client certificate PEM
  - the desktop client PKCS#12 file
- Android Emulator is running and unlocked.

## Create the protected Compose environment

Run once after the local CA/server material and fixed desktop credential exist. The bootstrap resolves only the named local credential files below `%LOCALAPPDATA%\\BlueSwallow\\credentials`; it accepts `--out` only when it is a **new** `local-proof.env` directly in that root's `local-mtls-lab/` child. It refuses detected symlink traversal, another path, and overwrites. The desktop identity is a **passwordless PKCS#12** by contract: its confidentiality relies on direct Windows ACLs, and bootstrap verifies the P12 leaf against the approved public desktop PEM before use. The protected boundary excludes other Windows principals; the operator's same account remains trusted rather than sandboxed.

```sh
python local-proof/bootstrap-local-proof-env.py \
  --out '<protected-local-proof-environment-file>'
```

Run the deliberate clean proof. This command removes the local proof containers and volume first, starts the stack, then runs the host-side verifier. It leaves the resulting stack available for count-only inspection; a generic `up` is diagnostic-only and cannot produce acceptance evidence unless the verifier's `0/0` preflight succeeds.

```sh
export BSS_LOCAL_PROOF_ENV_FILE='<protected-local-proof-environment-file>'
./local-proof/run-local-proof.sh proof
./local-proof/run-local-proof.sh ps
```

The verifier reads the protected environment file itself so Windows paths remain literal; do not source that file through Bash. It imports only its client PKCS#12 and local CA path values, leaves Compose/database values outside its process environment, rejects a JSON response larger than 64 KiB before parsing, requires a closed v1 durable receipt schema, and proves preflight `1` named desktop source/`1` matching desktop credential/`0` batches/`0` observations plus post-replay `1/1/1/1` durability.

## Android local-lab build

```sh
./gradlew :app:assembleDebug -PbssLocalMtlsLab=true --no-daemon
adb -s emulator-5554 reverse tcp:18080 tcp:18080
```

The local-lab artifact has application ID `co.blueswallow.wardriver.localproof`, uses `https://bss.localhost:18080`, and uses device identity `wardriver-desktop-dev-2026`. Its local CA resource is included only for this explicit property-gated build. Its URI scheme, exported control actions, signature permission, and runtime controls derive from the final application ID, so it can co-install without taking ownership of normal Wardriver IPC/deep links or enrollment state. Ordinary debug and release builds retain the Azure origin and exclude local trust.

## Bounded Azure mTLS smoke

Use this only after the public desktop certificate is in the protected deployment trust bundle, CI/IaC has completed, and the separate `wardriver-desktop-dev-2026` Azure source/credential is enabled. The verifier permits only the fixed protected passwordless desktop PKCS#12 path; it verifies its direct Windows ACL and public-leaf match before connecting, never reads local-lab server material, never disables hostname/certificate validation, and permits no caller-selected host. Its no-client probe bypasses proxy configuration.

```sh
export BSS_AZURE_MTLS_SMOKE_ORIGIN='https://blue-swallow-vm-ob74vubvzwd7u.westus2.cloudapp.azure.com:8443/'
export BSS_AZURE_MTLS_CLIENT_P12='<protected-desktop-client-pkcs12>'
node local-proof/verify-azure-mtls-smoke.mjs
```

It first proves that the public mTLS route rejects a connection without a client certificate. It then proves certificate-bound viewport access, one durable receipt, and an exact idempotent replay that canonically preserves every v1 receipt field. It accepts only the exact documented Azure FQDN and rejects any JSON response larger than 64 KiB before parsing. The batch is an explicitly marked synthetic integration record under the non-preloaded desktop development source. It has no raw radio identifiers and remains a durable audit receipt; do not delete or repurpose it as operational telemetry.

## Required Android proof and cleanup

Import/select the KeyChain client certificate in the local-lab app. Submit one bounded encrypted-outbox item, verify its durable receipt and count-only database state, then retry the exact item. The accepted outcome is one durable batch/observation set plus an idempotent replay receipt.

After evidence capture:

```sh
./local-proof/run-local-proof.sh down -v --remove-orphans
adb -s emulator-5554 reverse --remove tcp:18080
```

Do not copy private material into this directory, Docker images, the APK, source control, or logs.
