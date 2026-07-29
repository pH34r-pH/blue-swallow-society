# Tasks: Wardriver mTLS Proxy Secret Delivery

- [x] T001 Add RED installer contracts for a dedicated Caddy proxy-secret file and Caddy-only systemd environment.
- [x] T002 Atomically provision the dedicated file and drop-in; reload systemd and restart Caddy.
- [x] T003 Run focused and complete test suites, static secret-boundary checks, Graphify refresh, and diff checks.
- [x] T004 Commit and deploy through canonical Society CI; verify live service state and proxy-assertion boundary without disclosing credentials.
- [ ] T005 Collect Tyler's bss.18 physical upload receipt.
- [x] T006 Add RED/GREEN API contracts for the three bounded mTLS authorization-stage diagnostics on batch and viewport routes, including untrusted-diagnostic suppression and unread-request draining; preserve the existing generic `403` response and pre-existing token lane when no mTLS assertion is present; run focused and full local suites and refresh Graphify.
- [ ] T007 Commit and deploy the server-only diagnostic; collect one post-deployment field retry and correlate only the bounded server category.
- [x] T008 Add a RED installer contract that rejects the two conflicting Caddy removal directives, remove only those directives, and verify that the trusted `header_up` replacements remain.
- [ ] T009 Run focused and full Node suites, syntax/secret contracts, Graphify, independent review, canonical CI/CD deployment, a sanitized internal assertion-boundary receipt, and exactly one new Tyler field upload.
