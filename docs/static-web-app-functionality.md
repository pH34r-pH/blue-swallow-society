# Static Web App Functionality

## Overview

The Blue Swallow Society Static Web App is split into two halves:

1. **Public Face** at `/`: public project copy plus the Wardriver APK/download metadata.
2. **Operator console** at `/operator` and `/agent`: SWA-authenticated HTML/JS/CSS/modules plus a server-side passcode gate that issues the app bearer token used by operator APIs.

The public root does not link to, embed, or name the operator half.

## Public Face

The public page includes:

- Blue Swallow Society public manifesto copy.
- Wardriver APK download link.
- Wardriver build metadata link.
- APK package/version/size/build facts.
- APK SHA-256 checksum.

The public page intentionally has no script tag and no operator API names.

## Operator Console

The operator console keeps the cyberpunk terminal shell and tabbed workbench under protected assets:

- `app/operator/index.html`
- `app/operator/main.js`
- `app/operator/styles.css`
- `app/operator/*.mjs`
- `app/operator/agent.html`
- `app/operator/agent.js`

### Authentication

- SWA Easy Auth protects `/operator`, `/operator/*`, `/agent`, and `/agent.html`.
- `/api/validate-passcode` is also SWA-authenticated.
- The passcode is validated server-side from `BLUE_SWALLOW_PASSCODE_SHA256`.
- The operator session token is signed server-side with independent `BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY` material.
- The client has no hardcoded passcode, fallback secret, signing key, or local bypass.
- A successful passcode check returns a short-lived operator session token.
- Operator APIs require that token via `Authorization: Bearer ...` or `X-Blue-Swallow-Operator-Token`.

### Operator Tabs

The operator console includes:

1. **Landing**: internal workbench landing copy and Wardriver download card.
2. **Tzeentch**: OSINT and paper-market surfaces.
3. **Godeye**: hosted WiGLE/local map viewer.

The Tzeentch network feeds are lazy-loaded only after the Tzeentch tab is opened.

### Tzeentch Market Surface

- `/api/tzeentch` is passcode-token protected at the Function layer.
- The dashboard payload remains read-only and paper-only.
- CoinGecko and Polymarket Gamma are consumed as public sources; no API keys, exchange credentials, wallet credentials, or account tokens are embedded in the client.
- Any future live trading or bet-placement flow must use user-mediated sign-in / on-behalf-of authorization so the user authenticates directly with the target service.
- Actionable Intel remains paper-only: proposed buys and sells must include rationale, evidence, and source links for review/iteration.
- The Mosaic & Murmurs operating doctrine defines the dual-mind model, paper treasury loop, sensorium roadmap, governance gates, and embodiment milestones in [`docs/mosaic-and-murmurs-operating-doctrine.md`](./mosaic-and-murmurs-operating-doctrine.md).

## API Integration

Protected operator APIs:

- `/api/validate-passcode` (POST): server-side passcode validation.
- `/api/osint` (POST): public-source target scan / overview.
- `/api/tzeentch` (GET): read-only dashboard and paper books.
- `/api/wigle` (GET): local/current WiGLE snapshot proxy.
- `/api/agent` (POST): protected agent prompt route.
- `/api/profile` (GET): protected profile endpoint.

Public API:

- `/api/echo` remains public scaffold/demo plumbing for the VM echo path.

## Security Considerations

- Public HTML/CSS contains only the Blue Swallow Society passcode split and the standard event-planning branch; it does not link to Wardriver artifacts or operator entrypoints.
- `/operator` is unlinked from root and requires a passcode-issued session in browser state before showing the console.
- Operator APIs and Wardriver downloads are routed anonymously through SWA so the passcode flow can reach them, then fail closed inside Functions through `requireOperatorToken`.
- OSINT prompts and targets use POST bodies rather than query strings.
- Sensitive investigation state uses session storage, not durable local storage.
- Production CSP keeps browser connections same-origin.
- Local dev server returns JSON `501` for unmounted `/api/*` routes instead of masking them with SPA HTML.
- Sample WiGLE data is explicitly labeled as demo data.
