# 006 — Test Design

## Environment

Fresh checkout prerequisite: `(cd api && npm ci --ignore-scripts)`. Unit and integration tests run locally against fixture state, a memory-backed VM store, or a temporary render directory. The production acceptance gate runs only after deployment, with real scheduler receipts and the authenticated operator boundary.

## Test matrix

| ID | Coverage | Procedure / expected observation | Path |
|---|---|---|---|
| TST-001 | FR-001, FR-002; withheld behavior | Submit malformed market marks, a stale or failed wake, and a boundary-priced binary contract. No ledger mutation/archive/dispatch survives invalid input; prediction contract and fill prices remain in [0, 1] while execution costs remain explicit. | `tests/paper_market_data_test.py`, `tests/execution_costs_test.py`, `tests/paper_memory_loop_test.py`, `tests/morning_brief_publish_test.py` |
| TST-002 | FR-003, SC-001; deterministic collection and Field Dossier rendering | Collect a run twice under fixtures and render retained/fresh evidence. The collector writes a deterministic provenance-preserving delivery Markdown alongside the manifest; the seven required lanes, ordered unique 1200x1500 PNG pages, deterministic package fields, source index, and local-path redaction are present. | `tests/morning_brief_collect_test.py`, `tests/morning_brief_field_dossier_test.py` |
| TST-003 | FR-004, SC-002; archive/dispatch contract | Build an archive envelope, normalize cross-runtime integral JSON numerics before remote canonical-state comparison, assert read-back byte/hash equality, plan batches of at most ten pages, and prove replay/withhold behavior. | `tests/morning_brief_publish_test.py` |
| TST-004 | FR-004; single package identity | Convert a validated render into a dispatchable package and assert every Discord delivery receipt carries the exact archive-envelope `package_sha256`. | `tests/morning_brief_publish_test.py` |
| TST-005 | FR-005, FR-006; VM archive | Exercise private VM POST/list/detail/artifact behavior, token denial, append-only replay/conflict, no-store, and artifact-hash rejection. | `vm/cybermap-api/test/morning-brief.test.mjs` |
| TST-006 | FR-005; package binding | Mutate an otherwise valid request after its hash is sealed. The VM returns `422 invalid_morning_brief`; it never archives an unbound hash. | `vm/cybermap-api/test/morning-brief.test.mjs` |
| TST-007 | FR-007; exactly one scheduler authority | Inspect deployment templates. The VM installer has no Discord webhook setting and creates/enables no `bss-morning-brief` service or timer; the local Hermes scheduler remains the sole automatic dispatch authority. | `tests/morning_brief_publish_test.py`, `infra/scripts/install-cybermap-api.sh` |
| TST-008 | FR-006, FR-007; SWA gateway/UI | Verify operator-token authentication, no-store headers, allowed proxy methods, artifact forwarding, UI token guard, and public-route denial. | `tests/morning-brief-api.test.mjs`, `tests/morning-brief-ui.test.mjs` |
| TST-009 | SC-003; production acceptance | Run wake → collect → validate → render → archive → scheduler-managed Discord delivery; fetch the archive through the authenticated live UI and compare its hash with the immutable package/receipt. | deployment receipt + live probes |

## Requirement coverage

| Requirement / acceptance | Tests |
|---|---|
| Invalid marks and stale/failed wake withhold before mutation/dispatch | TST-001 |
| Seven-lane deterministic Field Dossier and redaction | TST-002 |
| Batches ≤10, exact hash receipts, replay safety | TST-003, TST-004 |
| Append-only private archive, artifact verification, public denial | TST-005, TST-006, TST-008 |
| One scheduler authority and deployment-secret minimization | TST-007 |
| Fresh real package appears in authenticated live operator UI | TST-009 |

## Commands

```bash
PYTHONPATH=scripts python3 -m unittest discover -s tests -p '*test.py'
node --test tests/*.test.mjs vm/cybermap-api/test/*.test.mjs
bash -n infra/scripts/install-cybermap-api.sh
az bicep build --file infra/main.bicep --stdout >/dev/null
```
