# Feature Specification: Tzeentch Market Surface

**Feature Branch**: `004-tzeentch-market-surface`
**Created**: 2026-07-09
**Status**: Draft

**Input**: User request: "Design nested Tzeentch sub-tabs and data contracts for Murmurs, Crypto, Polymarket, Actionable Intel; implement backend payload + frontend sub-tab carousel + chart rendering; no secrets, no embedded accounts; use user-mediated on-behalf-of sign-in when a target service requires auth."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Swipeable Intelligence Lanes (Priority: P1)

Authenticated users can browse the Tzeentch dashboard's intelligence lanes by swiping left/right between sub-tabs without leaving the top-level Tzeentch tab.

**Why this priority**: The dashboard needs to feel like a compact intelligence console on mobile-first devices, where lane switching should be quick and tactile.

**Independent Test**: Open Tzeentch, swipe horizontally, and verify the active lane changes between Murmurs, Crypto, Polymarket, and Actionable Intel.

**Acceptance Scenarios**:
1. **Given** the Tzeentch tab is open, **When** the user swipes left, **Then** the next sub-tab becomes active
2. **Given** the Tzeentch tab is open, **When** the user swipes right, **Then** the previous sub-tab becomes active
3. **Given** the Tzeentch tab is open, **When** the user taps a top-level app tab, **Then** the dashboard switches sections normally

### User Story 2 - Public Read-Only Market Browsing (Priority: P1)

Users can view market and sentiment data without creating or embedding accounts for CoinGecko or Polymarket.

**Why this priority**: The product must remain anonymous and offline-friendly where possible; public data should be browsable without credentials.

**Independent Test**: Load the Tzeentch dashboard in a fresh session and verify market content renders from public sources without prompting for account login.

**Acceptance Scenarios**:
1. **Given** the dashboard loads, **When** the Crypto lane renders, **Then** it shows the top 10 assets by trading volume with 24h and 5d views
2. **Given** the dashboard loads, **When** the Polymarket lane renders, **Then** it shows new bets and recently resolved bets
3. **Given** the dashboard loads, **When** no account is configured, **Then** the public read-only lanes still render

### User Story 3 - Virality-First Murmurs Lane (Priority: P2)

Users can inspect a current-events dashboard that highlights content spreading rapidly, not just content that is merely breaking.

**Why this priority**: The value of the lane is in spread velocity and cross-source amplification, not headline recency alone.

**Independent Test**: Load the Murmurs lane and verify items are ranked and labeled by virality/spread signals.

**Acceptance Scenarios**:
1. **Given** the Murmurs lane is active, **When** items are shown, **Then** they include virality indicators or spread scores
2. **Given** the Murmurs lane is active, **When** a topic appears across multiple sources, **Then** it is surfaced as a cluster or amplified item
3. **Given** the Murmurs lane is active, **When** no strong spread signal exists, **Then** the lane still renders a stable empty or fallback state

### User Story 4 - Actionable Intel Paper Loop (Priority: P2)

Users can review proposed buys and sells generated from OSINT research, each with reasoning, justification, and evidence.

**Why this priority**: The system should support a paper-trading / paper-betting learning loop before any real capital is risked.

**Independent Test**: Load Actionable Intel and verify every proposal includes the side, confidence or rationale, and justification/evidence.

**Acceptance Scenarios**:
1. **Given** the Actionable Intel lane is active, **When** proposals render, **Then** each proposal is labeled as a buy or a sell
2. **Given** the Actionable Intel lane is active, **When** a proposal is shown, **Then** it includes reasoning and evidence links or chips
3. **Given** the Actionable Intel lane is active, **When** the loop is reviewed, **Then** the UI clearly indicates the proposals are paper-only

### User Story 5 - User-Mediated Auth for Account-Bound Services (Priority: P1)

If a target service requires authentication to complete a trade, bet, or other write action, the user must sign in directly and the system must not persist their credentials.

**Why this priority**: Security and anonymity are core constraints; the product must not store or embed private keys, tokens, or shared accounts.

**Independent Test**: Review the implementation and confirm there are no stored credentials, and that any future write action uses a user-mediated on-behalf-of flow.

**Acceptance Scenarios**:
1. **Given** a write-capable target service is introduced, **When** auth is required, **Then** the user performs the login themselves in the target service
2. **Given** auth is required, **When** the flow completes, **Then** no credentials or tokens are persisted in repo files or client storage
3. **Given** read-only browsing is sufficient, **When** public sources are available, **Then** the system stays anonymous and does not request auth

## Requirements *(mandatory)*

### Functional Requirements
- **FR-1**: Tzeentch must expose four swipeable sub-tabs: Murmurs, Crypto, Polymarket, and Actionable Intel.
- **FR-2**: Murmurs must prioritize virality/spread, not just recency.
- **FR-3**: Crypto must render the top 10 currencies by trading volume and display both 24-hour and 5-day views.
- **FR-4**: Polymarket must show newly opened bets and recently resolved bets in a read-only browsing mode.
- **FR-5**: Actionable Intel must list proposed buys and sells with attached reasoning, evidence, and source links.
- **FR-6**: The implementation must remain anonymous for public-read paths and must not embed secrets, API keys, or shared accounts.
- **FR-7**: Any future trade/bet execution path must require user-mediated sign-in / on-behalf-of authorization and must not persist credentials.
- **FR-8**: The top-level application tabs remain tap/click driven; the Tzeentch sub-tabs should support swipe navigation as the primary interaction.

### Non-Functional Requirements
- **NFR-1**: The dashboard should remain responsive on mobile-first layouts.
- **NFR-2**: Chart rendering must degrade gracefully if live public data is unavailable.
- **NFR-3**: Public feed fetches should not block the rest of the console if one upstream source fails.
- **NFR-4**: Accessibility must remain intact for keyboard and screen-reader users.

## Success Criteria
- The Tzeentch tab loads without requiring an account for public market browsing.
- Swipe navigation works between the four sub-tabs.
- Crypto, Polymarket, and Murmurs each render meaningful fallback states when live data is absent.
- Actionable Intel always communicates that proposals are paper-only unless a future user-mediated write flow is introduced.
- No keys, secrets, or stored accounts are added to the repo or client.
