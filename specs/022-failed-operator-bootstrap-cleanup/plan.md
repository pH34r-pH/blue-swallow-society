# Implementation Plan: Failed Operator Bootstrap Cleanup

**Spec**: [spec.md](./spec.md)

1. Add a controlled Node loader regression harness that supplies in-memory private assets and tracks `URL.revokeObjectURL`, public session state, and a private session module cleanup call.
2. Add a single cleanup seam in `app/operator/loader.js`; it owns public/private session clearing, object-URL revocation, and private style removal.
3. Wrap the entire private bootstrap in that seam and return `true` only after the private main boot succeeds.
4. Make `app/main.js` clear the public session and show the standard branch for a declined/rejected boot.

No live browser, deployment, or protected endpoint is accessed.
