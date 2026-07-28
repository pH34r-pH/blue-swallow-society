# Tasks: Wardriver mTLS Proxy Secret Delivery

- [x] T001 Add RED installer contracts for a dedicated Caddy proxy-secret file and Caddy-only systemd environment.
- [x] T002 Atomically provision the dedicated file and drop-in; reload systemd and restart Caddy.
- [x] T003 Run focused and complete test suites, static secret-boundary checks, Graphify refresh, and diff checks.
- [ ] T004 Commit and deploy through canonical Society CI; verify live service state and proxy-assertion boundary without disclosing credentials.
- [ ] T005 Collect Tyler's bss.18 physical upload receipt.