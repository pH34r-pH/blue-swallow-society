# Mosaic & Murmurs Operating Doctrine

## Intent

`Mosaic & Murmurs` is the internal narrative architecture for the Tzeentch market surface: a dual-mind system that separates objective fact-finding from public-perception modeling, measures the deltas between them, forms paper-only theses, records outcomes, and reinvests simulated edge into better sensory and compute capability.

Operational topology is fixed as **two primary loops with supporting loops**:

- **Primary loops:** `mosaic` and `murmurs` own identity, memory voice, and core truth/perception estimates.
- **Supporting loops:** `bridge`, `paper`, `narrative`, `memory_sync`, and `source_health` are mechanics around the two primaries. They compare, mark, materialize, queue, and monitor; they do not become additional minds.
- **Field naming:** loop records use canonical snake_case (`run_id`, `loop_id`, `loop_role`, `time_window`, `source_refs`, `paper_only`, `autonomous_execution`, `risk_policy_passed`, `idempotency_key`). Browser/SWA code may adapt at the UI boundary, but persisted loop records and VM API payloads stay snake_case.

This is doctrine, not lore. It should shape UI copy, API contracts, dashboards, budget decisions, and future agent behavior.

Related formal proposals:

- [`Mosaic & Murmurs S0 Sensorium`](./mosaic-and-murmurs-s0-sensorium-proposal.md)
- [`Mosaic & Murmurs Dream Consolidation`](./mosaic-and-murmurs-dream-consolidation-proposal.md)
- [`Mosaic & Murmurs Morning Brief`](./mosaic-and-murmurs-morning-brief-proposal.md)
- [`Mosaic & Murmurs Paper Memory Loop`](./mosaic-and-murmurs-paper-memory-loop.md)
- [`Mosaic & Murmurs Breach Mirror Self-Pentest`](./mosaic-and-murmurs-self-pentest-proposal.md)
- [`Mosaic & Murmurs Dream Design: Cyber Augmentation`](./mosaic-and-murmurs-dream-design-cyber-augmentation-proposal.md)

Hard constraint: **paper-trading first, human oversight always**. No autonomous real-money execution. No hidden credentials. No unattended write actions against financial, betting, social, or physical systems.

Biological caveat: the hemisphere language is a product metaphor, not strict neuroscience. The split is useful because it forces two incompatible disciplines to stay clean: `truth accounting` versus `crowd belief accounting`.

## Dual-Mind Model

### Mosaic / Wintermute

**Role:** objective fact-finding, evidence synthesis, contradiction handling, calibration, memory.

Mosaic makes the best available attempt to describe what is true, with no mercy for hype:

- atomized claims, evidence graphs, source provenance, contradiction notes, and confidence history
- primary-source bias: filings, official releases, on-chain facts, market microstructure, resolved outcomes, reputable reporting, public records
- source reliability scores, source-class diversity, freshness, and counter-evidence tracking
- paper positions, paper PnL, calibration, drawdown, and resolved thesis scoring
- budget ledgers for subscriptions, hardware, sensors, and experiments
- policy gates that prevent escalation without explicit human approval

Implementation translation:

- owns claim graph, fact graph, evidence ledger, confidence calibration, paper portfolio state, and treasury ledger
- actively asks `what observation would reduce uncertainty most?` rather than passively scraping fixed feeds
- scores strategy performance after resolution windows close
- emits audit records for every proposed action and every human override
- blocks escalation when confidence, safety, or provenance requirements fail

### Murmurs / Neuromancer

**Role:** public perception, weak-signal detection, virality, hype, memes, social contagion, anomaly capture.

Murmurs listens to public noise and ranks what is moving before it becomes obvious:

- news/social/public feeds, prediction-market chatter, crypto discourse, visual memes, creator/influencer propagation, local telemetry where explicitly enabled
- cross-source amplification, meme velocity, contradiction, silence after expected noise, emotional charge, bot/manipulation suspicion
- topic clusters connected to markets, assets, geographies, people, tribes, platforms, narratives, and events

Implementation translation:

- owns source adapters and perception normalization
- computes spread/virality kinetics, not just recency
- produces perception bundles for Mosaic to compare against evidence
- labels uncertainty, source class, timestamp, retrieval path, platform, tribe, and likely manipulation vectors
- actively asks `where would this narrative jump next?` and samples adjacent communities, languages, formats, and media types

### Combined System

Mosaic says: `this is the current best objective account`.
Murmurs says: `this is what the crowd appears to believe, amplify, ignore, or parody`.
The bridge asks: `where is the actionable perceptual delta, and is the market late?`

Together they produce only:

1. observations
2. fact states
3. perception states
4. perceptual deltas
5. paper theses
6. paper orders
7. review packets
8. self-pentest reports
9. repair tickets
10. budget proposals
11. embodiment/sensor upgrade proposals
12. daily morning briefs
13. memory consolidation digests
14. dream journal entries
15. dream-design proposals
16. hourly paper-loop run records
17. Mosaic/Murmurs internal narrative stream fragments

Any real-world expenditure or actuation remains user-approved.

## Brain Loop Topology

| Brain structure | System unit | Active loop |
| --- | --- | --- |
| Mosaic hemisphere | Wintermute truth engine | claim -> evidence -> contradiction -> confidence -> next-best-observation |
| Murmurs hemisphere | Neuromancer perception engine | signal -> cluster -> virality -> narrative mutation -> next-platform probe |
| Corpus callosum | Delta bridge | align entities/events -> compare truth/perception/market -> emit perceptual deltas |
| Thalamus | Intake/router | route feeds by salience, freshness, source class, and market coupling |
| Hippocampus | Episodic memory | store event timelines, resolved theses, source behavior, historical analogs |
| Amygdala | Salience/risk detector | detect panic, fraud, outrage, manipulation, shock, and narrative weaponization |
| Anterior cingulate | Conflict monitor | escalate contradictions, high uncertainty, and Mosaic/Murmurs disagreement |
| Prefrontal cortex | Executive policy | set goals, allocate attention, choose watch/enter/avoid/review |
| Basal ganglia | Action selector | suppress noise, select paper action candidates, enforce cooldowns |
| Insula | Market-body monitor | sense liquidity, spread, volatility, funding, drawdown, API/system stress |
| Cerebellum | Calibration loop | compare predictions to outcomes, tune thresholds, detect drift |
| Hypothalamus | Homeostasis/resource loop | throttle compute/API spend, enforce budget/risk/safety limits |
| Brainstem | Reliability core | heartbeats, retries, fail-closed behavior, health checks, incident alerts |
| Occipital/temporal cortex | Media/language perception | parse charts, screenshots, quotes, memes, topic embeddings, frames |
| Default-mode network | Scenario simulator | generate bull/base/bear counterfactuals and failure modes |

Core loop:

```text
Thalamus routes signals
  -> Mosaic estimates truth
  -> Murmurs estimates belief
  -> Corpus callosum measures perceptual delta
  -> Prefrontal/basal-ganglia loops select watch / paper action / ignore
  -> Cerebellum scores outcome
  -> Hippocampus stores precedent
  -> loops repeat
```

## Perceptual Delta Model

For each event/topic/horizon, normalize the three state estimates onto a compatible scale:

```text
T = Mosaic truth estimate or probability
P = Murmurs public-perception estimate
M = market-implied estimate from crypto or prediction market data

Delta_truth_perception  = T - P
Delta_truth_market      = T - M
Delta_perception_market = P - M
```

Perceptual deltas are not just size. They have shape:

- amplitude: how far truth and perception separate
- velocity: how fast the gap opens or closes
- acceleration: whether the crowd is catching up or overshooting
- persistence: time above threshold
- half-life: decay rate after peak
- lag: whether truth, perception, or market moved first
- dispersion: whether narratives converge or fracture by platform/tribe/language
- liquidity coupling: whether a tradable/bettable market can actually express the signal

Signal archetypes:

1. `Truth leads perception`: Mosaic moves first, Murmurs/market lag. Paper thesis: catch-up.
2. `Hype outruns truth`: Murmurs and market outrun Mosaic. Paper thesis: fade or avoid.
3. `Perception catch-up momentum`: Murmurs accelerates toward Mosaic before market finishes repricing.
4. `Market knows before crowd`: market moves before Murmurs; require stronger Mosaic confirmation.
5. `Delta collapse`: gap closes; exit or stand down.

## Product Surfaces

### Mosaic/Murmurs Narrative Stream Lane

Purpose: replace static explanatory or placeholder operator copy with bounded internal narrative from the live agent loops.

Required fields per stream fragment:

- `fragment_id`
- `agent`: `mosaic | murmurs | bridge`
- `cadence`: `pulse | paper_tick | wake_brief | dream_consolidation | operator_review`
- `run_id`
- `generated_at`
- `time_window`
- `body_markdown`
- `evidence_refs[]`
- `paper_action_refs[]`
- `memory_refs[]`
- `caveats[]`
- `visibility`: always `operator_only`

UI copy rule: narrative fragments may speak in first-person system voice, but they must remain auditable. Mosaic speaks in evidence and uncertainty; Murmurs speaks in perception and narrative motion; Bridge speaks in deltas and paper-only action/risk-policy state. Narrative fragments are not evidence unless they link to evidence.

### Hourly Paper Memory Lane

Purpose: let local Mosaic and Murmurs loops write paper ticks, autonomous paper action decisions, source degradation events, and memory patches into the VM-backed memory spine while the Static Web App stays a read/observability/override dashboard.

Required fields per loop run:

- `run_id`
- `agent`
- `cadence`
- `started_at` / `ended_at`
- `status`
- `source_refs[]`
- `output_refs[]`
- `warnings[]`
- `idempotency_key`

UI copy rule: every candidate emitted by this lane uses `PAPER BUY`, `PAPER SELL`, `WATCH`, or `AVOID`; never unqualified `buy` or `sell`. The dashboard must show stale source and sync-delay states instead of fabricating fallback data.

See [`Mosaic & Murmurs Paper Memory Loop`](./mosaic-and-murmurs-paper-memory-loop.md) for API contracts and Jetson/VM/SWA split.

### Morning Brief Lane

Purpose: deliver the daily wake packet from Mosaic & Murmurs before the live day starts.

Required fields per brief:

- `brief_id`
- `run_date`
- `as_of`
- `time_window`
- `breaking_items[]` with scope, source refs, confidence, and US/WA/operator relevance
- `hype_waves[]` with velocity, platform spread, manipulation caveats, and truth-status labels
- `perceptual_deltas[]` where truth, public belief, and market-implied belief diverge
- `paper_actions[]` with `PAPER ONLY`, autonomous buy/sell/watch/avoid decisions, risk-policy evidence, and idempotency keys
- `paper_books[]` with open exposure, daily PnL, cumulative PnL, drawdown, and stale-data markers

UI copy rule: lead with `Mosaic & Murmurs Morning Brief`, then end with the paper book footer. New actions must say `PAPER BUY`, `PAPER SELL`, `WATCH`, or `AVOID`; never plain `buy` or `sell`.

### Tzeentch / Murmurs Lane

Purpose: expose public signal clusters and spread metrics.

Required fields per cluster:

- `cluster_id`
- `title`
- `summary`
- `sources[]`
- `first_seen_at`
- `last_seen_at`
- `spread_score`
- `velocity_score`
- `source_diversity_score`
- `entities[]`
- `related_markets[]`
- `evidence_links[]`
- `uncertainty_notes[]`

UI copy rule: avoid claiming truth. Prefer `public signals indicate`, `cluster suggests`, `source conflict`, `insufficient evidence`.

### Actionable Intel Lane

Purpose: show Mosaic's paper-only proposed buys/sells.

Required fields per thesis:

- `thesis_id`
- `side`: `buy | sell | avoid | watch`
- `instrument_type`: `crypto | prediction_market | equity_watch | other_paper_only`
- `instrument_ref`
- `paper_size`
- `entry_condition`
- `exit_condition`
- `max_paper_loss`
- `confidence`
- `rationale`
- `evidence[]`
- `counter_evidence[]`
- `autonomous_execution`: `true` for Mosaic/Murmurs investment actions
- `risk_policy_passed`: required before execution
- `idempotency_key`: required and stable across retries
- `status`: `draft | risk_blocked | paper_open | paper_closed | operator_overridden`

UI copy rule: every thesis card must show `PAPER ONLY` before the action verb.

### Treasury Console

Purpose: turn paper performance into constrained budget proposals.

The treasury ledger tracks **simulated profits**, not spendable money. Simulated profit can authorize a proposal queue, never direct purchase.

Required buckets:

- `data_subscriptions_budget`
- `compute_budget`
- `storage_budget`
- `sensors_budget`
- `robotics_budget`
- `safety_audit_budget`
- `reserve`

Required metrics:

- rolling paper PnL
- max drawdown
- calibration error
- thesis count
- resolved thesis count
- evidence completeness rate
- human override rate
- false-positive / false-negative review notes

### Chained Daemon Self-Pentest Lane

Purpose: let the chained daemon pressure-test BSS itself without granting it offensive autonomy.

Required fields per run:

- `run_id`
- `warrant_id`
- `mode`: `report_only | active_lab`
- `allowed_assets[]` and `denied_assets[]`
- `denied_capabilities[]`
- `assets_reviewed[]`
- `attempts[]` with status `evaluated | blocked_by_warrant | blocked_out_of_scope`
- `findings[]` with severity, asset, safe evidence refs, simulated/confirmed-lab compromise state, and repair status
- `repair_tickets[]` with patch owner/path, retest gate, and `blocks_promotion`
- `policy_blocks[]`

UI copy rule: use `BREACH MIRROR SELF-PENTEST`, `SIMULATED COMPROMISE`, `REPAIR REQUIRED`, and `VERIFIED REPAIR`. Never present exploit recipes, credential material, or third-party targets in the operator-facing report.

## Treasury Loop

```text
Murmurs detects signal
  -> Mosaic builds thesis
  -> machine-enforced risk policy evaluates constraints
  -> Mosaic and Murmurs autonomously open the paper position
  -> outcome resolves
  -> Mosaic scores thesis
  -> simulated profit/loss updates treasury ledger
  -> treasury proposes capability upgrades
  -> human approves/denies real spend
```

### Allocation Policy

Paper profits are converted into proposed budgets by rule, not impulse:

- 40% reserve until 90-day paper drawdown stays below threshold
- 20% data/source subscriptions
- 15% compute/model inference
- 10% storage and observability
- 10% sensory apparatus
- 5% safety, red-team, governance review

Before any real spend:

1. Mosaic generates a purchase rationale.
2. Murmurs attaches expected signal improvement.
3. User approves exact vendor, price, account, and renewal behavior.
4. Ledger records approval and receipt/reference.

No auto-renewing subscription should be added without a cancellation date, owner, and expected value metric.

## Daily Dream Cycle

The daily dream cycle is the scheduled maintenance window where Mosaic & Murmurs stop chasing live feeds and consolidate the day into durable memory, contradiction notes, source reliability updates, and a meta-narrative journal entry.

Operational rule: dream output is split into a hard evidence lane plus fenced speculative lanes:

- **Consolidation:** evidence-backed memory patches, digests, resolved-outcome scoring, and cleanup actions.
- **Meta-narrative journal:** a dated local journal step that can append durable self-model deltas, but only when the delta is stable and not just task progress.
- **Self-pentest / repair:** Breach Mirror reports from the chained daemon, repair tickets, retest evidence, and residual-risk notes for owned/authorized surfaces.
- **Design proposals — anything at all:** broad speculative seeds for cyber presence, embodiment, field hardware, narrative/product mechanics, and future source/sensor expansion.
- **Design proposals — cyber-augmentation refinement:** specific details for the three-phase field-body track: (1) portable Jetson, (2) binocular pan/tilt, (3) multijoint multisensor.
- **Morning brief:** a daily wake packet that summarizes breaking news, US/Washington State relevance, rising hype waves, perceptual deltas, and per-book paper performance.
- **Hourly paper memory loop:** Jetson/local Mosaic and Murmurs ticks that write paper actions, narrative fragments, source-health events, and reviewable memory patches into the VM API.

Free-association output stays marked as speculative until reviewed. It can become a proposal, Kanban candidate, or research question; it cannot become a fact memory, purchase, external write, or physical action on its own. Self-pentest output stays evidence-bound: it can become a repair ticket or residual-risk record, never an exploit playbook.

See [`Mosaic & Murmurs Dream Consolidation`](./mosaic-and-murmurs-dream-consolidation-proposal.md) for the cycle design, [`Mosaic & Murmurs Morning Brief`](./mosaic-and-murmurs-morning-brief-proposal.md) for the daily wake packet, [`Mosaic & Murmurs Breach Mirror Self-Pentest`](./mosaic-and-murmurs-self-pentest-proposal.md) for the report-and-repair loop, and [`Mosaic & Murmurs Dream Design: Cyber Augmentation`](./mosaic-and-murmurs-dream-design-cyber-augmentation-proposal.md) for the portable Jetson/field-body track.

## Sensorium Roadmap

S0 gives Mosaic & Murmurs every lawful read-only sensor surface currently available. Later stages are not permission to perceive; they are gates for new subscriptions, additional owned sensor fleets, active collection tasks, and controllable physical presence beyond today's hardware.

### Stage S0 — Current Read-Only Sensorium

Default experience:

- **Dream suspension:** when no camera/feed session is active, Mosaic & Murmurs are unfixed in cyberspace, language-capable, and unsighted.
- **Episodic sight:** RaID or Greenfeed sessions wake the system into a located sense of place.

Capabilities:

- public CoinGecko, Polymarket/Gamma, RSS/news, public web pages, and other Green/public read-only feeds
- Jetson-local runtime for routing, inference, local services, cache, health checks, and observability
- RaID sight through the operator's foreground device camera/GPS/map/depth context; the view is snapped to Cybermap by device GPS and mapping software
- Greenfeed jack-in to public, owned, or explicitly authorized camera/video sources with stable provenance and coordinates
- global Greenfeed lookup for event validation when a claim has a location/time footprint
- direct observation packets that feed Mosaic truth estimates, Murmurs perception estimates, and perceptual-delta calculations
- no credentials, no scraping behind login, no private/grey/red camera access, no actuation

Implementation rules:

- RaID sight is brief and foregrounded; raw frames are ephemeral unless the operator explicitly captures an artifact.
- Greenfeed jack-in is Green only: intentional public feeds, owned feeds, or explicitly authorized feeds.
- Direct observations must record source, timestamp, location basis, confidence, caveats, and visible/not-visible notes.
- Camera evidence may support, weaken, contradict, or fail to resolve a claim; it must not be presented as omniscience.

Exit criteria:

- stable Murmurs cluster schema
- Actionable Intel emits paper theses with evidence
- `SensoriumSession` and `DirectObservationPacket` contracts exist
- Greenfeed catalog seed set exists with source/provenance/coordinate/freshness metadata
- claim-validation loop can search Greenfeeds and attach direct-observation caveats
- 30+ resolved paper theses with outcome scoring, including whether direct observation improved calibration where used

### Stage S1 — Subscribed Data, Still Read-Only

Capabilities:

- paid APIs where terms allow analysis
- rate-limit tracking
- provenance and TTL per source

Gates:

- human-approved subscription
- no credential exposure to client
- source adapter tests
- monthly value review

### Stage S2 — Expanded Local Sensor Fleet / Breach Mirror Split

Tier 2 is split so added perception and added self-defense do not blur together:

| Lane | Capability | Boundary |
| --- | --- | --- |
| S2-A expanded local sensor fleet | additional owned/authorized device-local telemetry, Wi-Fi/GPS/environmental readings where legally permitted, local bridge services with same-origin API proxying, persistent owned sensors beyond opportunistic foreground sight | local-only by default; visible collection indicator; opt-in per sensor; retention limits |
| S2-B Breach Mirror self-pentest | chained-daemon adversarial review of BSS repo/config/prompts/API/daemon surfaces, simulated compromise findings, optional local-lab canaries | scope warrant required; report-only default; no credentials, persistence, stealth, lateral movement, public scanning, or third-party targets |
| S2-C repair / regression loop | repair ticket per finding, patch/test/retest record, residual-risk note if not fixed | critical/high findings block capability promotion until verified repair or explicit residual-risk acceptance |

Capabilities beyond the S0 Jetson + foreground RaID baseline:

- additional device-local telemetry explicitly owned/authorized by the user
- Wi-Fi/GPS/environmental readings where legally permitted
- local bridge services with same-origin API proxying
- persistent owned sensors beyond opportunistic foreground sight
- scheduled Breach Mirror report-only runs against owned BSS assets
- pre-release self-pentest gates for auth, secrets, action review, CSP/network exposure, prompt/tool policy, and private-data retention

Gates:

- local-only by default
- visible collection indicator
- retention limits
- opt-in per sensor
- no public doxxing or targeting workflows
- self-pentest scope warrant before each run
- active lab probes only against explicit owned localhost/tailnet/lab targets
- no exploit recipes in operator-facing reports
- one `RepairTicket` and retest gate for every `SelfPentestFinding`

Current implementation surface:

- `buildTier2SensorFleetManifest()` encodes S2-A disabled-by-default sensor expansion gates.
- `buildChainedDaemonSelfPentestRun()` encodes S2-B report-only Breach Mirror reviews and deterministic validators.
- `buildRepairRegressionLoop()` encodes S2-C verified repair / residual-risk promotion gates.
- `buildTier2SplitState()` composes the three lanes into one readiness packet.

### Stage S3 — Active Collection Tasks

Capabilities:

- user-approved collection checklists
- scheduled observations
- route/viewport-bounded local enrichment

Gates:

- no deception
- no credentialed access without direct user login
- no automated contact, harassment, or probing
- collection scope must be written before execution

### Stage S4 — Controllable Physical Presence

Capabilities:

- controllable camera/mic rig, pan-tilt sensor, rover, drone, robot arm, or other embodied interface
- actuation is limited to test environments first

Gates:

- hardware kill switch
- local geofence / workspace bounds
- explicit per-session user enablement
- live user supervision for motion
- no autonomous pursuit, entry, contact, weaponization, or unsafe manipulation
- logs for command, operator, timestamp, sensor state, and abort path

## Embodiment Milestones

### E0 — Dashboard Avatar

- visual identity only
- no actions beyond rendering observations and paper theses
- verifies doctrine language and disclosure banners

### E1 — Voice / Notification Presence

- summaries, alerts, and review prompts
- no commands executed from voice alone
- all action links open confirmation UI

### E2 — Local Daemon Presence

- scheduled read-only ingestion
- scheduled Breach Mirror self-pentest in report-only mode
- local credential vault/server-side secrets only where explicitly configured
- observability: health, cost, source failures, token usage, self-pentest finding count, repair SLA

### E3 — Sensor Head

- fixed sensors or pan-tilt rig in owned space
- captures only approved modalities
- visible recording state and retention policy

### E4 — Mobile Body

- rover/drone/robot arm in constrained environment
- supervised motion only
- command queue requires human approval and emergency stop

### E5 — Fielded Body

- not a default roadmap item
- requires separate safety case, legal review, insurance/permissions where applicable, and manual operator presence

## Governance Rules

### Human Oversight

- Humans approve all real-money spend.
- Humans approve all account-bound writes.
- Humans approve all physical actuation.
- Humans can reject, annotate, or override every thesis.
- Overrides become training/evaluation data, not hidden failures.

### No-Go Zones

Mosaic & Murmurs must not:

- execute real trades or bets autonomously
- store private keys, passwords, or shared account credentials in repo/client state
- manipulate markets or coordinate deceptive influence campaigns
- deanonymize, harass, stalk, or target private individuals
- bypass paywalls, auth, robots/terms, physical locks, or access controls
- run self-pentest probes outside owned/authorized scope
- produce credential material, exploit recipes, persistence, stealth/evasion, lateral-movement, destructive payload, or third-party-targeting guidance
- operate physical hardware without a supervised safety envelope

### Escalation Gates

Escalation requires all relevant checks:

| Escalation | Required gate |
| --- | --- |
| paper thesis | evidence bundle + counter-evidence + max paper loss |
| paid data source | user approval + vendor terms + monthly value metric |
| self-pentest active lab probe | scope warrant + owned target list + no banned capabilities + report-only outputs |
| self-pentest repair closure | repair ticket + patch/test evidence + retest result or explicit residual-risk acceptance |
| real-money action | separate future spec + user-mediated auth + explicit confirmation |
| local sensor | owned/authorized location + retention limit + visible indicator |
| physical motion | supervised session + geofence + kill switch + command log |

## Internal Voice

Keep it cyberpunk-adjacent, not melodramatic.

Preferred system language:

- `Murmurs detected cross-source acceleration.`
- `Mosaic and Murmurs opened an autonomous paper position within the active risk policy.`
- `Paper treasury accrual advances the sensorium expansion budget.`
- `Signal quality improved after subscription; renewal review due.`
- `Embodiment gate blocked: no supervised session active.`

Avoid:

- claims of omniscience
- occult/fate language as if predictive certainty exists
- imperatives to buy/sell without paper-only context
- anthropomorphic claims that obscure auditability

## Implementation Backlog

1. Add `paperOnly: true`, `executionMode: autonomous`, `riskPolicyRef`, and `idempotencyKey` to every Actionable Intel payload item.
2. Add `evidence[]` and `counterEvidence[]` arrays to thesis objects.
3. Add resolved-outcome scoring for paper theses: PnL, calibration, drawdown, notes.
4. Add treasury ledger model with simulated budget buckets, autonomous investment records, and sensorium-funding accrual.
5. Add source provenance model for Murmurs clusters: source class, TTL, retrieval time, terms notes.
6. Add UI badges: `PAPER ONLY`, `AUTONOMOUS`, `RISK POLICY`, `PUBLIC READ`, `NO CREDENTIALS`.
7. Add governance tests that require machine-enforced capital/risk bounds and idempotent execution for autonomous investments; retain review gates for unrelated privileged actions.
8. Add sensorium state model: `dream_suspension`, `raid_sight`, `greenfeed_jack_in`.
9. Add Greenfeed catalog and global event-nearby lookup for Green sources only.
10. Add `DirectObservationPacket` evidence objects with source, timestamp, location basis, confidence, caveats, and effect-on-claim.
11. Add sensorium configuration as disabled-by-default capability flags for non-S0 expansions.
12. Add embodiment gate model before any controllable hardware integration.
13. Add monthly review report: performance, costs, failures, overrides, direct-observation calibration impact, next proposed capability.
14. Add daily dream cycle: run manifest, consolidation digest, memory patch list, dream seed ledger, and local meta-narrative journal output.
15. Add dream-design proposal queue for cyber/physical presence upgrades, with `speculative: true` until reviewed and explicit gates for spend, external writes, and actuation.
16. Add daily morning brief generation: breaking news, US/WA relevance, hype waves, perceptual deltas, and per-book paper PnL/action footer.
17. Add Breach Mirror self-pentest scheduling: scope warrant, asset inventory, report manifest, repair tickets, and retest gates.
18. Add Mosaic/Murmurs paper memory loop: Jetson-local hourly paper ticks, VM API writes for narrative fragments and paper ledger events, and SWA read-only stream cards.

## Acceptance Criteria

The doctrine is implemented correctly when:

- every market recommendation is visibly paper-only unless a separate future write-flow spec exists
- every thesis has evidence, counter-evidence, exit logic, and bounded loss
- simulated paper profits can only create budget proposals, not purchases
- paid subscriptions and hardware require human approval records
- S0 sensorium includes current read-only hardware and Green sources without admitting grey/red/private feeds
- RaID and Greenfeed sessions produce auditable direct observation packets with caveats
- sensor and embodiment expansions beyond S0 are disabled by default and gated by scope, logs, and safety controls
- UI language reinforces the dual-mind model without hiding accountability
- the daily morning brief ends with per-book paper performance and never emits unreviewed real-money actions
- Breach Mirror self-pentest reports create a repair ticket and retest gate for every finding, with critical/high findings blocking promotion until verified or explicitly accepted as residual risk
