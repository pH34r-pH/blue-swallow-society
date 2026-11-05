# Validation design

| Contract | Evidence |
| --- | --- |
| Canonical RSA identity and fixed JWS types | Generated test-only keys, malformed/weak keys, wrong signature/kid/algorithm/type, cross-group/action and expired challenge tests |
| Protected ownership and fail-closed configuration | Missing/malformed config, canonical HTTPS port 443, active cap 1–5, forged owner headers, non-owner invite/revoke, bootstrap owner pin |
| Atomic invitation and replay | Concurrent distinct-key claim, same-key response-loss recovery, exact proof replay, fresh challenge retry, expired invitation |
| Bounded storage and repair | Conditional write conflicts, unavailable/corrupt/oversized state, roster publication interruption, stale public roster writer |
| Least-privilege SAS | Parse SDK-generated user delegation SAS; verify HTTPS, TTL, resource, depth, path, permissions, and absence of list/delete/peer writes |
| Roster lifecycle | Verify signature and sorted full keys; self rename; revision increase; explicit revocation cutoff; revoked grant denial |
| Function boundary | POST-only route, bounded JSON, sensitive response headers, generic redacted failures, actual host route discovery when available |
| Integration | Existing private feed/auth tests, Node runtime contract, documentation guard, diff whitespace |

Synthetic keys and storage fake state exist only in tests. Unit tests prove service
behavior and SDK scope encoding; they do not prove live Azure enforcement. Live
qualification requires the intended Node 24 deployment, provisioned private
container/RBAC, actual prefix-create overwrite denial, and phone onboarding/sync.

Exercise allowlisted and non-allowlisted active members, disabled/malformed configuration, signature and type confusion, audience and scope mismatch, expiry, malformed bearer, and unchanged independent reader authentication. Use synthetic keys and no live credentials.
