# Feature Specification: Failed Operator Bootstrap Cleanup

**Feature Branch**: `fix/issue-37-clear-bootstrap-session`
**Created**: 2026-08-15
**Status**: Active
**Input**: GitHub issue #37 — a failed private bootstrap must terminate operator state before public fallback.

## User Scenarios & Testing

### User Story 1 — Fail closed after a private asset failure (Priority: P1)

After passcode authentication activates a public in-memory session, any private shell/asset failure returns the page to the public branch with no active public token.

**Independent Test**: A controlled loader test rejects one private asset, asserts a `false` boot result and no active public session, then proves a protected operator request is rejected before it can call `fetch`.

### User Story 2 — Remove staged private state after module failure (Priority: P1)

If private modules were staged and a later module import fails, the loader clears the private session module, revokes every staged object URL, removes staged private styles, clears public state, and returns the failure result.

**Independent Test**: A controlled loader test injects a failing private main module and tracks private-session cleanup and object-URL revocation.

## Edge Cases

- Direct `/operator` access continues to clear state and redirect home.
- A successful bootstrap remains unchanged and returns success.
- Cleanup itself must not place a bearer in browser storage, a URL, or the DOM.

## Requirements

- **FR-001**: `bootOperatorSurface()` MUST convert any private shell, asset, private-session, or private-main failure into a false result only after cleanup.
- **FR-002**: Cleanup MUST clear public and loaded private session modules, revoke staged object URLs, and remove staged private styles.
- **FR-003**: The public login handler MUST clear its session and render the standard site whenever the loader declines the handoff or rejects unexpectedly.
- **FR-004**: Successful handoff and expiry behavior MUST remain unchanged.

## Success Criteria

- **SC-001**: Controlled failures prove no active public token remains, no subsequent protected request can carry it, and all staged object URLs are revoked.
- **SC-002**: Existing successful root-handoff tests remain green where the runner is available.
- **SC-003**: Focused cleanup, session-boundary, and static shell tests pass.
