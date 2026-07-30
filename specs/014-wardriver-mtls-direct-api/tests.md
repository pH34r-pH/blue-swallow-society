---
title: Wardriver mTLS direct API test design
date: 2026-07-26
implements: specs/014-wardriver-mtls-direct-api/spec.md
---

# Test Design

| ID | Authority | Validation |
|---|---|---|
| TST-014-01 | FR-3 | Node rejects an mTLS route without the trusted proxy marker. |
| TST-014-02 | FR-4 | A marked batch succeeds without an ingest token, preserves replay behavior, and rejects a mismatched device ID. |
| TST-014-03 | FR-5 | A marked body-only viewport request returns an aggregate response; query-only token viewport behavior remains unchanged. |
| TST-014-04 | FR-6 | Existing token-gated request tests remain green. |
| TST-014-05 | FR-1/FR-7 | `caddy validate` accepts the rendered Caddyfile; Bicep build accepts the vault and trust-material parameters. |
| TST-014-06 | FR-7 | `az keyvault show` and certificate metadata prove RBAC, purge protection, policy, enabled state, and expiry without retrieving the certificate secret. |
| TST-014-07 | FR-2/FR-3 | mTLS route contract sends catalog/artifact reads as GET with exact channel/header boundaries and feedback as POST. | Invalid method, duplicate compatibility header, query/body, absent proxy assertion, or scope fails closed; the legacy token/browser lanes remain unchanged. |

Run the new Node tests RED before production changes. Run the complete `npm test` suite after the server change. Run Bicep and Caddy checks before any deployment. Do not treat a local Caddy configuration as deployed evidence.
