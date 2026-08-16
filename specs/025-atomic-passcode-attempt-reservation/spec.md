# Feature Specification: Atomic Passcode Attempt Reservation

**Feature Branch**: `fix/issue-31-atomic-passcode`
**Created**: 2026-08-15
**Status**: Active
**Input**: Society issue #31

## Scope

Each passcode submission must reserve one shared attempt before the passcode is verified. The durable Azure Table record is the authority. A local process must not admit more than the configured caller-key attempt ceiling during a concurrent burst.

## Functional Requirements

- **FR-001**: `reserveAttempt` must atomically create or ETag-update one caller/window record and return a reservation only when its pre-increment count is below `maxAttempts`.
- **FR-002**: A concurrent stale read, create conflict, update conflict, expiry deletion race, or retry exhaustion must never admit an unreserved verification. Storage failure must fail closed.
- **FR-003**: The passcode handler must reserve before `verifyPasscode`. The first `maxAttempts` reservations may verify; later requests must return existing 429 plus `Retry-After`.
- **FR-004**: A valid passcode must clear its own reservation only when the returned ETag remains current. A conflicting later reservation must not be deleted by a stale reset.
- **FR-005**: The mutation retry count must be bounded and enough to turn the deterministic twelve-request collision burst into five admissions and seven 429 outcomes.

## Acceptance Criteria

1. Twelve concurrent invalid submissions at `maxAttempts=5` yield exactly five 401 responses and seven 429 responses.
2. The Azure Table limiter test forces create/update conflicts and checks the durable record never exceeds five.
3. Sequential valid authentication still clears an otherwise current rate-limit record.
