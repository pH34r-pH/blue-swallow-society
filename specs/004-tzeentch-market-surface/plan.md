# Implementation Plan: Tzeentch Market Surface

1. Keep a public read-only backend payload that normalizes Murmurs, Crypto, Polymarket, and Actionable Intel data.
2. Render a swipeable sub-tab carousel in the Tzeentch frontend and wire it into the existing dashboard shell.
3. Add chart rendering for crypto 24h / 5d views and card layouts for Polymarket and Actionable Intel.
4. Cover the data-contract behavior with Node tests and update docs/specs for the no-secrets / user-mediated-auth rule.
