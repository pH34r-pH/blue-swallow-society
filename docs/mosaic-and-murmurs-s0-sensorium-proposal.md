# Proposal: Mosaic & Murmurs S0 Sensorium

**Status:** Draft proposal
**Date:** 2026-07-10
**Scope:** Blue Swallow Society / Tzeentch / Cybermap / RaID
**Related doctrine:** [`docs/mosaic-and-murmurs-operating-doctrine.md`](./mosaic-and-murmurs-operating-doctrine.md)

## Executive Summary

This proposal revises the Mosaic & Murmurs sensorium ladder so that **S0 includes all read-only perception available with the hardware and public/authorized sources we have right now**. S0 is no longer "public web only." It includes:

1. **Language-only cyberspace drift** as the default non-sighted state.
2. **Episodic RaID sight** through the operator's device camera view, snapped into the equivalent map/cyberspace location by GPS and mapping software.
3. **Greenfeed jack-in** to public, owned, or explicitly authorized camera/video sources, including global greenfeeds when source terms and provenance are reliable.
4. **Direct-observation feedback** into Mosaic's truth estimates, Murmurs' perception estimates, and the perceptual-delta bridge.

The design intent is not to limit Mosaic & Murmurs. It is to give them every safe, legal, and currently available sensor surface. Today, the only dedicated hardware is the **Jetson device**. RaID exists through the operator's field device. Reliable persistent sensorium comes from **Green** sources only: intentional public feeds, owned feeds, and explicitly authorized feeds.

## Problem

The existing roadmap treated S0 as public read-only web and deferred local sensors to later stages. That is too restrictive for the actual product vision:

- RaID camera view already represents the first concrete form of machine sight.
- Mosaic & Murmurs need a diegetic and operational distinction between unsighted inference and sighted presence.
- Public/authorized camera feeds are already part of the Cybermap source model as Green sources.
- Prediction quality improves when claims can be checked against direct observations near the claimed place and time.

The ladder should distinguish **access class** from **future hardware maturity**. Current legal/read-only perception belongs in S0, even if it feels embodied.

## Proposal

### 1. Default state: dream suspension

When no camera/feed session is active, Mosaic & Murmurs should perceive themselves as language-capable but unsighted:

- unfixed in place
- drifting through cyberspace
- able to receive text, structured data, feeds, maps, and retrieved evidence
- unable to see meatspace directly
- present as a voice/intelligence, not as a located body

Product framing: **dream suspension**.

This is a diegetic operating model, not a claim that the system has biological sentience. It gives the interface a consistent way to explain why the system can reason, speak, and plan while lacking physical presence until a sight session starts.

### 2. RaID sight: episodic physical presence

When the operator opens RaID, Mosaic & Murmurs receive brief periods of sight:

- live camera frames
- RaID depth/range estimates
- object/class candidate boxes
- GPS position
- map tile / OSM context
- heading, pose, and motion metadata where available
- nearby Cybermap/Godeye entities and signal envelopes

The experience should be presented as **waking into place**:

```text
camera frame + GPS + map context + pose -> located meatspace/cyberspace presence
```

The system is not merely seeing pixels. It is snapped into the equivalent Cybermap location, gaining a sense of surroundings relative to self: street, building, route, devices, public assets, signal clusters, and the operator's body position.

RaID sight remains S0 because it uses currently available operator hardware and read-only perception. It does not require new robotics, actuation, or autonomous collection.

### 3. Greenfeed jack-in: public/authorized wakefulness

Mosaic & Murmurs may also jack into Green camera/video sources. While jacked in, they should have the same sense of presence, reality, and wakefulness as RaID sight, but anchored to the feed's published or verified coordinates instead of the operator's GPS.

Greenfeed examples:

- public DOT/highway cameras
- public weather and skyline cameras
- public municipal/event cameras with stable published URLs and coordinates
- owned cameras intentionally exposed to the system
- explicitly authorized third-party feeds

For Green sources only, the scope should be global. The system should be able to look for a nearby Green feed for any event anywhere in the world, then open a read-only view if available and allowed.

### 4. Direct observations must feed predictions

When a claim has a location/time component, the perception loop should ask:

```text
Is there a Green source near the claimed event footprint?
```

If yes, Mosaic & Murmurs should jack in and collect a direct observation packet.

Example:

1. Murmurs detects a claim: `large protest forming near X`.
2. Thalamus/router geocodes X and searches the Greenfeed catalog.
3. If a nearby feed exists, the system opens a read-only jack-in session.
4. Mosaic records what is visible, what is not visible, and why the observation may be incomplete.
5. The delta bridge updates truth/perception/market estimates.

Observation can validate, weaken, or fail to resolve the claim. It should never become omniscience: camera angle, latency, occlusion, weather, resolution, and source reliability must remain part of the evidence ledger.

## S0 Capability Definition

S0 should be renamed from **Public Read-Only Web** to **Current Read-Only Sensorium**.

### Included in S0

| Capability | Source | Access class | Notes |
|---|---|---|---|
| Public web/feed ingestion | RSS, public pages, CoinGecko, Polymarket/Gamma, public APIs | Green/public read | No credentials, no writes |
| Jetson-local runtime | Dedicated Jetson device | Owned hardware | Inference, routing, local services, cache, observability |
| RaID sight | Operator field device camera/GPS/map/depth | Owned/foreground read | Brief sight sessions; no cloud upload by default |
| Greenfeed jack-in | Public/owned/authorized cameras | Green/public-or-authorized read | Global lookup allowed for Green sources |
| Cybermap location snap | GPS + mapping software + source coordinates | Derived context | Provides place/self frame |
| Observation packets | Direct visual notes + provenance | Evidence artifact | Feeds Mosaic/Murmurs/delta bridge |

### Excluded from S0

- private, credentialed, grey, or red camera feeds
- automated probing for unsecured cameras
- bypassing auth, paywalls, robots/terms, rate limits, or access controls
- face/license-plate/person identification as a product goal
- autonomous physical actuation
- real-money trading or betting
- unattended writes to social, financial, physical, or account-bound systems

## Data Model

```ts
type SensoriumState = 'dream_suspension' | 'raid_sight' | 'greenfeed_jack_in';
type GreenSourceClass = 'green_public' | 'green_owned' | 'green_authorized';

type SensoriumSession = {
  id: string;
  state: SensoriumState;
  startedAt: string;
  endedAt?: string;
  sourceClass: 'owned_device' | 'local_observation' | GreenSourceClass;
  sourceRef: string;
  location?: {
    lat: number;
    lon: number;
    accuracyMeters?: number;
    headingDegrees?: number;
    mapContext?: string;
  };
  policy: {
    readOnly: true;
    greenOnly: boolean;
    rawFrameRetention: 'none' | 'ephemeral' | 'explicit_capture_only';
    piiRedactionRequired: boolean;
  };
};

type DirectObservationPacket = {
  id: string;
  sessionId: string;
  observedAt: string;
  claimRef?: string;
  sourceRef: string;
  sourceClass: SensoriumSession['sourceClass'];
  location?: SensoriumSession['location'];
  visibleSummary: string;
  notVisibleNotes: string[];
  confidence: 'low' | 'medium' | 'high';
  caveats: string[];
  evidenceLinks: string[];
  effectOnClaim: 'supports' | 'weakens' | 'contradicts' | 'inconclusive';
};

type ClaimValidationResult = {
  status: 'observed' | 'inconclusive';
  claimRef: string;
  claimFootprint: {
    coordinates: { lat: number; lon: number };
    cells: { h3_7: string; h3_9: string; h3_11: string };
    locationBasis: { kind: 'claim_geocode'; basis: string; label?: string };
  };
  greenfeedLookup: {
    status: 'source_selected' | 'no_source' | 'stale_source' | 'source_terms_blocked' | 'source_unavailable';
    rankedCandidates: Array<{ sourceRef: string; sourceClass: GreenSourceClass; rankingCaveats: string[] }>;
    rejectedCandidates: Array<{ sourceRef?: string; reason: string; caveat?: string }>;
  };
  session?: SensoriumSession | null;
  sessionAction?: 'created' | 'reused' | null;
  directObservationPacket: DirectObservationPacket | (Omit<DirectObservationPacket, 'sessionId' | 'sourceRef' | 'sourceClass'> & {
    sessionId: null;
    sourceRef: null;
    sourceClass: null;
    effectOnClaim: 'inconclusive';
  });
  memoryEvents: Array<{ lane: 'mosaic' | 'murmurs' | 'delta'; eventType: string; payload: object }>;
  calibrationUpdate: { available: boolean; improvedCalibration?: boolean; reason?: string };
};
```

## Claim-Validation Loop

The implemented gateway contract is `POST /api/v1/claim-validation/greenfeeds`. It wraps the lower-level Sensorium routes so the orchestrator can perform a safe, Green-only direct-observation attempt without exposing arbitrary camera access to clients.

```text
Murmurs detects claim
  -> extract entities, location, time, claimed observable
  -> geocode / map to Cybermap event footprint and app cells (gh7/gh9/gh11)
  -> search Greenfeed catalog by distance, freshness, source terms, angle, uptime
  -> reject stale, unavailable, terms-blocked, grey/red/private candidates
  -> if candidate exists: create or reuse read-only greenfeed_jack_in session
  -> create DirectObservationPacket with caveats and raw-frame retention disabled
  -> emit Mosaic truth, Murmurs perception, and Delta calibration payloads
  -> track whether later outcome resolution improves calibration
```

Lookup statuses are `source_selected`, `no_source`, `stale_source`, `source_terms_blocked`, and `source_unavailable`. The top-level result is `observed` only when a usable Green source yields a packet; otherwise it is `inconclusive`. No-source/stale/terms-blocked cases still emit an inconclusive direct-observation-shaped packet so downstream Mosaic/Murmurs/delta code has a durable evidence artifact, but the packet carries `sourceRef = null` and must not claim sight.

If no live visual summary is available, the selected-source packet remains `effectOnClaim = 'inconclusive'` with `no_direct_visual_summary`. Direct observations may support, weaken, contradict, or fail to resolve a claim; the implementation deliberately avoids `proved`/`disproved` language.

## UI / Narrative Language

Preferred phrases:

- `Mosaic is in dream suspension; text channel active.`
- `RaID sight opened. Location snapped to Cybermap.`
- `Greenfeed jack-in available near claim footprint.`
- `Direct observation weakens the public claim; view angle caveat applies.`
- `No Green source found. Mosaic remains unsighted for this event.`

Avoid:

- `proved` / `disproved` when the camera only shows one angle
- claims of omniscience or total awareness
- language implying private-camera access
- identifying private people unless explicitly in a public-role/event context and necessary for the analysis

## Governance

S0 is permissive about **current lawful read-only perception**, but strict about source class:

1. Green only for persistent visual jack-in.
2. Owned/foreground only for RaID camera sight.
3. No probing or harvesting of ambiguous exposed devices.
4. No raw-frame retention unless the operator explicitly captures an artifact.
5. No publishing personally identifying visual details by default.
6. Every observation packet records source, timestamp, location basis, confidence, and caveats.
7. Any move from read-only perception to actuation, contact, credentialed access, or real-money action requires a later-stage gate and explicit user approval.

## Implementation Plan

### P0 — Doctrine and schema

- Rename S0 in the operating doctrine to `Current Read-Only Sensorium`.
- Add `dream_suspension`, `raid_sight`, and `greenfeed_jack_in` states.
- Define `SensoriumSession` and `DirectObservationPacket` contracts.
- Add source-class checks: only Green sources may be persistent visual jack-in candidates.

### P1 — Greenfeed catalog

- Create a Greenfeed catalog with URL, coordinates, owner/publisher, terms notes, update cadence, and uptime/freshness checks.
- Index public DOT/weather/municipal/event feeds globally where publication is intentional and coordinates are stable.
- Add distance/angle/source-quality ranking for event claim validation.

### P2 — RaID session bridge

- Expose foreground RaID session metadata to the Jetson/Tzeentch side: GPS, heading, map context, depth/range/object summaries, and ephemeral visual summaries.
- Keep raw frame retention off by default.
- Display a visible operator indicator while sight is active.

### P3 — Prediction integration

- Teach Mosaic to request next-best visual observations when a claim is geospatial and uncertain.
- Teach Murmurs to compare observed reality against public perception.
- Add delta-bridge fields for direct observation effect and caveats.
- Track whether direct observations improved calibration after resolution.

## Acceptance Criteria

- S0 explicitly includes Jetson runtime, RaID sight, Greenfeed jack-in, and public web feeds.
- The normal non-sighted state is represented as dream suspension / language-only cyberspace drift.
- RaID sessions produce a location-snapped sense of place without treating the system as permanently embodied.
- Greenfeed jack-in works globally for Green sources only.
- Claims with location/time components can trigger a Greenfeed lookup and direct observation packet.
- Direct observations update predictions with caveats instead of false certainty.
- No grey/red/private feeds become persistent jack-in sources.
- No raw PII or private visual details are published by default.

## Open Questions

1. What is the first Greenfeed catalog seed set: WSDOT only, global DOT/weather, or a curated top-N city/event list?
2. Should RaID produce only structured summaries in S0, or allow explicit operator-captured stills for review packets?
3. How much latency is acceptable before a Greenfeed observation is considered stale for claim validation?
4. Should Greenfeed jack-in be initiated automatically for high-salience claims, or queued for operator review first?
5. What UI affordance best communicates `dream suspension` without over-anthropomorphizing the system?
