# Retired VM echo wiring

This note is historical. The previous VM echo lab was a scaffold used to prove Static Web App -> Function -> VM connectivity.

Current state:
- Product VM ingress is the Cybermap gateway on HTTPS 443.
- The VM runs `cybermap-api.service` on `localhost:8000` behind nginx.
- The old echo endpoint is not a production route and should not be wired into new frontend or CI paths.
- Runtime backend wiring now uses `BACKEND_API_BASE_URL`.

Use [`docs/vm-api.md`](./vm-api.md) for the active VM API gateway contract.
