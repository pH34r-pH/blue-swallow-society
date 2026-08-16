# Implementation Plan: Atomic Passcode Attempt Reservation

**Spec**: [spec.md](./spec.md)

1. Add a deterministic collision-capable Azure Table fake and a twelve-way production limiter burst test.
2. Replace handler `check()` then `recordFailure()` sequencing with `reserveAttempt()` before passcode verification.
3. In the Azure Table limiter, atomically create/update the count under ETag, return the resulting ETag as the reservation, and reject at or above the configured limit before mutation.
4. Make successful reset conditional on the reservation ETag. Treat a concurrent delete/update conflict as an already-safe no-op; treat operational failure as unavailable.
5. Preserve existing headers, fail-closed behavior, expiry cleanup, and configuration boundaries.
