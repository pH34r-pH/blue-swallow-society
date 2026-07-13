import crypto from 'node:crypto';
import http from 'node:http';

import { IngestError } from './auth.mjs';
import { ContractError, validateObservationBatch } from './contracts.mjs';

const MAX_BODY_BYTES = 1_048_576;
const INGEST_PATH = '/api/v1/observations/batch';
const VIEWPORT_PATH = '/api/v1/cybermap/viewport';
const PAPER_STATE_PATH = '/api/v1/paper/state';
const PAPER_LINE_IDS = Object.freeze(['standard', 'aggressive', 'hyper_aggressive']);
const PAPER_STRATEGY_IDS = Object.freeze([
  'prediction_markets',
  'crypto',
  'equity_watch',
  'local_event_watch',
  'ai_cyber_watch',
  'cross_asset_momentum',
  'contrarian_reversion',
  'volatility_barbell',
]);
const PAPER_BOOK_IDS = Object.freeze(
  PAPER_LINE_IDS.flatMap((lineId) => PAPER_STRATEGY_IDS.map((strategyId) => `${lineId}__${strategyId}`)),
);
const PAPER_STATE_KEYS = new Set(['schema_version', 'generated_at', 'paper_only', 'autonomous_execution', 'ledger', 'paper_books', 'paper_action_candidates', 'paper_ledger_events', 'recent_paper_trades', 'governance']);
const PAPER_LEDGER_KEYS = new Set(['schema_version', 'currency', 'paper_only', 'autonomous_execution', 'book_dimensions', 'books', 'archived_books', 'processed_idempotency_keys', 'updated_at']);
const PAPER_BOOK_KEYS = new Set([
  'book_id', 'display_name', 'line_id', 'line_display_name', 'strategy_id', 'strategy_display_name', 'aggression_profile',
  'loop_affinity', 'instrument_type', 'strategy', 'starting_balance', 'cash_balance', 'initial_bank_capital',
  'initial_investment_capital', 'additional_capital_contribution', 'funding_migration_applied', 'initial_allocation_complete',
  'initial_allocation_at', 'positions', 'realized_pnl', 'equity', 'previous_equity', 'high_water_mark', 'max_drawdown_pct',
  'last_trade_at', 'last_decision_at', 'status', 'postmortem_required', 'crashed_at', 'crash_reason', 'created_at', 'updated_at',
]);
const PAPER_PROFILE_KEYS = new Set(['target_gross_fraction', 'max_position_fraction', 'target_position_count', 'minimum_order_notional']);
const PAPER_POSITION_KEYS = new Set([
  'position_id', 'instrument_ref', 'instrument_type', 'symbol', 'title', 'quantity', 'entry_price', 'mark_price',
  'previous_mark_price', 'cost_basis', 'market_value', 'mark_status', 'source_id', 'source_url', 'opened_at', 'updated_at',
]);
const PAPER_SUMMARY_KEYS = new Set([
  'book_id', 'display_name', 'line_id', 'line_display_name', 'strategy_id', 'strategy_display_name', 'aggression_profile',
  'starting_balance', 'cash_balance', 'realized_pnl', 'unrealized_pnl', 'gross_paper_exposure', 'equity', 'daily_pnl',
  'daily_pnl_pct', 'cumulative_pnl', 'cumulative_pnl_pct', 'drawdown_pct', 'max_drawdown_pct', 'open_position_count',
  'stale_open_marks', 'postmortem_required', 'crashed_at', 'status',
]);
const PAPER_ACTION_KEYS = new Set([
  'candidate_id', 'decision_id', 'idempotency_key', 'book_id', 'action', 'status', 'instrument_ref', 'instrument_type',
  'symbol', 'paper_size', 'mark_price', 'thesis', 'risk_policy_checks', 'risk_policy_passed', 'paper_only',
  'autonomous_execution', 'human_review_required', 'review_required', 'generated_at', 'source_ref', 'source_url',
]);
const PAPER_FILL_KEYS = new Set([
  'event_id', 'decision_id', 'idempotency_key', 'book_id', 'event_type', 'action', 'instrument_ref', 'quantity',
  'mark_price', 'paper_size', 'realized_pnl', 'cash_before', 'cash_after', 'position_quantity_before',
  'position_quantity_after', 'generated_at', 'paper_only', 'autonomous_execution',
]);
const PAPER_CRASH_KEYS = new Set(['event_id', 'idempotency_key', 'book_id', 'event_type', 'equity', 'generated_at', 'paper_only', 'postmortem_required']);
const PAPER_MARK_KEYS = new Set(['event_id', 'idempotency_key', 'event_type', 'generated_at', 'paper_only', ...PAPER_SUMMARY_KEYS]);
const PAPER_GOVERNANCE_KEYS = new Set(['paper_only', 'autonomous_paper_execution', 'human_review_required_for_actions', 'no_real_money_execution', 'stale_marks_block_new_buys', 'crash_requires_postmortem', 'loss_budget']);
const PAPER_LINE_KEYS = new Set(['line_id', 'display_name', 'order']);
const PAPER_STRATEGY_KEYS = new Set(['strategy_id', 'display_name', 'order']);
const PAPER_ARCHIVE_KEYS = new Set(['book_id', 'archived_at', 'archive_reason']);
const PAPER_STATE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const PAPER_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_PAPER_POSITIONS_PER_BOOK = 32;
const MAX_PAPER_ARCHIVES = 64;
const MAX_PAPER_PROCESSED_KEYS = 512;
const MAX_PAPER_ACTIONS = 256;
const MAX_PAPER_EVENTS = 256;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function createCybermapApiServer({ store, now = Date.now, logger = null, ingestDeadlineMs = 5_000 } = {}) {
  if (!store) throw new TypeError('store is required');
  const server = http.createServer(createRequestHandler({ store, now, logger, ingestDeadlineMs }));
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 32;
  return server;
}

export function createRequestHandler({ store, now = Date.now, logger = null, ingestDeadlineMs = 5_000 }) {
  return async function requestHandler(request, response) {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(response, 200, { ok: true, service: 'bss-cybermap-api' });
      }
      if (request.method === 'GET' && url.pathname === '/echo') {
        return sendJson(response, 200, buildEchoPayload(url));
      }
      if (request.method === 'GET' && url.pathname === '/readyz') {
        const readiness = await store.ready();
        return sendJson(response, readiness.ok ? 200 : 503, readiness);
      }
      if (request.method === 'GET' && url.pathname === VIEWPORT_PATH) {
        requireBackendReadToken(request);
        const viewport = await handleCybermapViewport(url, { store, now });
        return sendJson(response, 200, viewport);
      }
      if (url.pathname === PAPER_STATE_PATH && (request.method === 'GET' || request.method === 'PUT')) {
        requirePaperStateToken(request);
        if (request.method === 'GET') return await handlePaperStateRead(response, { store, now });
        return await handlePaperStateWrite(request, response, { store, now });
      }
      if (request.method !== 'POST' || url.pathname !== INGEST_PATH) {
        request.resume();
        return sendJson(response, 404, { ok: false, error: 'not_found' });
      }
      return await handleObservationBatch(request, response, { store, now, ingestDeadlineMs });
    } catch (error) {
      logger?.error?.({ code: error?.code ?? 'internal_error', statusCode: error?.statusCode ?? 500 });
      return sendError(response, error);
    }
  };
}

async function handleObservationBatch(request, response, { store, now, ingestDeadlineMs }) {
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    request.resume();
    throw new IngestError('unsupported_media_type', 'Content-Type must be application/json.', { statusCode: 415 });
  }

  const token = singleHeader(request, 'x-blue-swallow-ingest-token');
  const deviceId = singleHeader(request, 'x-blue-swallow-device-id');
  const idempotencyKey = singleHeader(request, 'idempotency-key');
  if (!token || token.length < 32 || token.length > 512
      || !deviceId || deviceId.length > 160
      || !idempotencyKey || idempotencyKey.length > 200) {
    request.resume();
    throw new IngestError('forbidden', 'Forbidden.', { statusCode: 403 });
  }

  const credential = await store.authenticate({ deviceId, token, requiredScope: 'observations:write' });
  const rawBody = await readBody(request);
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new IngestError('invalid_json', 'Malformed JSON.', { statusCode: 400 });
  }
  if (parsed?.device_id !== deviceId) {
    throw new IngestError('device_id_mismatch', 'Device header and body do not match.', { statusCode: 400 });
  }
  if (parsed?.idempotency_key !== idempotencyKey) {
    throw new IngestError('idempotency_key_mismatch', 'Idempotency header and body do not match.', { statusCode: 400 });
  }

  const batch = validateObservationBatch(parsed, { now: now() });
  const result = await withIngestDeadline(
    store.applyBatch({ credential, batch }),
    ingestDeadlineMs,
  );
  return sendJson(response, result.statusCode, result.receipt, {
    'Idempotent-Replayed': String(result.replayed),
  });
}

async function handlePaperStateWrite(request, response, { store, now }) {
  if (typeof store.putPaperState !== 'function') {
    throw new IngestError('paper_state_unavailable', 'Paper state persistence is not available.', { statusCode: 503 });
  }
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    request.resume();
    throw new IngestError('unsupported_media_type', 'Content-Type must be application/json.', { statusCode: 415 });
  }
  const idempotencyKey = singleHeader(request, 'idempotency-key');
  if (!/^[A-Za-z0-9._:~-]{1,200}$/.test(idempotencyKey || '')) {
    request.resume();
    throw new IngestError('forbidden', 'Forbidden.', { statusCode: 403 });
  }
  let parsed;
  try {
    parsed = JSON.parse(await readBody(request));
  } catch {
    throw new IngestError('invalid_json', 'Malformed JSON.', { statusCode: 400 });
  }
  const state = validatePaperState(parsed, now());
  const result = await store.putPaperState({ idempotencyKey, state });
  return sendJson(response, result.statusCode, {
    ok: true,
    source: 'mosaic-murmurs-paper-engine',
    idempotency_key: idempotencyKey,
    generated_at: state.generated_at,
  }, { 'Idempotent-Replayed': String(result.replayed) });
}

async function handlePaperStateRead(response, { store, now }) {
  if (typeof store.getPaperState !== 'function') {
    throw new IngestError('paper_state_unavailable', 'Paper state persistence is not available.', { statusCode: 503 });
  }
  const current = await store.getPaperState();
  if (!current) throw new IngestError('paper_state_not_found', 'No paper state has been synchronized.', { statusCode: 404 });
  try {
    validatePaperState(current.state, now());
  } catch (error) {
    if (error?.code === 'invalid_paper_state') {
      throw new IngestError('paper_state_unavailable', 'Stored paper state failed integrity validation.', { statusCode: 503 });
    }
    throw error;
  }
  return sendJson(response, 200, {
    ok: true,
    source: 'mosaic-murmurs-paper-engine',
    idempotency_key: current.idempotencyKey,
    updated_at: current.appliedAt,
    state: current.state,
  });
}

export function validatePaperState(value, nowMs) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IngestError('invalid_paper_state', 'Paper state must be an object.', { statusCode: 400 });
  }
  const generatedAt = timestampMs(value.generated_at);
  if (!hasOnlyKeys(value, PAPER_STATE_KEYS)
      || value.schema_version !== 'bss.paper_state.v2'
      || value.paper_only !== true
      || value.autonomous_execution !== true
      || !Number.isFinite(generatedAt)
      || generatedAt > nowMs + PAPER_FUTURE_SKEW_MS
      || generatedAt < nowMs - PAPER_STATE_MAX_AGE_MS) {
    throw new IngestError('invalid_paper_state', 'Paper state envelope is invalid.', { statusCode: 400 });
  }
  const ledger = value.ledger;
  if (!isPlainObject(ledger)
      || !hasOnlyKeys(ledger, PAPER_LEDGER_KEYS)
      || ledger.schema_version !== 4
      || ledger.paper_only !== true
      || ledger.autonomous_execution !== true
      || !Array.isArray(ledger.books)
      || !isPlainObject(ledger.book_dimensions)
      || !hasOnlyKeys(ledger.book_dimensions, new Set(['lines', 'strategies']))
      || !Array.isArray(ledger.archived_books)
      || ledger.archived_books.length > MAX_PAPER_ARCHIVES
      || !ledger.archived_books.every((book) => isPlainObject(book)
        && hasOnlyKeys(book, PAPER_ARCHIVE_KEYS)
        && typeof book.book_id === 'string' && book.book_id.length > 0
        && validTimestampAt(book.archived_at, nowMs))
      || !Array.isArray(ledger.processed_idempotency_keys)
      || ledger.processed_idempotency_keys.length > MAX_PAPER_PROCESSED_KEYS
      || new Set(ledger.processed_idempotency_keys).size !== ledger.processed_idempotency_keys.length
      || !ledger.processed_idempotency_keys.every((key) => typeof key === 'string' && key.length > 0 && key.length <= 200)
      || !validTimestampAt(ledger.updated_at, nowMs)) {
    throw new IngestError('invalid_paper_state', 'Canonical 3x8 paper ledger is required.', { statusCode: 400 });
  }
  const dimensionLineIds = ledger.book_dimensions?.lines?.map((line) => line?.line_id);
  const dimensionStrategyIds = ledger.book_dimensions?.strategies?.map((strategy) => strategy?.strategy_id);
  if (!hasExactIds(dimensionLineIds, PAPER_LINE_IDS)
      || !hasExactIds(dimensionStrategyIds, PAPER_STRATEGY_IDS)
      || !ledger.book_dimensions.lines.every((line) => isPlainObject(line)
        && hasOnlyKeys(line, PAPER_LINE_KEYS)
        && typeof line.display_name === 'string'
        && Number.isInteger(line.order))
      || !ledger.book_dimensions.strategies.every((strategy) => isPlainObject(strategy)
        && hasOnlyKeys(strategy, PAPER_STRATEGY_KEYS)
        && typeof strategy.display_name === 'string'
        && Number.isInteger(strategy.order))) {
    throw new IngestError('invalid_paper_state', 'Paper book dimensions must define three lines and eight strategies.', { statusCode: 400 });
  }
  const bookIds = ledger.books.map((book) => book?.book_id);
  if (!hasExactIds(bookIds, PAPER_BOOK_IDS)) {
    throw new IngestError('invalid_paper_state', 'All 24 canonical paper books are required exactly once.', { statusCode: 400 });
  }
  for (const book of ledger.books) {
    const expectedBookId = `${book?.line_id}__${book?.strategy_id}`;
    if (!isPlainObject(book)
        || !hasOnlyKeys(book, PAPER_BOOK_KEYS)
        || book.book_id !== expectedBookId
        || !PAPER_LINE_IDS.includes(book.line_id)
        || !PAPER_STRATEGY_IDS.includes(book.strategy_id)
        || !finiteNumber(book.starting_balance) || book.starting_balance !== 2000
        || !finiteNumber(book.initial_bank_capital) || book.initial_bank_capital !== 1000
        || !finiteNumber(book.initial_investment_capital) || book.initial_investment_capital !== 1000
        || !finiteNumber(book.cash_balance) || book.cash_balance < 0
        || !validAggressionProfile(book.aggression_profile)
        || !Array.isArray(book.positions)
        || book.positions.length > MAX_PAPER_POSITIONS_PER_BOOK
        || !book.positions.every((position) => validatePaperPosition(position, nowMs))
        || !['additional_capital_contribution', 'realized_pnl', 'equity', 'previous_equity', 'high_water_mark', 'max_drawdown_pct'].every((field) => finiteNumber(book[field]))
        || typeof book.funding_migration_applied !== 'boolean'
        || typeof book.initial_allocation_complete !== 'boolean'
        || typeof book.postmortem_required !== 'boolean'
        || typeof book.status !== 'string'
        || !validTimestampAt(book.created_at, nowMs)
        || !validTimestampAt(book.updated_at, nowMs)
        || !nullableTimestamp(book.initial_allocation_at, nowMs)
        || !nullableTimestamp(book.last_trade_at, nowMs)
        || !nullableTimestamp(book.last_decision_at, nowMs)
        || !nullableTimestamp(book.crashed_at, nowMs)) {
      throw new IngestError('invalid_paper_state', 'Paper book accounting or matrix identity is invalid.', { statusCode: 400 });
    }
  }
  const summaries = value.paper_books;
  const actions = value.paper_action_candidates;
  const events = value.paper_ledger_events;
  const recent = value.recent_paper_trades;
  if (!Array.isArray(summaries)
      || !hasExactIds(summaries.map((book) => book?.book_id), PAPER_BOOK_IDS)
      || !summaries.every((summary) => isPlainObject(summary)
        && hasOnlyKeys(summary, PAPER_SUMMARY_KEYS)
        && summary.book_id === `${summary.line_id}__${summary.strategy_id}`
        && validAggressionProfile(summary.aggression_profile)
        && nullableTimestamp(summary.crashed_at, nowMs)
        && ['starting_balance', 'cash_balance', 'realized_pnl', 'unrealized_pnl', 'gross_paper_exposure', 'equity', 'daily_pnl', 'daily_pnl_pct', 'cumulative_pnl', 'cumulative_pnl_pct', 'drawdown_pct', 'max_drawdown_pct', 'open_position_count', 'stale_open_marks'].every((field) => finiteNumber(summary[field])))
      || !Array.isArray(actions)
      || actions.length > MAX_PAPER_ACTIONS
      || !actions.every((action) => isPlainObject(action)
        && hasOnlyKeys(action, PAPER_ACTION_KEYS)
        && action.paper_only === true
        && PAPER_BOOK_IDS.includes(action.book_id)
        && validTimestampAt(action.generated_at, nowMs)
        && typeof action.autonomous_execution === 'boolean'
        && typeof action.risk_policy_passed === 'boolean'
        && typeof action.human_review_required === 'boolean'
        && Array.isArray(action.risk_policy_checks)
        && action.risk_policy_checks.length <= 32
        && action.risk_policy_checks.every((check) => typeof check === 'string' && check.length <= 200)
        && nullableHttpsUrl(action.source_url)
        && (action.mark_price === null || finiteNumber(action.mark_price))
        && finiteNumber(action.paper_size) && action.paper_size >= 0
        && (!['PAPER_BUY', 'PAPER_SELL'].includes(action.action) || action.autonomous_execution === true))
      || !Array.isArray(events)
      || events.length > MAX_PAPER_EVENTS
      || !events.every((event) => validatePaperEvent(event, nowMs))
      || !Array.isArray(recent)
      || recent.length > 64
      || !recent.every((event) => validatePaperEvent(event, nowMs) && event.event_type === 'paper_fill')
      || new Set(recent.map((event) => event.event_id)).size !== recent.length
      || !isPlainObject(value.governance)
      || !hasOnlyKeys(value.governance, PAPER_GOVERNANCE_KEYS)
      || value.governance.paper_only !== true
      || value.governance.autonomous_paper_execution !== true
      || typeof value.governance.human_review_required_for_actions !== 'boolean'
      || value.governance.no_real_money_execution !== true
      || value.governance.stale_marks_block_new_buys !== true
      || value.governance.crash_requires_postmortem !== true
      || value.governance.loss_budget !== 'entire_book_balance') {
    throw new IngestError('invalid_paper_state', 'Paper summaries, actions, events, recent trades, or governance are invalid.', { statusCode: 400 });
  }
  return structuredClone(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isPlainObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function timestampMs(value) {
  if (typeof value !== 'string' || !RFC3339_RE.test(value)) return Number.NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return Number.NaN;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return Number.NaN;
  return Date.parse(value);
}

function validTimestamp(value) {
  return Number.isFinite(timestampMs(value));
}

function validTimestampAt(value, nowMs) {
  const parsed = timestampMs(value);
  return Number.isFinite(parsed) && parsed <= nowMs + PAPER_FUTURE_SKEW_MS;
}

function nullableTimestamp(value, nowMs = null) {
  return value === null || value === undefined || (Number.isFinite(nowMs) ? validTimestampAt(value, nowMs) : validTimestamp(value));
}

function nullableHttpsUrl(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function validAggressionProfile(profile) {
  return isPlainObject(profile)
    && hasOnlyKeys(profile, PAPER_PROFILE_KEYS)
    && finiteNumber(profile.target_gross_fraction) && profile.target_gross_fraction > 0 && profile.target_gross_fraction <= 1
    && finiteNumber(profile.max_position_fraction) && profile.max_position_fraction > 0 && profile.max_position_fraction <= 1
    && Number.isInteger(profile.target_position_count) && profile.target_position_count >= 1 && profile.target_position_count <= 32
    && finiteNumber(profile.minimum_order_notional) && profile.minimum_order_notional >= 0;
}

function validatePaperPosition(position, nowMs) {
  if (!isPlainObject(position)
      || !hasOnlyKeys(position, PAPER_POSITION_KEYS)
      || typeof position.position_id !== 'string' || position.position_id.length === 0
      || typeof position.instrument_ref !== 'string' || position.instrument_ref.length === 0
      || !['crypto', 'equity', 'prediction_market'].includes(position.instrument_type)
      || typeof position.source_id !== 'string' || position.source_id.length === 0
      || !nullableHttpsUrl(position.source_url)
      || !validTimestampAt(position.opened_at, nowMs)
      || !validTimestampAt(position.updated_at, nowMs)
      || !['fresh', 'stale'].includes(position.mark_status)
      || !['quantity', 'entry_price', 'mark_price', 'previous_mark_price', 'cost_basis', 'market_value'].every((field) => finiteNumber(position[field]) && position[field] >= 0)) return false;
  if (position.instrument_type === 'prediction_market') {
    return position.entry_price <= 1 && position.mark_price <= 1 && position.previous_mark_price <= 1;
  }
  return position.entry_price > 0 && position.mark_price > 0 && position.previous_mark_price > 0;
}

function validatePaperEvent(event, nowMs) {
  if (!isPlainObject(event)
      || event.paper_only !== true
      || !PAPER_BOOK_IDS.includes(event.book_id)
      || typeof event.event_id !== 'string'
      || event.event_id.length === 0
      || !validTimestampAt(event.generated_at, nowMs)) return false;
  if (event.event_type === 'paper_fill') {
    return hasOnlyKeys(event, PAPER_FILL_KEYS)
      && ['PAPER_BUY', 'PAPER_SELL'].includes(event.action)
      && event.autonomous_execution === true
      && ['quantity', 'paper_size', 'realized_pnl', 'mark_price', 'cash_before', 'cash_after', 'position_quantity_before', 'position_quantity_after'].every((field) => finiteNumber(event[field]) && (field === 'realized_pnl' || event[field] >= 0));
  }
  if (event.event_type === 'mark') {
    return hasOnlyKeys(event, PAPER_MARK_KEYS)
      && event.book_id === `${event.line_id}__${event.strategy_id}`
      && finiteNumber(event.equity)
      && finiteNumber(event.cash_balance)
      && finiteNumber(event.gross_paper_exposure);
  }
  if (event.event_type === 'book_crashed') {
    return hasOnlyKeys(event, PAPER_CRASH_KEYS)
      && event.postmortem_required === true
      && finiteNumber(event.equity);
  }
  return false;
}

function hasExactIds(values, expected) {
  if (!Array.isArray(values) || values.length !== expected.length) return false;
  const unique = new Set(values);
  return unique.size === expected.length && expected.every((value) => unique.has(value));
}

function buildEchoPayload(url) {
  const query = {};
  for (const key of new Set(url.searchParams.keys())) {
    query[key] = url.searchParams.getAll(key);
  }
  return {
    ok: true,
    echo: url.searchParams.get('msg') || '',
    path: url.pathname,
    query,
  };
}

async function handleCybermapViewport(url, { store, now }) {
  if (typeof store.queryViewport !== 'function') {
    throw new IngestError('viewport_unavailable', 'Cybermap viewport reads are not available.', { statusCode: 503 });
  }

  const lat = parseFiniteNumber(url.searchParams.get('lat') ?? url.searchParams.get('latitude'));
  const lon = parseFiniteNumber(url.searchParams.get('lon') ?? url.searchParams.get('longitude'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new IngestError('invalid_viewport', 'lat and lon query parameters are required.', { statusCode: 400 });
  }

  const radiusMeters = clampFiniteNumber(url.searchParams.get('radiusMeters'), 25, 5_000, 100);
  const limit = Math.trunc(clampFiniteNumber(url.searchParams.get('limit'), 1, 500, 100));
  const maxAgeMs = url.searchParams.has('maxAgeMs')
    ? clampFiniteNumber(url.searchParams.get('maxAgeMs'), 1_000, 86_400_000, 45_000)
    : null;
  const clock = parseTimestampMs(url.searchParams.get('now'));
  const nowMs = Number.isFinite(clock) ? clock : now();

  return store.queryViewport({ lat, lon, radiusMeters, limit, maxAgeMs, now: new Date(nowMs) });
}

function requirePaperStateToken(request) {
  const expected = String(process.env.BSS_PAPER_STATE_TOKEN || '').trim();
  if (!expected) {
    throw new IngestError('paper_state_token_unconfigured', 'Paper state token is not configured.', { statusCode: 503 });
  }
  const actual = singleHeader(request, 'x-blue-swallow-paper-state-token');
  if (!safeEqualString(actual, expected)) {
    throw new IngestError('forbidden', 'Forbidden.', { statusCode: 403 });
  }
}

function requireBackendReadToken(request) {
  const expected = String(process.env.BSS_CYBERMAP_READ_TOKEN || '').trim();
  if (!expected) {
    throw new IngestError('read_token_unconfigured', 'Cybermap read token is not configured.', { statusCode: 503 });
  }
  const actual = singleHeader(request, 'x-blue-swallow-cybermap-read-token');
  if (!safeEqualString(actual, expected)) {
    throw new IngestError('forbidden', 'Forbidden.', { statusCode: 403 });
  }
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTimestampMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampFiniteNumber(value, minimum, maximum, fallback) {
  const number = parseFiniteNumber(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function safeEqualString(actual, expected) {
  if (!actual || !expected) return false;
  const left = Buffer.from(String(actual));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function singleHeader(request, name) {
  const value = request.headers[name];
  if (Array.isArray(value)) return '';
  return typeof value === 'string' ? value.trim() : '';
}

function withIngestDeadline(promise, deadlineMs) {
  const boundedDeadlineMs = Number.isFinite(deadlineMs) && deadlineMs > 0 ? deadlineMs : 5_000;
  let timeout = null;
  const deadline = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new IngestError('ingest_deadline_exceeded', 'Ingest execution deadline exceeded.', { statusCode: 503 }));
    }, boundedDeadlineMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}

async function readBody(request) {
  const contentLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    request.resume();
    throw new IngestError('body_too_large', 'Request body exceeds 1 MiB.', { statusCode: 413 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      request.resume();
      throw new IngestError('body_too_large', 'Request body exceeds 1 MiB.', { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendError(response, error) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  if (error instanceof ContractError || error instanceof IngestError) {
    const body = { ok: false, error: error.code };
    if (error instanceof ContractError && error.path) body.path = error.path;
    return sendJson(response, error.statusCode, body, error.statusCode === 413 ? { Connection: 'close' } : {});
  }
  return sendJson(response, 500, { ok: false, error: 'internal_error' });
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  if (response.writableEnded) return;
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(payload);
}
