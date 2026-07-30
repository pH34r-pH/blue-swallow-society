---
title: RaID model lifecycle control plane plan
date: 2026-07-29
implements: specs/018-raid-model-lifecycle-control-plane/spec.md
---

# Plan

1. Add a dedicated `raid-model-contract.mjs`. It validates bounded model compatibility, canonical signed manifests, artifact metadata, and feedback packets without accepting storage URLs, raw frames, GPS, RF payloads, arbitrary labels, or arbitrary state transitions.
2. Add an in-memory lifecycle store for deterministic unit/HTTP tests and a PostgreSQL lifecycle store using the existing pool. Keep observation authentication in the existing observation store; pass the authenticated device credential to the lifecycle store. Both stores expose catalog, artifact, feedback, and atomic snapshot/job-claim methods.
3. Add migration `0006_raid_model_lifecycle.sql`. It creates immutable release/artifact/feedback/snapshot/job records, constrained state columns, per-device feedback idempotency, model compatibility indexes, and a claim lock. It does not manufacture a model, mutate an evidence row, or store raw capture content.
4. Extend `main.mjs` to construct the PostgreSQL lifecycle store, `readyz` to include its readiness, and `server.mjs` to route the three Caddy-asserted mTLS paths. Catalog/artifact are GET reads that parse exact bounded compatibility headers; catalog permits only `channel=field`; feedback remains POST JSON. Artifact responses are direct private bytes because no approved model blob/SAS authority exists yet.
5. Extend the Caddy template/installer allowlist for exactly the three mTLS model routes. Keep Node loopback-only and do not widen TCP 443 or create token/browser fallback.
6. Add an internal worker-facing lifecycle API in the store: evaluate policy eligible rows, atomically claim one snapshot/job, and require an explicit separate release insertion/approval fact for any catalog entry. TensorFlow execution remains a separate worker capability; its output is accepted only as an immutable signed candidate receipt.
7. Test RED first, then implement one surface at a time: contracts; memory store; PostgreSQL/migration shape; HTTP catalog/artifact/feedback; job claim; Caddy/installer/readiness contracts. Run owning and root suites after each green group.

## Constitution check

- **Security-first:** PASS if all route data is whitelisted, mTLS-scoped, generic on authorization failure, and no signing/storage secret enters code or logs.
- **Privacy/anonymity:** PASS if feedback is data-minimal and optional capture linkage refers only to already-authorized packets.
- **Defense in depth:** PASS if Caddy mTLS, loopback proxy assertion, credential scope, release eligibility, artifact hash, and client verification remain independent gates.
- **Secure default:** PASS if absent lifecycle store/migration/key receipt produces unavailable/no artifact rather than fallback publication.
- **Operational deployment:** PARTIAL by design. This change does not execute a private database migration, deploy Caddy, run a TensorFlow worker, or publish a model.

## Affected files

```text
vm/cybermap-api/src/raid-model-contract.mjs              new
vm/cybermap-api/src/raid-model-store.mjs                 new
vm/cybermap-api/src/server.mjs                            routes/readiness
vm/cybermap-api/src/main.mjs                              lifecycle store wiring
vm/cybermap-api/test/raid-model-*.test.mjs               new
vm/cybermap-api/migrations/0006_raid_model_lifecycle.sql new
vm/cybermap-api/src/postgres-store.mjs                    readiness registration only if shared
infra/...Caddy/installer                                 exact allowlist
specs/014-wardriver-mtls-direct-api/*                     authority amendment
```

## Verification strategy

- Run each new Node test in RED, capture the expected missing module/route/store failure, then make it green.
- Test both stores against the same behavioral vectors where possible.
- Inspect generated SQL and Caddy config without printing environment values.
- Run `npm test` in `vm/cybermap-api`, root `node --test tests/*.test.mjs`, `git diff --check`, and `graphify update .`.
- A private-network disposable PostgreSQL receipt and an mTLS device receipt are later operational gates, not substitutes for local tests.
