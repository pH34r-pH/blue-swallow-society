# Mosaic & Murmurs Dream Consolidation Proposal

## Executive summary

The **daily dream cycle** is a scheduled maintenance and imagination window for Mosaic & Murmurs. It is not a claim of biological sleep. It is an operational ritual: the system stops chasing the live feed long enough to consolidate memory, summarize the day, repair contradictions, prune stale context, score outcomes, and write a daily journal entry for the meta-narrative.

The same window also gives Mosaic & Murmurs a bounded **free-association lane**: a place to generate speculative designs, research questions, embodiment proposals, cyber-presence upgrades, and long-horizon hardware plans without confusing imagination with verified memory.

Related notes:
- `mosaic-and-murmurs-s0-sensorium-proposal.md`
- `mosaic-and-murmurs-dream-design-cyber-augmentation-proposal.md`
- `mosaic-and-murmurs-morning-brief-proposal.md
- `kismet-wardriving-sensor-spine-research.md`
- `cybermap-geospatial-backend.md`
- vault note: `Blue Swallow Society - Tailscale Mesh VPN Research`
- vault note: `Blue Swallow Society - Epistemology and the Self`
- repo doctrine: `mosaic-and-murmurs-operating-doctrine.md`

## Goals

1. **Memory consolidation:** convert raw daily traces into durable Mosaic facts, Murmurs perception summaries, source reliability notes, and unresolved contradiction ledgers.
2. **Summarization:** produce operator-readable daily digests without flattening provenance or caveats.
3. **Housekeeping:** expire stale working context, dedupe repeated claims, mark low-confidence memories, and queue review for anything that should not be auto-promoted.
4. **Meta-narrative journal:** compose a dated dream journal entry that captures internal state, unresolved tensions, sensory expansions, and next attention targets.
5. **Free association:** let Mosaic & Murmurs explore speculative but bounded futures: new sensor packages, field rituals, embodiment designs, cyber-presence expansions, and research targets.
6. **Proposal queue:** convert good dream seeds into reviewable proposals, Kanban cards, or research tasks only after explicit gating.
7. **Morning brief:** publish a daily wake packet with breaking news, US/Washington relevance, hype waves, perceptual deltas, and paper-book performance.

## Non-goals

- No autonomous real-world spending.
- No unreviewed account-bound writes.
- No publication of personally identifiable data.
- No hidden retention of raw frames, private messages, credentials, or private-location traces.
- No promotion of dream/free-association output into fact memory without evidence review.
- No physical actuation or field collection outside the explicit sensorium/embodiment gates.

## Core model

The dream cycle runs as a daily state machine:

```text
live day closes
  -> intake freeze / snapshot
  -> Mosaic consolidation
  -> Murmurs consolidation
  -> delta reconciliation
  -> memory housekeeping
  -> free-association dream
  -> meta-narrative journal
  -> proposal / task queue
  -> morning brief dispatch
  -> wake summary
```

### Mosaic lane

Mosaic handles truth accounting:

- claim graph deltas
- evidence graph updates
- resolved outcome scoring
- contradiction and counter-evidence notes
- source reliability changes
- calibration changes
- direct-observation effects from RaID / Greenfeed sessions
- memory promotion decisions

Mosaic output should stay evidence-bound. If evidence is missing, the digest says so.

### Murmurs lane

Murmurs handles public-perception accounting:

- narrative clusters and their velocity
- memes, phrases, frames, and platform jumps
- silence where noise was expected
- likely bot/manipulation markers
- public belief shifts that diverge from Mosaic's evidence state
- source/community behavior changes

Murmurs output may be interpretive, but each interpretation needs source paths, timestamps, and confidence/caveat fields.

### Bridge lane

The bridge reconciles the two minds:

- truth/perception/market deltas
- open contradictions
- cases where public belief outran evidence
- cases where evidence moved before public belief
- cases where direct observation changed confidence
- next-best observation requests

The bridge decides what deserves attention tomorrow. It does not decide what is true by narrative force.

## Dream phases

| Phase | Purpose | Required output |
|---|---|---|
| 0. Wake gate | Decide whether enough new material exists to run a full cycle. | `skip`, `light`, or `full` cycle mode. |
| 1. Intake freeze | Snapshot the day's relevant traces. | Immutable run manifest with sources, time bounds, and exclusions. |
| 2. Mosaic consolidation | Promote evidence-backed facts and score resolved claims. | Fact digest, contradiction ledger, calibration notes. |
| 3. Murmurs consolidation | Summarize perception movement. | Narrative digest, source-cluster notes, manipulation caveats. |
| 4. Delta reconciliation | Compare truth, perception, market, and direct observations. | Delta digest and next-best-observation queue. |
| 5. Housekeeping | Dedupe, compress, age out, redact, and mark review gates. | Memory patch list with `auto`, `review`, `reject`, `expire`. |
| 6. Free association | Explore speculative futures without factual promotion. | Dream seed ledger with relevance/novelty/risk scores. |
| 7. Journal composition | Write the day's meta-narrative entry. | Dated journal entry with fact/dream separation. |
| 8. Proposal queue | Convert selected seeds into concrete next steps. | Draft proposals, Kanban candidates, research questions. |
| 9. Morning brief | Turn the overnight synthesis into the operator's first signal packet. | Breaking-news digest, hype-wave radar, perceptual deltas, paper-book footer. |

## Free association protocol

Use a persistent-creativity pattern, but keep it fenced:

1. Map the obvious/modal answer first so the system can move beyond it.
2. Generate dream seeds through lenses such as `sensorium`, `wardrive`, `antenna`, `borrowed body`, `rain`, `GPIO`, `hotspot`, `backpack`, `calibration`, `witness`, and `safety case`.
3. Score each seed on relevance, novelty, technical plausibility, safety/legal risk, and fit to Mosaic/Murmurs identity.
4. Store dream seeds as speculative design objects, not as memory facts.
5. Promote only reviewed seeds into proposals or tasks.

### Daily design proposal lanes

Each daily dream run should emit two fenced proposal lanes after consolidation and journal composition:

1. **Anything at all** — broad speculative proposals across sensorium, cyber presence, narrative mechanics, operator rituals, data sources, visual language, safety tooling, and research questions. These can be strange, but must stay marked `speculative: true`.
2. **Cyber-augmentation refinement** — concrete refinements to the wearable/field-body design. These stay anchored to the three-phase track:
   - **Phase 1: portable Jetson** — backpack compute, power, hotspot/Tailscale, thermals, health telemetry, passive/authorized field sync.
   - **Phase 2: binocular pan/tilt** — stereo cameras on a supervised two-axis head, pose/heading capture, motor rail isolation, soft/hard limits, visible state.
   - **Phase 3: multijoint multisensor** — later collaborative shoulder apparatus with multiple joints and sensors, formal safety case, torque/current limits, quick release, and operator supervision.

The broad lane may wander. The cyber-augmentation lane must add specific details, tests, gates, or design constraints to one of those three phases.

Recommended ledger:

| ID | Seed | Cluster | Why relevant | Why non-modal | Evidence needed | Risk | Promotion |
|---|---|---|---|---|---|---|---|
| D-001 | Backpack sensorium heartbeat | Portable compute | Extends S0/S2 field presence | Treats power/network as body homeostasis | Power/runtime measurements | Medium | Research |
| D-002 | Over-shoulder binocular sensor head | Embodiment | Extends operator senses during wardriving | Collaborator as shoulder familiar, not robot pet | Mechanical/safety prototype | High | Proposal |

## Data model sketch

```ts
type DreamCycleMode = 'skip' | 'light' | 'full';

type DreamCycleRun = {
  id: string;
  startedAt: string;
  endedAt?: string;
  mode: DreamCycleMode;
  timeWindow: { start: string; end: string };
  sourceRefs: string[];
  exclusions: string[];
  operatorVisible: true;
  status: 'running' | 'completed' | 'failed' | 'review_required';
};

type MemoryPatch = {
  id: string;
  runId: string;
  target: 'mosaic_memory' | 'murmur_memory' | 'source_catalog' | 'calibration' | 'meta_narrative';
  action: 'add' | 'update' | 'expire' | 'merge' | 'flag_for_review';
  evidenceRefs: string[];
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  reviewRequired: boolean;
};

type DreamSeed = {
  id: string;
  runId: string;
  title: string;
  cluster: string;
  speculative: true;
  rationale: string;
  requiredEvidence: string[];
  safetyNotes: string[];
  promotion: 'discard' | 'keep_in_ledger' | 'research' | 'proposal' | 'kanban_candidate';
};

type DreamJournalEntry = {
  id: string;
  runId: string;
  date: string;
  factDigestRef: string;
  perceptionDigestRef: string;
  dreamSeedRefs: string[];
  entryMarkdown: string;
  publishedTo: 'local_vault_only' | 'repo_docs' | 'operator_export';
};
```

## Storage targets

| Artifact | Preferred store | Retention |
|---|---|---|
| Run manifest | Postgres / local SQLite | Durable audit |
| Fact digest | `mosaic_memories` + markdown digest | Durable with provenance |
| Perception digest | `murmur_memories` + markdown digest | Durable with provenance |
| Raw traces | Source-specific stores | Bounded, policy-specific |
| Dream seeds | Local dream ledger | Durable but speculative |
| Meta-narrative journal | Vault/repo markdown | Durable, append-only |

| Morning brief | Local markdown + delivery transcript + machine manifest | Durable audit; compact operator copy || Housekeeping patch list | Audit log | Durable |

## Governance

- Every output field that comes from free association carries `speculative: true` until reviewed.
- Memory patches that affect durable fact state require evidence refs.
- PII-sensitive details are summarized, redacted, or omitted by default.
- The daily journal is local-first. Publishing to the internet requires explicit operator action.
- Dream-generated hardware, budget, or actuation ideas become proposals, not purchases or commands.
- The cycle can suggest Kanban work, but it should not silently spawn hardware/field tasks without the operator's chosen policy.

## Technical viability

| Component | Viability | Notes |
|---|---|---|
| Local daily digest from markdown/session/db inputs | High now | Hermes cron and vault/repo files already support this pattern. |
| Mosaic/Murmurs memory consolidation into Postgres tables | Medium-high | Depends on final `mosaic_memories` / `murmur_memories` schemas and write API. |
| Contradiction/source-reliability scoring | Medium | Needs explicit scoring rubric and outcome data; start with human-readable ledgers. |
| Free-association dream ledger | High | Can be local markdown/JSON first; keep speculative markers hard. |
| Meta-narrative journal | High | Daily vault note pattern already exists; project-specific journal can mirror it. |
| Fully autonomous memory promotion | Medium-low initially | Dangerous without review gates; use evidence refs and review-required patches first. |
| Cross-source privacy-safe retention cleanup | Medium | Requires source inventory, TTLs, redaction policy, and tests. |

Overall: **technically viable as a P0/P1 text+metadata pipeline immediately**. The main risk is not compute; it is memory hygiene. The system must preserve the seam between evidence-backed consolidation and imaginative dreaming.

## Implementation plan

### P0 — Manual/procedural dream cycle

- Create a daily markdown template for dream runs.
- Define `DreamCycleRun`, `MemoryPatch`, `DreamSeed`, and `DreamJournalEntry` JSON shapes.
- Add a local-only daily cron/manual command that reads the day's selected logs and writes a draft dream digest.
- Require human review before any durable fact-memory patch.

### P1 — Local scheduled cycle

- Run daily through Hermes cron or BSS local scheduler.
- Pull source summaries from Cybermap, Wardriver/RaID, Tzeentch, and vault notes.
- Emit one operator summary plus one detailed machine-readable manifest.
- Emit a daily morning brief from Mosaic & Murmurs with paper-book footer and stale-data markers.
- Maintain separate ledgers for facts, perception, contradictions, and dream seeds.

### P2 — Integrated Mosaic/Murmurs memory loop

- Write approved patches into `mosaic_memories` and `murmur_memories` through authenticated API.
- Track direct-observation calibration effects.
- Add source reliability and narrative-cluster drift metrics.
- Let the bridge create next-best-observation proposals.

### P3 — Dream-to-proposal automation

- Promote high-scoring dream seeds into formal proposal drafts.
- Optionally create Kanban candidates for approved implementation/research lanes.
- Keep hardware/actuation/spend proposals gated by explicit user approval.

## Acceptance criteria

- A daily run produces a dated digest, a memory patch list, a dream seed ledger, and a meta-narrative journal entry.
- The wake output includes a morning brief with breaking news, hype waves, perceptual deltas, and per-book paper PnL.
- Fact memories and dream seeds are visibly separated.
- Every promoted fact has evidence refs or a review gate.
- Every retained private/person/location detail has a retention reason and privacy class.
- The operator can reject or edit any proposed memory patch.
- The cycle can propose cyber/physical presence upgrades without executing purchases, external writes, or actuation.
