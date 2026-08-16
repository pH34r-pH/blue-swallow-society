# Feature Specification: VM Echo Route Retirement

**Feature Branch**: `fix/issue-36-retire-vm-echo`
**Created**: 2026-08-15
**Status**: Active
**Input**: GitHub issue #36 — retire the direct public VM `/echo` route.

## User Scenarios & Testing

### User Story 1 — Reject the retired route (Priority: P1)

An unauthenticated caller requests `GET /echo` on the Cybermap API. The service returns the standard intentional `404` response and no legacy echo payload.

**Independent Test**: Run the focused VM HTTP test that requests `/echo`.

**Acceptance Scenarios**:
1. Given a running API and `GET /echo`, when the route resolves, then it returns `404` with `{ ok: false, error: "not_found" }`.
2. Given `/healthz` and `/readyz`, when a documented monitor requests them, then their existing behavior remains unchanged.

### User Story 2 — Limit the public Caddy forwarding surface (Priority: P1)

A request reaches the public TLS listener. Caddy forwards only documented Cybermap API and health paths and rejects unknown paths, including `/echo`, before proxying them.

**Independent Test**: Run a static installer/Caddy contract test.

**Acceptance Scenarios**:
1. Given the generated public Caddy block, when `/echo` or another unknown path is requested, then it receives an intentional `404`.
2. Given a documented public API/health path, when Caddy evaluates it, then it reaches the loopback Cybermap API.

## Edge Cases

- Query-bearing `/echo` requests remain rejected.
- The mTLS listener continues to allow only its existing two paths.
- This change does not deploy, modify ingress infrastructure, or broaden a backend route.

## Requirements

- **FR-001**: `GET /echo` MUST resolve through the normal not-found path and MUST NOT emit legacy echo data.
- **FR-002**: The public Caddy listener MUST explicitly allow only documented health and Cybermap API paths before reverse proxying.
- **FR-003**: The public Caddy listener MUST return `404` for unmatched paths.
- **FR-004**: `/healthz`, `/readyz`, and existing authenticated Cybermap paths MUST retain their current contracts.

## Success Criteria

- **SC-001**: Focused VM HTTP tests prove `/echo` returns `404` while health/readiness tests remain green.
- **SC-002**: The installer contract test proves the public Caddy block has an allowlist and default `404` path.
- **SC-003**: Focused VM tests, installer contract test, and whitespace validation pass with no live VM access.
