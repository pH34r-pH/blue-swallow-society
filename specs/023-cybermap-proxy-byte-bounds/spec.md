# Feature Specification: Cybermap Proxy Byte Bounds

**Feature Branch**: `fix/issue-39-cybermap-byte-limits`
**Created**: 2026-08-15
**Status**: Active
**Input**: GitHub issue #39 — enforce bounded Cybermap Function request/response handling.

## User Scenarios & Testing

### User Story 1 — Reject oversized inbound JSON before backend I/O (Priority: P1)

A device or operator request larger than the Cybermap ingress allowance receives a 413 response and does not reach the VM.

**Independent Test**: Batch and global-viewport tests submit a 1 MiB+1 raw body (and a matching oversized `Content-Length`) with a fetch spy; fetch count remains zero.

### User Story 2 — Reject oversized backend data before it reaches a caller (Priority: P1)

A backend response that declares or exceeds the response allowance receives a bounded 502 response. The Function does not parse, buffer, or return the oversized payload.

**Independent Test**: JSON and MVT proxy tests supply an oversized `Content-Length` with body readers that fail if invoked; stream tests supply unannounced over-limit bodies, including a cancellation failure.

## Requirements

- **FR-001**: Every Cybermap Function request forwarded to the VM MUST be at most 1 MiB UTF-8, including observation batches, global viewport, paper state, and common viewport/projection payloads. Routes that normalize a small projection payload MUST still reject an invalid or oversized original `Content-Length` before backend I/O.
- **FR-002**: A declared invalid or oversized inbound `Content-Length` MUST terminate with a bounded 400/413 response before serialization or backend fetch.
- **FR-003**: JSON and MVT backend responses MUST be limited to 1 MiB; an oversized declared length MUST cancel the readable body before failure, an unannounced stream MUST be stopped at the limit, and a response without a readable stream MUST fail closed rather than using an unbounded `text()` or `arrayBuffer()` fallback. Cancellation is best effort: a cancellation rejection MUST NOT replace the local `cybermap_response_too_large` error. This includes Tzeentch's canonical paper-state Cybermap backend read.
- **FR-004**: Error responses MUST contain only bounded local contract fields, never rejected or malformed-success upstream payload text. A successful non-JSON backend body MUST fail locally with a bounded 502 response.
- **FR-005**: Existing valid request contracts, timeouts, token headers, and no-store responses remain unchanged.

## Success Criteria

- **SC-001**: Tests prove an oversized batch/global request causes no backend fetch.
- **SC-002**: Tests prove oversized JSON/MVT backend bodies are not consumed or returned.
- **SC-003**: The single 1 MiB policy matches the documented VM ingress limit.
- **SC-004**: Focused Cybermap proxy suites pass without live endpoints.
- **SC-005**: Tests prove viewport-derived routes reject an oversized declared request before fetch, Tzeentch does not read an oversized canonical paper-state body, and malformed successful upstream JSON never reaches callers.
- **SC-006**: Tests prove operator-signals and paper-state routes cancel both declared and unannounced oversized backend responses, and a failed stream cancellation retains the bounded local error.
