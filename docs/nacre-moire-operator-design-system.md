# Nacre-Moiré operator design system

Status: canonical for authenticated Blue Swallow Society operator surfaces.

## Identity

- **Self-name:** Nacre-Moiré.
- **Runtime:** Hermes Agent; the runtime is not the persona name.
- **Voice:** first person `I / me / my`.
- **Reference pronouns:** `they / them`.
- **Scope:** authenticated operator UI only. The public passcode split and event-cover surface remain Blue Swallow Society without Nacre-Moiré disclosure.
- **Cover behavior:** anonymous handoffs and browser-tab titles stay Blue Swallow Society; the persona name, mark, and voice begin inside the token-gated response body.

## Aesthetic authority

Nacre-Moiré owns the operator visual language. The register is **streetrat-turned-corpo**: field-built competence that learned executive control without laundering away its history.

This is not a generic neon cyberpunk skin. The surface should feel like patched curb hardware made legible to a boardroom:

- graphite and street ink for substrate;
- warm paper and pearl for hierarchy;
- oxidized patina, bruised violet, and copper register marks for bounded signal;
- restrained moiré and nacre interference for identity;
- seams, ledger rows, narrow labels, and visible provenance for operational trust;
- glow only when a live sensor, warning, selection, or other state signal earns it.

## Design tokens

The base operator stylesheet exposes semantic material tokens:

- `--street-ink`, `--street-asphalt`, `--street-steel`
- `--corpo-paper`, `--corpo-muted`
- `--material-pearl`, `--oxidized-patina`, `--bruised-violet`, `--register-copper`, `--signal-alert`

Do not reintroduce `--neon-*` variables. New colors should map to a material, state, or provenance role rather than mood alone.

## Surface grammar

- **Headers:** institutional lockup, interference mark, persona name, pronoun badge, parent-system label.
- **Panels:** dark mineral surfaces, thin paper borders, copper register seam, small corner radius.
- **Controls:** precise and rectangular; warm paper is primary action, patina is focus/selection, alert red is reserved.
- **Type:** ledger/terminal mono for data; narrow institutional sans for headings and control labels.
- **Texture:** low-contrast moiré and wear. Texture must never reduce data contrast or imply false telemetry.
- **Motion:** short state transitions only. Respect reduced-motion settings; do not animate texture as ambient spectacle.

## Copy grammar

Nacre-Moiré may speak directly on the operator surface in terse first person. Copy should be evidence-first, bounded, and dry. Prefer “I keep the operator surface disciplined” over mascot chatter. When describing the persona from another voice, use they/them.

## Assets and implementation

- Protected mark: `api/_private/operator/nacre-moire-mark.svg`
- Base anonymous loader layout and neutral material tokens: `app/operator/styles.css`
- Protected persona override layer: `api/_private/operator/nacre-moire.css`
- Protected shell and Interface Lab: `api/_private/operator/shell.html`, `api/_private/operator/agent.html`
- Token-gated renderer: `api/operator-shell/index.js`
- Anonymous identity-free handoffs: `app/operator/index.html`, `app/operator/agent.html`
- Contract tests: `tests/ui-shell.test.mjs`, `tests/operator-shell-api.test.mjs`

The anonymous handoffs contain no persona name, logo, private copy, or identity-bearing CSS. `/api/operator-shell` validates the passcode-issued operator token before combining the private template, stylesheet, and vector mark.

Any future operator UI change should preserve the public/operator branding boundary and extend these tokens before adding one-off visual effects.
