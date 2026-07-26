# 006 — Field Dossier Production Design

## Flow

```text
market adapters -> canonical paper wake -> validated receipt
                                       -> collector manifest
receipt + manifest + delivery text -> deterministic renderer -> immutable package
immutable package -> private archive POST -> persisted hash/receipt
immutable package -> Discord dispatcher -> batch receipts
operator token -> SWA proxy -> VM archive -> HTML/PNG detail view
```

The package boundary is deliberate: a free-form agent response is not a transport contract. The renderer takes persisted evidence, not agent prose as authority. The agent may write the operator summary; the package stores it as an input with a SHA-256 digest.

## P0

- Harden market adapter price parsing and fixture coverage.
- Add canonical freshness and wake-success validation that writes `withheld` receipts on failure.
- Reconstruct a deterministic Field Dossier renderer from retained 2026-07-20 output evidence. Pages use the established graphite/paper/nacre/oxide ledger surface and preserve source provenance.
- Add a local publisher that builds package hashes, validates pages, archives only after P1 endpoint success, and exposes deterministic Discord batches/receipts for the scheduler agent.

## P1

- Add append-only PostgreSQL tables for brief packages and bytea artifacts in the existing private VM/Postgres boundary. This avoids a public blob endpoint and keeps small daily dossier assets under the same audited deployment, backup, and migration path.
- Add VM routes, SWA operator-token proxy, deployment secret plumbing, and an operator-only page. The proxy uses the existing `requireOperatorToken` session boundary and backend token; browser code sees only the operator token.
- Store HTML and PNG file hashes. Read handlers recompute/compare encoded artifact hashes before returning content.

## Failure model

- Invalid upstream mark: reject before engine action/ledger write.
- Wake, freshness, canonical-hash, or render failure: write a local withheld receipt; do not archive or dispatch.
- Archive timeout or hash conflict: do not dispatch; preserve retryable package and failure receipt.
- Discord failure after archive: append a partial delivery receipt and retry only unsent batches with the same package hash.
- Duplicate archive POST or dispatcher invocation: return/reuse the matching immutable receipt; changed content for the same run ID returns conflict.

## Security

- Backend paths accept an independent configured token; SWA translates only authenticated operator requests or trusted local publisher requests.
- All responses are `private, no-store`, `nosniff`, and JSON or binary content typed.
- Artifact IDs are opaque path-safe IDs. Input caps prevent a single archive request from exhausting memory.
- No remote source, local runtime path, credentials, or prompt metadata is included in the output surface.
