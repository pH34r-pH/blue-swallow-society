import test from 'node:test';
import assert from 'node:assert/strict';

import { createCybermapApiServer, validatePaperState } from '../src/server.mjs';
import { MemoryObservationStore } from '../src/memory-store.mjs';
import { hashToken } from '../src/auth.mjs';
import { DEVICE_ID, INGEST_TOKEN, ingestHeaders, validBatch, validObservation, withServer } from './helpers.mjs';

const PAPER_LINES = ['standard', 'aggressive', 'hyper_aggressive'];
const PAPER_STRATEGIES = [
  'prediction_markets',
  'crypto',
  'equity_watch',
  'local_event_watch',
  'ai_cyber_watch',
  'cross_asset_momentum',
  'contrarian_reversion',
  'volatility_barbell',
];
const PAPER_BOOK_IDS = PAPER_LINES.flatMap((lineId) => PAPER_STRATEGIES.map((strategyId) => `${lineId}__${strategyId}`));
const PAPER_NOW_MS = Date.parse('2026-07-11T18:43:00.000Z');

function paperProfile(lineId) {
  return {
    target_gross_fraction: lineId === 'standard' ? 0.8 : lineId === 'aggressive' ? 0.95 : 1,
    max_position_fraction: lineId === 'standard' ? 0.4 : lineId === 'aggressive' ? 0.65 : 1,
    target_position_count: lineId === 'hyper_aggressive' ? 1 : lineId === 'aggressive' ? 2 : 3,
    minimum_order_notional: lineId === 'standard' ? 40 : lineId === 'aggressive' ? 20 : 5,
  };
}

function canonicalPaperState({ generatedAt = '2026-07-11T18:43:00.000Z' } = {}) {
  const books = PAPER_BOOK_IDS.map((book_id) => {
    const [line_id, strategy_id] = book_id.split('__');
    const positionType = strategy_id === 'prediction_markets' ? 'prediction_market' : strategy_id === 'crypto' ? 'crypto' : 'equity';
    return {
      book_id,
      display_name: `${line_id} / ${strategy_id}`,
      line_id,
      line_display_name: line_id,
      strategy_id,
      strategy_display_name: strategy_id,
      aggression_profile: paperProfile(line_id),
      loop_affinity: 'mosaic',
      instrument_type: 'mixed',
      strategy: 'test strategy',
      starting_balance: 2000,
      cash_balance: 1000,
      initial_bank_capital: 1000,
      initial_investment_capital: 1000,
      additional_capital_contribution: 1000,
      funding_migration_applied: true,
      initial_allocation_complete: true,
      initial_allocation_at: generatedAt,
      positions: [{
        position_id: `${book_id}:position`,
        instrument_ref: `${positionType}:${book_id}:seed`,
        instrument_type: positionType,
        symbol: 'SEED',
        title: 'Seed position',
        quantity: positionType === 'prediction_market' ? 2000 : 1,
        entry_price: positionType === 'prediction_market' ? 0.5 : 1000,
        mark_price: positionType === 'prediction_market' ? 0.5 : 1000,
        previous_mark_price: positionType === 'prediction_market' ? 0.5 : 1000,
        cost_basis: 1000,
        market_value: 1000,
        mark_status: 'fresh',
        source_id: 'test-source',
        source_url: 'https://example.test/seed',
        opened_at: generatedAt,
        updated_at: generatedAt,
      }],
      realized_pnl: 0,
      fees_paid: 0,
      spread_costs: 0,
      slippage_costs: 0,
      market_impact_costs: 0,
      latency_costs: 0,
      transaction_costs: 0,
      turnover_notional: 0,
      equity: 2000,
      previous_equity: 2000,
      high_water_mark: 2000,
      max_drawdown_pct: 0,
      last_trade_at: generatedAt,
      last_decision_at: generatedAt,
      status: 'flat',
      postmortem_required: false,
      crashed_at: null,
      crash_reason: null,
      created_at: generatedAt,
      updated_at: generatedAt,
    };
  });
  const summaries = books.map((book) => ({
    book_id: book.book_id,
    display_name: book.display_name,
    line_id: book.line_id,
    line_display_name: book.line_display_name,
    strategy_id: book.strategy_id,
    strategy_display_name: book.strategy_display_name,
    aggression_profile: structuredClone(book.aggression_profile),
    starting_balance: 2000,
    cash_balance: 1000,
    equity: 2000,
    open_position_count: 1,
    gross_paper_exposure: 1000,
    daily_pnl: 0,
    daily_pnl_pct: 0,
    realized_pnl: 0,
    fees_paid: 0,
    spread_costs: 0,
    slippage_costs: 0,
    market_impact_costs: 0,
    latency_costs: 0,
    transaction_costs: 0,
    turnover_notional: 0,
    unrealized_pnl: 0,
    cumulative_pnl: 0,
    cumulative_pnl_pct: 0,
    drawdown_pct: 0,
    max_drawdown_pct: 0,
    stale_open_marks: 0,
    status: 'flat',
    postmortem_required: false,
    crashed_at: null,
  }));
  const action = {
    candidate_id: 'decision-1',
    decision_id: 'decision-1',
    idempotency_key: 'decision-key-1',
    book_id: 'standard__crypto',
    action: 'PAPER_BUY',
    status: 'paper_filled',
    instrument_ref: 'crypto:bitcoin',
    instrument_type: 'crypto',
    symbol: 'BTC',
    paper_size: 100,
    mark_price: 100,
    thesis: 'test thesis',
    risk_policy_checks: ['paper_only', 'fresh mark'],
    risk_policy_passed: true,
    paper_only: true,
    autonomous_execution: true,
    human_review_required: false,
    review_required: false,
    generated_at: generatedAt,
    source_ref: 'test-source',
    source_url: 'https://example.test/action',
  };
  const fill = {
    event_id: 'fill-1',
    decision_id: 'decision-1',
    idempotency_key: 'decision-key-1',
    book_id: 'standard__crypto',
    event_type: 'paper_fill',
    action: 'PAPER_BUY',
    instrument_ref: 'crypto:bitcoin',
    quantity: 1,
    mark_price: 100,
    paper_size: 100,
    realized_pnl: 0,
    cash_before: 1100,
    cash_after: 1000,
    position_quantity_before: 0,
    position_quantity_after: 1,
    generated_at: generatedAt,
    paper_only: true,
    autonomous_execution: true,
    cost_model_version: 'bss.execution_costs.v1',
    cost_assumption_source: 'bss_tradesight_research_v1',
    reference_price: 100,
    execution_price: 100.1,
    gross_notional: 100.1,
    fee_amount: 0.2,
    spread_cost: 0.02,
    slippage_cost: 0.05,
    market_impact_cost: 0.02,
    latency_cost: 0.01,
    total_transaction_cost: 0.3,
  };
  const mark = {
    event_id: 'mark-1',
    idempotency_key: 'mark-key-1',
    event_type: 'mark',
    generated_at: generatedAt,
    paper_only: true,
    ...structuredClone(summaries[0]),
  };
  return {
    schema_version: 'bss.paper_state.v3',
    generated_at: generatedAt,
    paper_only: true,
    autonomous_execution: true,
    ledger: {
      schema_version: 4,
      currency: 'USD',
      paper_only: true,
      autonomous_execution: true,
      book_dimensions: {
        lines: PAPER_LINES.map((line_id, order) => ({ line_id, display_name: line_id, order })),
        strategies: PAPER_STRATEGIES.map((strategy_id, order) => ({
          strategy_id,
          display_name: strategy_id,
          order,
        })),
      },
      books,
      archived_books: [],
      processed_idempotency_keys: ['paper-tick-2026-07-11T18:43:00Z'],
      updated_at: generatedAt,
    },
    paper_books: summaries,
    paper_action_candidates: [action],
    paper_ledger_events: [fill, mark],
    recent_paper_trades: [structuredClone(fill)],
    governance: {
      paper_only: true,
      autonomous_paper_execution: true,
      human_review_required_for_actions: false,
      no_real_money_execution: true,
      stale_marks_block_new_buys: true,
      crash_requires_postmortem: true,
      loss_budget: 'entire_book_balance',
    },
  };
}

function legacyPaperStateV2() {
  const state = canonicalPaperState();
  state.schema_version = 'bss.paper_state.v2';
  const aggregateCosts = ['fees_paid', 'spread_costs', 'slippage_costs', 'market_impact_costs', 'latency_costs', 'transaction_costs', 'turnover_notional'];
  const fillCosts = ['cost_model_version', 'cost_assumption_source', 'reference_price', 'execution_price', 'gross_notional', 'fee_amount', 'spread_cost', 'slippage_cost', 'market_impact_cost', 'latency_cost', 'total_transaction_cost'];
  for (const book of state.ledger.books) for (const field of aggregateCosts) delete book[field];
  for (const summary of state.paper_books) for (const field of aggregateCosts) delete summary[field];
  for (const event of state.paper_ledger_events) {
    for (const field of event.event_type === 'paper_fill' ? fillCosts : aggregateCosts) delete event[field];
  }
  for (const event of state.recent_paper_trades) for (const field of fillCosts) delete event[field];
  return state;
}

function makeServer() {
  const store = new MemoryObservationStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      token_sha256: hashToken(INGEST_TOKEN),
      scopes: ['observations:write'],
      enabled: true,
    }],
    now: () => new Date('2026-07-11T18:43:00.000Z'),
    randomUuid: () => '00000000-0000-4000-8000-000000000001',
  });
  return { store, server: createCybermapApiServer({ store, now: () => Date.parse('2026-07-11T18:43:00.000Z') }) };
}

class SlowApplyStore extends MemoryObservationStore {
  async applyBatch(args) {
    await new Promise((resolve) => setTimeout(resolve, 75));
    return super.applyBatch(args);
  }
}

test('health and readiness expose no credential material', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: 'bss-cybermap-api' });

    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { ok: true, database: 'ready', migrations: 'ready' });
  });
});

test('requires ingest authentication and matching header/body identities', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const anonymous = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    });
    assert.equal(anonymous.status, 403);
    assert.deepEqual(await anonymous.json(), { ok: false, error: 'forbidden' });

    const mismatch = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(batch, { 'idempotency-key': 'different-key' }),
      body: JSON.stringify(batch),
    });
    assert.equal(mismatch.status, 400);
    assert.equal((await mismatch.json()).error, 'idempotency_key_mismatch');

    const unsafe = validBatch({ observations: [validObservation({ payload: { raw_frame: 'forbidden' } })] });
    const invalidCredential = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(unsafe, { 'x-blue-swallow-ingest-token': 'invalid-token-value' }),
      body: JSON.stringify(unsafe),
    });
    assert.equal(invalidCredential.status, 403);
    assert.deepEqual(await invalidCredential.json(), { ok: false, error: 'forbidden' });
  });
});

test('accepts one authenticated batch and marks exact replay without creating duplicates', async () => {
  const { server, store } = makeServer();
  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const first = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(batch),
      body: JSON.stringify(batch),
    });
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(first.headers.get('idempotent-replayed'), 'false');
    const firstReceipt = await first.json();
    assert.equal(firstReceipt.accepted_count, 1);

    const replay = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(batch),
      body: JSON.stringify(batch),
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotent-replayed'), 'true');
    assert.deepEqual(await replay.json(), firstReceipt);
    assert.equal(store.observationCount(), 1);
  });
});

test('returns conflict for changed payload under the same batch or observation key', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const firstBatch = validBatch();
    await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(firstBatch), body: JSON.stringify(firstBatch),
    });

    const reusedBatch = validBatch({ observations: [validObservation({ confidence: 0.3 })] });
    const batchConflict = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(reusedBatch), body: JSON.stringify(reusedBatch),
    });
    assert.equal(batchConflict.status, 409);
    assert.equal((await batchConflict.json()).error, 'idempotency_key_reused');

    const reusedObservation = validBatch({
      idempotency_key: 'batch-00000000-0000-4000-8000-000000000002',
      observations: [validObservation({ confidence: 0.3 })],
    });
    const observationConflict = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(reusedObservation), body: JSON.stringify(reusedObservation),
    });
    assert.equal(observationConflict.status, 409);
    assert.equal((await observationConflict.json()).error, 'observation_key_reused');
  });
});

test('rejects unsupported content types and oversized bodies while accepting passive observation payloads', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const unsupported = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(batch, { 'content-type': 'text/plain' }), body: JSON.stringify(batch),
    });
    assert.equal(unsupported.status, 415);

    const passive = validBatch({ observations: [validObservation({ payload: { bssid: '00:11:22:33:44:55', ssid: 'Public Broadcast Name', raw_frame: 'base64:management' } })] });
    const passiveResponse = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(passive), body: JSON.stringify(passive),
    });
    assert.equal(passiveResponse.status, 201);

    const oversizedBody = JSON.stringify({ padding: 'x'.repeat(1_048_577) });
    const oversized = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: {
        ...ingestHeaders(batch),
        'content-length': String(Buffer.byteLength(oversizedBody)),
      },
      body: oversizedBody,
    });
    assert.equal(oversized.status, 413);
  });
});

test('bounds authenticated ingest execution before a slow store can pin a request', async () => {
  const store = new SlowApplyStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      token_sha256: hashToken(INGEST_TOKEN),
      scopes: ['observations:write'],
      enabled: true,
    }],
    now: () => new Date('2026-07-11T18:43:00.000Z'),
    randomUuid: () => '00000000-0000-4000-8000-000000000001',
  });
  const server = createCybermapApiServer({
    store,
    now: () => Date.parse('2026-07-11T18:43:00.000Z'),
    ingestDeadlineMs: 10,
  });

  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(batch),
      body: JSON.stringify(batch),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'ingest_deadline_exceeded');
  });
});

test('serves token-gated Cybermap viewport reads from ingested real observations only', async () => {
  const previousReadToken = process.env.BSS_CYBERMAP_READ_TOKEN;
  process.env.BSS_CYBERMAP_READ_TOKEN = 'test-cybermap-read-token-32-byte-minimum';
  try {
    const { server } = makeServer();
    await withServer(server, async (baseUrl) => {
      const batch = validBatch({
        observations: [
          validObservation({
            payload: {
              bssid_hmac: 'hmac-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
              ssid_hmac: 'hmac-sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
              rssi_dbm: -67,
              frequency_mhz: 2412,
              passive_only: true,
            },
          }),
        ],
      });
      await fetch(`${baseUrl}/api/v1/observations/batch`, {
        method: 'POST',
        headers: ingestHeaders(batch),
        body: JSON.stringify(batch),
      });

      const anonymous = await fetch(`${baseUrl}/api/v1/cybermap/viewport?lat=47.6062&lon=-122.3321`);
      assert.equal(anonymous.status, 403);

      const response = await fetch(`${baseUrl}/api/v1/cybermap/viewport?lat=47.6062&lon=-122.3321&radiusMeters=100&limit=10`, {
        headers: { 'x-blue-swallow-cybermap-read-token': process.env.BSS_CYBERMAP_READ_TOKEN },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.source, 'cybermap-postgis');
      assert.equal(body.mode, 'viewport');
      assert.equal(body.live, true);
      assert.equal(body.totalResults, 1);
      assert.equal(body.accessPoints[0].ssid, 'hmac-sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210');
      assert.ok(body.accessPoints[0].distanceMeters <= 100);
    });
  } finally {
    if (previousReadToken === undefined) delete process.env.BSS_CYBERMAP_READ_TOKEN;
    else process.env.BSS_CYBERMAP_READ_TOKEN = previousReadToken;
  }
});

test('accepts legacy v2 snapshots during the v3 execution-cost rolling upgrade', () => {
  assert.equal(validatePaperState(legacyPaperStateV2(), PAPER_NOW_MS).schema_version, 'bss.paper_state.v2');
  assert.equal(validatePaperState(canonicalPaperState(), PAPER_NOW_MS).schema_version, 'bss.paper_state.v3');
});

test('v3 rejects negative or unreconciled aggregate and fill costs', () => {
  const negative = canonicalPaperState();
  negative.ledger.books[0].fees_paid = -1;
  assert.throws(() => validatePaperState(negative, PAPER_NOW_MS), /accounting|invalid/i);

  const unreconciled = canonicalPaperState();
  unreconciled.paper_books[0].transaction_costs = 10;
  assert.throws(() => validatePaperState(unreconciled, PAPER_NOW_MS), /summaries|invalid/i);

  const badFill = canonicalPaperState();
  badFill.paper_ledger_events[0].total_transaction_cost = 99;
  assert.throws(() => validatePaperState(badFill, PAPER_NOW_MS), /events|invalid/i);
});

test('stores and serves one token-gated canonical autonomous paper state idempotently', async () => {
  const previousToken = process.env.BSS_PAPER_STATE_TOKEN;
  process.env.BSS_PAPER_STATE_TOKEN = 'test-paper-state-token-32-byte-minimum';
  const state = canonicalPaperState();
  try {
    const { server } = makeServer();
    await withServer(server, async (baseUrl) => {
      const anonymous = await fetch(`${baseUrl}/api/v1/paper/state`);
      assert.equal(anonymous.status, 403);

      const headers = {
        'content-type': 'application/json',
        'x-blue-swallow-paper-state-token': process.env.BSS_PAPER_STATE_TOKEN,
        'idempotency-key': 'paper-tick-2026-07-11T18:43:00Z',
      };
      const legacyWrite = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT',
        headers: { ...headers, 'idempotency-key': 'legacy-v2-downgrade' },
        body: JSON.stringify(legacyPaperStateV2()),
      });
      assert.equal(legacyWrite.status, 400);
      assert.equal((await legacyWrite.json()).error, 'invalid_paper_state');

      const malformed = structuredClone(state);
      malformed.ledger.books[1] = structuredClone(malformed.ledger.books[0]);
      const rejected = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT',
        headers: { ...headers, 'idempotency-key': 'invalid-duplicate-book' },
        body: JSON.stringify(malformed),
      });
      assert.equal(rejected.status, 400);
      assert.equal((await rejected.json()).error, 'invalid_paper_state');

      const unexpected = structuredClone(state);
      unexpected.private_secret = 'must-not-store';
      const unexpectedRejected = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT',
        headers: { ...headers, 'idempotency-key': 'invalid-unexpected-field' },
        body: JSON.stringify(unexpected),
      });
      assert.equal(unexpectedRejected.status, 400);
      assert.equal((await unexpectedRejected.json()).error, 'invalid_paper_state');

      const first = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT', headers, body: JSON.stringify(state),
      });
      assert.equal(first.status, 201);
      assert.equal(first.headers.get('idempotent-replayed'), 'false');

      const replay = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT', headers, body: JSON.stringify(state),
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.headers.get('idempotent-replayed'), 'true');

      const conflict = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT', headers, body: JSON.stringify({ ...state, generated_at: '2026-07-11T18:44:00.000Z' }),
      });
      assert.equal(conflict.status, 409);
      assert.equal((await conflict.json()).error, 'idempotency_key_reused');

      const read = await fetch(`${baseUrl}/api/v1/paper/state`, {
        headers: { 'x-blue-swallow-paper-state-token': process.env.BSS_PAPER_STATE_TOKEN },
      });
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.source, 'mosaic-murmurs-paper-engine');
      assert.deepEqual(body.state, state);
    });
  } finally {
    if (previousToken === undefined) delete process.env.BSS_PAPER_STATE_TOKEN;
    else process.env.BSS_PAPER_STATE_TOKEN = previousToken;
  }
});

test('paper-state validator recursively rejects unknown nested fields and string numerics', () => {
  assert.deepEqual(validatePaperState(canonicalPaperState(), PAPER_NOW_MS), canonicalPaperState());

  const unknownMutations = [
    (state) => { state.ledger.book_dimensions.private_secret = true; },
    (state) => { state.ledger.book_dimensions.lines[0].private_secret = true; },
    (state) => { state.ledger.book_dimensions.strategies[0].private_secret = true; },
    (state) => { state.ledger.books[0].aggression_profile.private_secret = true; },
    (state) => { state.ledger.books[0].positions[0].private_secret = true; },
    (state) => { state.paper_books[0].aggression_profile.private_secret = true; },
    (state) => { state.paper_action_candidates[0].private_secret = true; },
    (state) => { state.paper_ledger_events[0].private_secret = true; },
    (state) => { state.recent_paper_trades[0].private_secret = true; },
    (state) => { state.governance.private_secret = true; },
  ];
  for (const mutate of unknownMutations) {
    const state = canonicalPaperState();
    mutate(state);
    assert.throws(
      () => validatePaperState(state, PAPER_NOW_MS),
      (error) => error.code === 'invalid_paper_state' && error.statusCode === 400,
    );
  }

  const numericMutations = [
    (state) => { state.ledger.schema_version = '4'; },
    (state) => { state.ledger.book_dimensions.lines[0].order = '0'; },
    (state) => { state.ledger.books[0].aggression_profile.target_gross_fraction = '0.8'; },
    (state) => { state.ledger.books[0].starting_balance = '2000'; },
    (state) => { state.ledger.books[0].positions[0].quantity = '1'; },
    (state) => { state.paper_books[0].equity = '2000'; },
    (state) => { state.paper_action_candidates[0].paper_size = '100'; },
    (state) => { state.paper_ledger_events[0].cash_after = '1000'; },
    (state) => { state.recent_paper_trades[0].mark_price = '100'; },
  ];
  for (const mutate of numericMutations) {
    const state = canonicalPaperState();
    mutate(state);
    assert.throws(() => validatePaperState(state, PAPER_NOW_MS), { code: 'invalid_paper_state' });
  }

  for (const mutate of [
    (state) => { delete state.ledger.currency; },
    (state) => { delete state.ledger.books[0].positions[0].symbol; },
    (state) => { state.paper_action_candidates[0].action = 'ARBITRARY_ACTION'; },
    (state) => { state.paper_action_candidates[0].review_required = 'false'; },
    (state) => { state.paper_action_candidates.push(structuredClone(state.paper_action_candidates[0])); },
    (state) => { state.paper_ledger_events.push(structuredClone(state.paper_ledger_events[0])); },
    (state) => {
      const duplicate = structuredClone(state.recent_paper_trades[0]);
      duplicate.event_id = 'distinct-event-same-idempotency-key';
      state.recent_paper_trades.push(duplicate);
    },
  ]) {
    const state = canonicalPaperState();
    mutate(state);
    assert.throws(() => validatePaperState(state, PAPER_NOW_MS), { code: 'invalid_paper_state' });
  }
});

test('paper-state endpoint rejects a configured token outside the shared safe format', async () => {
  const previousToken = process.env.BSS_PAPER_STATE_TOKEN;
  process.env.BSS_PAPER_STATE_TOKEN = 'short';
  try {
    const { server } = makeServer();
    await withServer(server, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/paper/state`, {
        headers: { 'x-blue-swallow-paper-state-token': 'short' },
      });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, 'paper_state_token_unconfigured');
    });
  } finally {
    if (previousToken === undefined) delete process.env.BSS_PAPER_STATE_TOKEN;
    else process.env.BSS_PAPER_STATE_TOKEN = previousToken;
  }
});

test('paper-state validator bounds risk checks, validates source URLs, and caps every variable collection', () => {
  const malformedRiskChecks = canonicalPaperState();
  malformedRiskChecks.paper_action_candidates[0].risk_policy_checks = 'paper_only';
  assert.throws(() => validatePaperState(malformedRiskChecks, PAPER_NOW_MS), { code: 'invalid_paper_state' });

  const tooManyRiskChecks = canonicalPaperState();
  tooManyRiskChecks.paper_action_candidates[0].risk_policy_checks = Array.from({ length: 33 }, (_, index) => `check-${index}`);
  assert.throws(() => validatePaperState(tooManyRiskChecks, PAPER_NOW_MS), { code: 'invalid_paper_state' });

  const oversizedRiskCheck = canonicalPaperState();
  oversizedRiskCheck.paper_action_candidates[0].risk_policy_checks = ['x'.repeat(257)];
  assert.throws(() => validatePaperState(oversizedRiskCheck, PAPER_NOW_MS), { code: 'invalid_paper_state' });

  for (const mutate of [
    (state) => { state.ledger.books[0].positions[0].source_url = 'javascript:alert(1)'; },
    (state) => { state.paper_action_candidates[0].source_url = 'https://user:password@example.test/private'; },
  ]) {
    const state = canonicalPaperState();
    mutate(state);
    assert.throws(() => validatePaperState(state, PAPER_NOW_MS), { code: 'invalid_paper_state' });
  }

  const collectionMutations = [
    (state) => {
      const position = state.ledger.books[0].positions[0];
      state.ledger.books[0].positions = Array.from({ length: 65 }, (_, index) => ({
        ...structuredClone(position),
        position_id: `position-${index}`,
        instrument_ref: `instrument-${index}`,
      }));
    },
    (state) => {
      state.ledger.archived_books = Array.from({ length: 65 }, (_, index) => ({
        book_id: `legacy-${index}`,
        archived_at: state.generated_at,
        archive_reason: 'migration',
      }));
    },
    (state) => { state.ledger.processed_idempotency_keys = Array.from({ length: 513 }, (_, index) => `tick-${index}`); },
    (state) => {
      const action = state.paper_action_candidates[0];
      state.paper_action_candidates = Array.from({ length: 257 }, (_, index) => ({
        ...structuredClone(action), candidate_id: `candidate-${index}`, decision_id: `decision-${index}`, idempotency_key: `action-${index}`,
      }));
    },
    (state) => {
      const event = state.paper_ledger_events[0];
      state.paper_ledger_events = Array.from({ length: 257 }, (_, index) => ({
        ...structuredClone(event), event_id: `event-${index}`, idempotency_key: `event-${index}`,
      }));
    },
    (state) => {
      const fill = state.recent_paper_trades[0];
      state.recent_paper_trades = Array.from({ length: 65 }, (_, index) => ({
        ...structuredClone(fill), event_id: `recent-${index}`, idempotency_key: `recent-${index}`,
      }));
    },
  ];
  for (const mutate of collectionMutations) {
    const state = canonicalPaperState();
    mutate(state);
    assert.throws(() => validatePaperState(state, PAPER_NOW_MS), { code: 'invalid_paper_state' });
  }
});

test('paper-state validator enforces strict RFC3339, future skew, three-hour freshness, and nested timestamps', () => {
  for (const generatedAt of [
    '2026-07-11T15:42:59.999Z',
    '2026-07-11 18:43:00Z',
    '2026-02-30T18:43:00Z',
    '2026-07-11T18:48:00.001Z',
  ]) {
    assert.throws(
      () => validatePaperState(canonicalPaperState({ generatedAt }), PAPER_NOW_MS),
      { code: 'invalid_paper_state' },
    );
  }

  const nestedTimestampMutations = [
    (state) => { state.ledger.updated_at = '2026-07-11 18:43:00Z'; },
    (state) => { state.ledger.books[0].created_at = 'not-a-timestamp'; },
    (state) => { state.ledger.books[0].positions[0].updated_at = '2026-02-30T18:43:00Z'; },
    (state) => { state.paper_books[0].crashed_at = 'tomorrow'; },
    (state) => { state.paper_action_candidates[0].generated_at = '2026-07-11T18:48:00.001Z'; },
    (state) => { state.paper_ledger_events[0].generated_at = '2026-07-11T18:43Z'; },
    (state) => { state.recent_paper_trades[0].generated_at = '2026-07-11'; },
  ];
  for (const mutate of nestedTimestampMutations) {
    const state = canonicalPaperState();
    mutate(state);
    assert.throws(() => validatePaperState(state, PAPER_NOW_MS), { code: 'invalid_paper_state' });
  }
});

test('paper-state GET returns 503 instead of serving stale or corrupt stored state', async () => {
  const previousToken = process.env.BSS_PAPER_STATE_TOKEN;
  process.env.BSS_PAPER_STATE_TOKEN = 'test-paper-state-token-32-byte-minimum';
  try {
    for (const state of [canonicalPaperState({ generatedAt: '2026-07-11T15:42:59.999Z' }), { corrupt: true }]) {
      const store = {
        async ready() { return { ok: true }; },
        async getPaperState() {
          return { idempotencyKey: 'stored-state', appliedAt: '2026-07-11T18:43:00.000Z', state };
        },
      };
      const server = createCybermapApiServer({ store, now: () => PAPER_NOW_MS });
      await withServer(server, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/paper/state`, {
          headers: { 'x-blue-swallow-paper-state-token': process.env.BSS_PAPER_STATE_TOKEN },
        });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { ok: false, error: 'paper_state_unavailable' });
      });
    }
  } finally {
    if (previousToken === undefined) delete process.env.BSS_PAPER_STATE_TOKEN;
    else process.env.BSS_PAPER_STATE_TOKEN = previousToken;
  }
});

test('keeps legacy echo probe alive on the Cybermap API port during migration', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/echo?msg=hello%20black%20ice`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      echo: 'hello black ice',
      path: '/echo',
      query: { msg: ['hello black ice'] },
    });
  });
});
