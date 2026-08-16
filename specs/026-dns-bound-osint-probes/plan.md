# Implementation Plan: DNS-Bound OSINT HTTPS Probes

**Spec**: [spec.md](./spec.md)

1. Replace the raw hostname `fetch()` path with a no-pool `https.request` transport. Supply a custom `lookup` callback that returns only a single vetted public address. Preserve the hostname as TLS `servername`.
2. Carry normalized DNS records from resolution to the requester. Verify the connected socket peer is public and matches one of those records.
3. Re-run the resolution/bind sequence for every manual redirect.
4. Provide dependency injection only for deterministic DNS and HTTPS transport tests. It is not a caller-facing route option.
5. Retain bounded text reads and fail closed on connection, DNS, peer, and TLS errors.
