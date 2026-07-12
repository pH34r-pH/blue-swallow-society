# Mosaic & Murmurs Paper Memory Loop

**Status:** Proposed P2 architecture
**Date:** 2026-07-11
**Scope:** Tzeentch OSINT dashboard, Mosaic/Murmurs agent loops, paper trading, internal narrative stream, Jetson-local runtime, VM API memory backend
**Related doctrine:** [`Mosaic & Murmurs Operating Doctrine`](./mosaic-and-murmurs-operating-doctrine.md)
**Related proposals:** [`Dream Consolidation`](./mosaic-and-murmurs-dream-consolidation-proposal.md), [`Morning Brief`](./mosaic-and-murmurs-morning-brief-proposal.md), [`Cybermap Geospatial Backend`](./cybermap-geospatial-backend.md), [`VM API`](./vm-api.md)

## Executive summary

Tzeentch should become a **two-primary-loop paper intelligence system with supporting loops**:

1. **Primary: Mosaic loop** — evidence-bound truth accounting, claim confidence, resolved-outcome scoring, paper ledger state, and fact-memory patches.
2. **Primary: Murmurs loop** — public-perception accounting, virality, platform jumps, narrative mutation, manipulation caveats, and perception-memory patches.

Supporting loops do not become additional minds. They are mechanics around the two primaries:

- **Bridge loop:** compares Mosaic truth, Murmurs belief, and market-implied belief; emits perceptual deltas and autonomous paper-only decisions with risk-policy evidence.
- **Paper ledger loop:** marks books, appends fills/marks/skips, and preserves simulated balances.
- **Narrative loop:** writes bounded internal voice fragments for Mosaic, Murmurs, and Bridge on the same cadence as the paper loop, then feeds daily consolidation.
- **Memory sync loop:** queues evidence-backed fact/perception/calibration patches for review.
- **Source health loop:** records stale sources, retrieval degradation, and sync-delay state.

Canonical loop-record field names are **snake_case** (`run_id`, `loop_id`, `time_window`, `source_refs`, `review_required`). SWA/browser code may adapt records to camelCase internally, but persisted loop records, local JSONL ledgers, and VM API payloads use snake_case.

The runtime should move **out of the Static Web App** and onto the local Jetson/operator device stack. The Static Web App remains the protected dashboard/download surface. The VM becomes the authenticated API and database-backed memory spine so hourly paper actions, journal fragments, and daily consolidation stay coherent across restarts and devices.

## Current implementation anchor

Current repo state already has the right seams:

- `/api/tzeentch` returns a token-gated, paper-only dashboard payload from public feeds.
- The operator shell lazy-loads Tzeentch panels for Murmurs, Crypto, Polymarket, and Actionable Intel.
- Paper books are server/function-side ledgers and can persist through `BLUE_SWALLOW_PAPER_LEDGER_PATH`.
- `docs/vm-api.md` names the VM target as the future Cybermap API gateway with memory sync endpoints.
- The daily dream cycle and morning brief specs already define daily journal output, memory consolidation, and per-book paper PnL.

This proposal formalizes the missing middle: **hourly/day-level write loops** and the **operator-facing stream-of-consciousness narrative surface**.

## Product model

### Agent ownership

| Surface | Owning loop | Loop role | Primary duty | Writes |
|---|---|---|---|---|
| Mosaic tab / Actionable Intel | Mosaic | primary | truth accounting, evidence, confidence, paper thesis quality | `claim_memory`, `paper_action_candidate`, `paper_ledger_event`, `narrative_fragment` |
| Murmurs tab | Murmurs | primary | hype weather, spread kinetics, public belief shifts | `perception_memory`, `narrative_cluster`, `narrative_fragment` |
| Bridge / paper treasury | Bridge | supporting | compare truth/perception/market deltas and select autonomous paper-only actions | `perceptual_delta`, `risk_policy_decision`, `paper_ledger_event` |
| Paper ledger | Paper | supporting | mark books, preserve simulated balances, append marks/fills/skips | `paper_ledger_event`, `paper_book_summary` |
| Memory sync | Memory sync | supporting | queue evidence-backed memory patches and calibration notes | `memory_patch`, `source_reliability_event` |
| Source health | Source health | supporting | record source stale/degraded/sync-delayed state | `source_reliability_event` |
| Daily journal | Dream cycle | supporting | consolidate the day into durable meta-narrative | `daily_journal_entry`, `memory_patch`, `calibration_note` |
| Dashboard stream | SWA operator UI | read-only surface | read the latest narrative and paper state | read-only materialized snapshots |

The UI can keep the existing Actionable Intel lane or rename/split it into **Mosaic**. The contract should treat Mosaic as the owner either way: it speaks in evidence, counter-evidence, calibration, autonomous investment decisions, and machine-enforced risk-policy language.

### Cadences

| Cadence | Name | Trigger | Required output |
|---|---|---|---|
| 5-15 min optional | `pulse` | source changed, market moved, or operator requested refresh | lightweight Murmurs cluster update or Mosaic claim-status update; no paper order unless guardrails pass |
| Hourly | `paper_tick` | scheduler tick while runtime healthy | paper book mark, candidate actions, Mosaic and Murmurs narrative fragments, run manifest |
| Daily morning | `wake_brief` | 06:30 America/Los_Angeles by default | morning brief, paper footer, stale-source report |
| Daily evening/night | `dream_consolidation` | end-of-day window | fact/perception digests, memory patches, resolved thesis scoring, meta-narrative journal entry |
| On demand | `operator_override` | user inspects or overrides autonomous state | override record and training/calibration note; not a prerequisite for investment execution |

Hourly and daily loops share the same ledger. The hourly loop makes small bets in the paper machine; the daily loop decides what the machine learned.

## Stream-of-consciousness operator surface

The operator side should replace placeholder/lorem-style explanatory copy with **bounded internal narrative** from Mosaic and Murmurs.

This is not unstructured roleplay. Treat each fragment as a typed audit object with a voice field:

```ts
type NarrativeFragment = {
  fragment_id: string;
  agent: 'mosaic' | 'murmurs' | 'bridge';
  loop_id: 'mosaic' | 'murmurs' | 'bridge' | 'narrative';
  loop_role: 'primary' | 'supporting';
  cadence: 'pulse' | 'paper_tick' | 'wake_brief' | 'dream_consolidation' | 'operator_review';
  run_id: string;
  generated_at: string;
  time_window: { start: string; end: string };
  title: string;
  body_markdown: string;
  tone: 'clinical' | 'watchful' | 'uncertain' | 'alarm' | 'dream';
  linked_entities: string[];
  evidence_refs: string[];
  paper_action_refs: string[];
  memory_refs: string[];
  caveats: string[];
  visibility: 'operator_only';
  paper_only: true;
};
```

### UI behavior

- **Mosaic stream:** concise truth-state monologue: what changed, what evidence matters, what remains unresolved, what paper action is proposed or suppressed.
- **Murmurs stream:** perception monologue: what the crowd is amplifying, where narrative velocity moved, what looks manipulated, where silence is meaningful.
- **Bridge interleaves:** short delta notes when truth/perception/market estimates diverge enough to matter.
- Every stream card shows `generated_at`, `cadence`, `run_id`, source count, linked paper actions, and caveats.
- The operator can filter by cadence, agent, source family, paper book, and unresolved contradictions.
- Empty states should say why the loop is quiet: `source stale`, `market closed`, `no delta above threshold`, `auth missing`, or `runtime offline`.

### Voice rules

Use diegetic voice, but keep auditability intact:

- Mosaic: `I can prove this much. I cannot prove the rest yet.`
- Murmurs: `The crowd is teaching itself a shape before the facts arrive.`
- Bridge: `The market is late, but only if Mosaic's confidence survives the next source check.`

Forbidden voice patterns:

- no omniscience
- no fate/certainty language
- no plain `buy`/`sell` without `PAPER ONLY`
- no narrative fragment promoted into fact memory without evidence refs
- no real-money, account-bound, social-posting, or physical action from a stream fragment

## Runtime architecture

```text
Jetson / local operator device
  - Hermes/BSS scheduler
  - Mosaic agent loop
  - Murmurs agent loop
  - Bridge/paper loop
  - local outbox + retry/idempotency cache
        |
        | authenticated API writes
        v
VM API gateway
  - /api/v1/agent-loops/*
  - /api/v1/narrative/*
  - /api/v1/paper/*
  - /api/v1/memories/*
  - /api/v1/cybermap/*
        |
        v
Azure PostgreSQL Flexible Server + PostGIS
  - append-only ledgers
  - materialized dashboard snapshots
        ^
        |
SWA Functions proxy
  - token-gated read APIs for operator dashboard
        ^
        |
Static Web App operator UI
  - dashboard/download/observability/override surface only
```

The Static Web App should not run autonomous loops. It reads snapshots and may submit explicit overrides, but investment execution does not wait for human review. The Jetson/local runtime runs Mosaic and Murmurs because it has the right privacy posture, local model access, and operator-adjacent context. The VM/API keeps decisions, idempotency, risk-policy evidence, and memory coherent.

## VM API contract extensions

Use the same `/api/v1/*` target namespace already reserved in `docs/vm-api.md`.

### Loop runs

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/agent-loops/runs` | Start a Mosaic, Murmurs, Bridge, paper tick, or dream run manifest with idempotency key. |
| `PATCH /api/v1/agent-loops/runs/{runId}` | Mark run complete/failed/review-required and attach output refs. |
| `GET /api/v1/agent-loops/status?agent=&since=` | Dashboard/runtime health, last successful tick, source degradation, backlog depth. |

### Narrative

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/narrative/fragments` | Append Mosaic/Murmurs/Bridge internal narrative fragments. |
| `GET /api/v1/narrative/stream?agent=&cadence=&since=&limit=` | Read operator-visible stream fragments for dashboard cards. |
| `POST /api/v1/journal-entries` | Append daily meta-narrative journal entries after dream consolidation. |
| `GET /api/v1/journal-entries?agent=&date=&limit=` | Read daily journal history for operator review/export. |

### Paper loop

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/paper/books` | Read configured paper books, exposure, PnL, stale marks, and cooldown state. |
| `POST /api/v1/paper/action-decisions` | Append autonomous paper-only buy/sell/watch/avoid decisions with evidence, risk-policy result, and idempotency key. |
| `POST /api/v1/paper/ledger-events` | Append fills, marks, exits, skips, stale-source suppressions, and operator overrides. |
| `GET /api/v1/paper/actions?status=&book=&since=` | Read autonomous paper action and override history. |

### Memory sync

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/memories?agent=&since=` | Pull durable Mosaic/Murmurs memory records and patches since a cursor. |
| `POST /api/v1/memories/patches` | Submit evidence-backed memory patches; review required unless policy allows auto-merge. |
| `POST /api/v1/source-reliability/events` | Record source reliability and retrieval degradation events. |

All write endpoints require:

- scoped loop/device auth token, never stored in static assets
- idempotency key
- `agent`, `run_id`, `generated_at`, and `source_refs` where applicable
- append-only persistence
- audit fields: `created_by`, `created_from`, `operator_scope`, `review_required`

## Data model sketch

```ts
type AgentLoopRun = {
  run_id: string;
  loop_id: 'mosaic' | 'murmurs' | 'bridge' | 'paper' | 'narrative' | 'memory_sync' | 'source_health';
  loop_role: 'primary' | 'supporting';
  agent: 'mosaic' | 'murmurs' | 'bridge' | 'paper' | 'narrative' | 'memory_sync' | 'source_health';
  cadence: 'pulse' | 'paper_tick' | 'wake_brief' | 'dream_consolidation' | 'operator_review';
  started_at: string;
  ended_at?: string;
  status: 'running' | 'completed' | 'failed' | 'review_required';
  time_window: { start: string; end: string };
  source_refs: string[];
  output_refs: string[];
  warnings: string[];
  idempotency_key: string;
  paper_only: true;
  review_required: boolean;
};

type PaperBookSummary = {
  book_id: 'prediction_markets' | 'crypto' | 'equity_watch' | 'local_event_watch' | 'ai_cyber_watch';
  display_name: string;
  loop_affinity: 'mosaic' | 'murmurs' | 'bridge';
  instrument_type: 'prediction_market' | 'crypto' | 'equity_watch' | 'local_event_watch' | 'other_paper_only';
  starting_balance: 1000;
  cash_balance: number;
  equity: number;
  open_position_count: number;
  gross_paper_exposure: number;
  daily_pnl: number;
  cumulative_pnl: number;
  drawdown_pct: number;
  stale_open_marks: number;
  status: 'flat' | 'up' | 'down' | 'stale';
};

type PaperActionCandidate = {
  candidate_id: string;
  run_id: string;
  action: 'PAPER_BUY' | 'PAPER_SELL' | 'WATCH' | 'AVOID';
  book_id: string;
  instrument_type: 'prediction_market' | 'crypto' | 'equity_watch' | 'local_event_watch' | 'other_paper_only';
  instrument_ref: string;
  paper_size: number;
  thesis: string;
  mosaic_claim_refs: string[];
  murmur_cluster_refs: string[];
  perceptual_delta_refs: string[];
  evidence_refs: string[];
  counter_evidence_refs: string[];
  entry_condition?: string;
  exit_condition?: string;
  expires_at: string;
  confidence: 'low' | 'medium' | 'high';
  autonomous_execution: true;
  risk_policy_passed: true;
  idempotency_key: string;
  paper_only: true;
  status: 'draft' | 'queued' | 'paper_open' | 'paper_closed' | 'rejected' | 'skipped';
};

type MemoryPatch = {
  patch_id: string;
  run_id: string;
  agent: 'mosaic' | 'murmurs' | 'memory_sync';
  target: 'claim_memory' | 'perception_memory' | 'source_reliability' | 'calibration' | 'meta_narrative';
  action: 'add' | 'update' | 'expire' | 'merge' | 'flag_for_review';
  evidence_refs: string[];
  summary: string;
  review_required: boolean;
  paper_only: true;
  status: 'pending' | 'applied' | 'rejected';
};
```

## Storage policy

Prefer append-only ledgers plus materialized views:

| Store/table | Write owner | Read surface | Retention |
|---|---|---|---|
| `agent_loop_runs` | Jetson loops / VM scheduler | operator health cards | durable audit |
| `narrative_fragments` | Mosaic/Murmurs/Bridge | stream cards | durable, operator-only |
| `daily_journal_entries` | dream cycle | journal history/export | durable, append-only |
| `paper_action_candidates` | Bridge/Mosaic | Actionable Intel/Mosaic | durable audit |
| `paper_ledger_events` | paper loop | paper books/footer | durable audit |
| `memory_patches` | dream/hourly loops | review queue | durable until applied/rejected |
| `source_reliability_events` | loops/adapters | source health | durable calibration |
| `dashboard_snapshots` | VM materializer | SWA read API | rolling/latest + bounded history |

Raw source payloads should not be stored unless policy explicitly allows it. Store source refs, hashes, retrieval time, and compact extracts by default.

## Jetson/local loop requirements

The local runtime needs an offline-safe outbox:

1. Build run manifest locally.
2. Gather public/source summaries according to source terms.
3. Generate Mosaic/Murmurs outputs and autonomous paper decisions after machine-enforced risk checks.
4. Write all outputs to local spool with deterministic IDs.
5. POST to VM API with idempotency keys.
6. Retry with backoff while preserving ordering per run.
7. Mark local run synced only after VM returns persisted refs.
8. Never drop unsynced paper/journal events silently.

If the VM is down, the dashboard should show `runtime syncing delayed`, not invent data. No demo/fallback feed data at runtime.

## Governance

- All market actions remain paper-only and execute autonomously only after machine-enforced capital, exposure, drawdown, cooldown, stale-data, and idempotency controls pass.
- No real-money trade, prediction-market bet, wallet, brokerage, social post, purchase, or physical action can be emitted by these loops.
- Operator override, pause, and policy-change records are themselves ledger events, not hidden state changes.
- Narrative fragments do not count as evidence. They may link to evidence.
- Murmurs perception memory cannot promote into Mosaic fact memory without Mosaic evidence review.
- VM write tokens must be scoped to loop/device roles and rotated independently from operator UI tokens.
- SWA static assets must never contain loop write tokens, API secrets, or passcode material.
- All dashboard read paths remain token-gated by operator session.

## Implementation plan

### P0 — Contract and local fixtures

- Add JSON fixtures for `AgentLoopRun`, `NarrativeFragment`, `PaperActionDecision`, and `MemoryPatch`.
- Extend tests so paper decisions require `paperOnly`, `executionMode: autonomous`, `riskPolicyRef`, `idempotencyKey`, evidence refs, and source/cadence/run IDs.
- Add empty-state UI copy for `runtime offline`, `source stale`, and `no delta above threshold`.

### P1 — VM API write/read skeleton

- Replace the echo-only VM service with a small API gateway skeleton that exposes health, ready, loop-run, narrative, paper, and memory endpoints.
- Start with SQLite or local JSON only if Postgres is not ready, but preserve the same API contract.
- Add auth middleware, idempotency, structured errors, and append-only writes.

### P2 — Dashboard narrative stream

- Add Mosaic/Murmurs stream cards to the operator Tzeentch surface.
- Wire read-only `/api/tzeentch` payloads to include recent `narrativeFragments`, paper action refs, and last loop status.
- Replace placeholder explanatory copy with live stream cards and honest empty states.

### P3 — Local Jetson scheduler

- Run hourly `paper_tick` loops on the Jetson through Hermes/BSS scheduler.
- Maintain a local outbox and sync to the VM API.
- Keep daily dream consolidation and morning brief tied to the same paper/memory ledger.

### P4 — Postgres materialization

- Move append-only ledgers into Azure PostgreSQL Flexible Server.
- Add materialized dashboard snapshots for fast SWA reads.
- Add migration/ready checks and backup/export path.

## Acceptance criteria

- The operator dashboard can show latest Mosaic and Murmurs narrative fragments without hardcoded placeholder copy.
- Every narrative fragment is tied to a run, cadence, timestamp, evidence refs or caveats, and optional paper action refs.
- Hourly paper ticks can write paper candidates and ledger events to the VM API from the local runtime with idempotency.
- Daily dream consolidation can write journal entries and reviewable memory patches to the same memory spine.
- The Static Web App remains a read/review surface; autonomous loops run locally or server-side, never in static browser code.
- VM/API memory remains coherent across restarts and SWA redeploys.
- Missing/stale sources suppress new paper orders for affected books and render visible stale-state copy.
- No runtime path seeds fake/demo feed data into Tzeentch.
- No real-money or account-bound write can occur from Mosaic, Murmurs, Bridge, paper, or narrative loops.
