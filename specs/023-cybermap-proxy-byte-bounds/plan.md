# Implementation Plan: Cybermap Proxy Byte Bounds

**Spec**: [spec.md](./spec.md)

1. Add a shared Cybermap boundary module with a 1 MiB UTF-8 request/response policy, guarded `Content-Length` parsing, bounded request serialization, and readable-stream-only response reads. Cancel a declared oversized body before failure, preserve the local boundary error if cancellation fails, and fail closed when no readable stream is available.
2. Use the module in common viewport/projection, global viewport, observation ingest, MVT tile, paper-state VM-bound routes, operator signals, and Tzeentch's canonical paper-state read. Validate an original request `Content-Length` before a route normalizes its projection payload.
3. Preserve current route-specific authorization, error envelopes, no-store headers, and timeouts; map inbound bound violations to 413 and oversized, rejected, or malformed successful backend payloads to a bounded local 502 without reflecting upstream text.
4. Add local mock tests for declared-body cancellation, cancellation-failure error preservation, unannounced stream termination, unstreamed fallback refusal, normalized-route declared ingress, direct operator-signals/paper-state declared and streamed response bounds, malformed successful JSON, and canonical paper-state reads, then execute focused contract suites.

No deployment or live backend request is part of this repair.
