# Static Web App Functionality

## Overview

The Blue Swallow Society Static Web App is a passcode split:

1. **Root face** at `/`: the unchanged Blue Swallow Society login screen.
2. **Standard branch**: any non-operator passcode opens the event-planning personal site.
3. **Operator branch**: the operator passcode calls `/api/validate-passcode`, receives a short-lived operator token, and loads the hidden operator shell.

The public root does not link to, embed, or name the operator half or Wardriver artifacts.

## Root Face

The public root includes only:

- `Blue Swallow Society` title.
- Passcode text entry.
- `login` button.
- Hidden event-planning branch markup for non-operator passcodes.

The root page has no Wardriver APK link, no APK metadata link, no operator API names, and no client-side passcode literal or hash.

## Operator Console

The static `/operator` entrypoint ships only a loader:

- `app/operator/index.html`
- `app/operator/loader.js`
- `app/operator/styles.css`

The actual operator shell markup lives outside the public static app at:

- `api/_private/operator/shell.html`

`/operator/loader.js` reads the passcode-issued token from session storage, fetches `/api/operator-shell` with `X-Blue-Swallow-Operator-Token`, injects the private shell, then imports `/operator/main.js` and related modules.

### Authentication

- `/api/validate-passcode` is anonymously reachable so the public login can call it.
- The passcode is validated server-side from `BLUE_SWALLOW_PASSCODE_SHA256`.
- The operator session token is signed server-side with independent `BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY` material.
- The client has no hardcoded passcode, fallback secret, signing key, or local bypass.
- A successful passcode check returns a short-lived operator session token.
- Operator APIs require that token via `X-Blue-Swallow-Operator-Token`; APIs also accept bearer tokens for local/tests, but the custom header is preferred because SWA/platform auth can reserve or mutate `Authorization`.

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

Passcode/operator APIs:

- `/api/validate-passcode` (POST): server-side passcode validation.
- `/api/operator-shell` (GET): private operator shell markup; requires operator token.
- `/api/operator-downloads/wardriver/{apk|metadata}` (GET/HEAD): private Wardriver artifacts; requires operator token.
- `/api/osint` (POST): public-source target scan / overview; requires operator token.
- `/api/tzeentch` (GET): read-only dashboard and paper books; requires operator token.
- `/api/wigle` (GET/POST): local/current WiGLE snapshot proxy; requires operator token.
- `/api/agent` (POST): protected agent prompt route; requires operator token.
- `/api/profile` (GET): protected profile endpoint.

Public API:

- `/api/echo` remains public scaffold/demo plumbing for the VM echo path.

## Security Considerations

- Public HTML/CSS contains only the Blue Swallow Society passcode split and the standard event-planning branch.
- `/operator` does not ship the operator shell; it only ships a token-aware loader.
- `/api/operator-shell` fails closed without `X-Blue-Swallow-Operator-Token`.
- `/downloads/*` returns `404`.
- Wardriver APK and metadata live under `api/_private/downloads/` and are served only by `/api/operator-downloads/wardriver/{apk|metadata}` after operator-token validation.
- Operator APIs are routed anonymously through SWA so the passcode flow can reach them, then fail closed inside Functions through `requireOperatorToken`.
- OSINT prompts and targets use POST bodies rather than query strings.
- Sensitive investigation state uses session storage, not durable local storage.
- Production CSP keeps browser connections same-origin.
- Local dev server returns JSON `501` for unmounted `/api/*` routes instead of masking them with SPA HTML.
- Sample WiGLE data is explicitly labeled as demo data.
