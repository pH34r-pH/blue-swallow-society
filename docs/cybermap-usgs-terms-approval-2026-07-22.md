# USGS Earthquake Hazards Terms Review and Controlled Enablement Receipt

**Status:** approved for controlled USGS-only validation; not a live-source enablement
**Reviewed at:** 2026-07-22T20:18:30.000Z
**Approval authority:** Tyler's 2026-07-22 approval on Kanban task `t_083808b1`

## Approved scope

The approval covers only the USGS Earthquake Hazards P0 source for T020 controlled validation. It does not authorize GDACS, NASA EONET, credentials, a production scheduler, a provider-data call, or deployment enablement.

## Provider review

- Provider data context: [USGS Real-time Notifications, Feeds, and Web Services](https://earthquake.usgs.gov/earthquakes/feed/) documents the Earthquake Catalog GeoJSON Summary Feed.
- Terms and credit record: [USGS Copyrights and Credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits).
- Observed policy: USGS-authored or produced data and information are considered U.S. public domain; non-USGS material can be marked copyrighted and requires separate permission.
- Required display credit: `U.S. Geological Survey`.
- BSS use is an aggregate seismic-event context layer. It must retain `public_report_not_local_observation` and `coverage_incomplete`; it must not use USGS marks or assert local observation, completeness, or provider endorsement.

## Server-side configuration

`vm/cybermap-api/src/sources/usgs-earthquakes.mjs` records the review URL, timestamp, and attribution. Its default remains `enabled: false` and `allowed_preload: false`. The module has no transport or scheduler surface.

GDACS and NASA EONET remain unreviewed and disabled:

| Source | `terms_reviewed_at` | `enabled` | `allowed_preload` |
|---|---|---:|---:|
| `gdacs-alerts` | `null` | false | false |
| `nasa-eonet-events` | `null` | false | false |

## TST-009 controlled validation

Executed from `vm/cybermap-api` with Node `v24.18.0`:

```text
node --test test/greenfeed-source-adapters.test.mjs
```

Result: 5 passed, 0 failed. `TST-009 runs reviewed USGS fixture data only, then records the source as disabled` injects the owned synthetic USGS normalization fixture. It enables only an immutable in-memory test source, writes two normalized snapshots, then disables that test source and proves no second fetch occurs. The test also proves GDACS and NASA EONET remain disabled and unreviewed.

This receipt is controlled fixture evidence, not operational proof. No live USGS data endpoint, credential, scheduler, persistent catalog update, or deployment was invoked.
