import crypto from 'node:crypto';
import http from 'node:http';

import { IngestError } from './auth.mjs';
import { ContractError, validateObservationBatch } from './contracts.mjs';

const MAX_BODY_BYTES = 1_048_576;
const MAX_MORNING_BRIEF_BODY_BYTES = 32 * 1_024 * 1_024;
const INGEST_PATH = '/api/v1/observations/batch';
const VIEWPORT_PATH = '/api/v1/cybermap/viewport';
const PAPER_STATE_PATH = '/api/v1/paper/state';
const MORNING_BRIEFS_PATH = '/api/v1/morning-briefs';
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
  'initial_allocation_at', 'positions', 'realized_pnl', 'fees_paid', 'spread_costs', 'slippage_costs', 'market_impact_costs',
  'latency_costs', 'transaction_costs', 'turnover_notional', 'equity', 'previous_equity', 'high_water_mark', 'max_drawdown_pct',
  'last_trade_at', 'last_decision_at', 'status', 'postmortem_required', 'crashed_at', 'crash_reason', 'created_at', 'updated_at',
]);
const PAPER_BOOK_COST_KEYS = new Set(['fees_paid', 'spread_costs', 'slippage_costs', 'market_impact_costs', 'latency_costs', 'transaction_costs', 'turnover_notional']);
const PAPER_BOOK_V2_KEYS = new Set([...PAPER_BOOK_KEYS].filter((key) => !PAPER_BOOK_COST_KEYS.has(key)));
const PAPER_PROFILE_KEYS = new Set(['target_gross_fraction', 'max_position_fraction', 'target_position_count', 'minimum_order_notional']);
const PAPER_POSITION_KEYS = new Set([
  'position_id', 'instrument_ref', 'instrument_type', 'symbol', 'title', 'quantity', 'entry_price', 'mark_price',
  'previous_mark_price', 'cost_basis', 'market_value', 'mark_status', 'source_id', 'source_url', 'opened_at', 'updated_at',
]);
const PAPER_SUMMARY_KEYS = new Set([
  'book_id', 'display_name', 'line_id', 'line_display_name', 'strategy_id', 'strategy_display_name', 'aggression_profile',
  'starting_balance', 'cash_balance', 'realized_pnl', 'fees_paid', 'spread_costs', 'slippage_costs', 'market_impact_costs',
  'latency_costs', 'transaction_costs', 'turnover_notional', 'unrealized_pnl', 'gross_paper_exposure', 'equity', 'daily_pnl',
  'daily_pnl_pct', 'cumulative_pnl', 'cumulative_pnl_pct', 'drawdown_pct', 'max_drawdown_pct', 'open_position_count',
  'stale_open_marks', 'postmortem_required', 'crashed_at', 'status',
]);
const PAPER_SUMMARY_V2_KEYS = new Set([...PAPER_SUMMARY_KEYS].filter((key) => !PAPER_BOOK_COST_KEYS.has(key)));
const PAPER_ACTION_KEYS = new Set([
  'candidate_id', 'decision_id', 'idempotency_key', 'book_id', 'action', 'status', 'instrument_ref', 'instrument_type',
  'symbol', 'paper_size', 'mark_price', 'thesis', 'risk_policy_checks', 'risk_policy_passed', 'paper_only',
  'autonomous_execution', 'human_review_required', 'review_required', 'generated_at', 'source_ref', 'source_url',
]);
const PAPER_FILL_KEYS = new Set([
  'event_id', 'decision_id', 'idempotency_key', 'book_id', 'event_type', 'action', 'instrument_ref', 'quantity',
  'mark_price', 'paper_size', 'realized_pnl', 'cash_before', 'cash_after', 'position_quantity_before',
  'position_quantity_after', 'generated_at', 'paper_only', 'autonomous_execution', 'cost_model_version',
  'cost_assumption_source', 'reference_price', 'execution_price', 'gross_notional', 'fee_amount', 'spread_cost',
  'slippage_cost', 'market_impact_cost', 'latency_cost', 'total_transaction_cost',
]);
const PAPER_FILL_COST_KEYS = new Set([
  'cost_model_version', 'cost_assumption_source', 'reference_price', 'execution_price', 'gross_notional', 'fee_amount',
  'spread_cost', 'slippage_cost', 'market_impact_cost', 'latency_cost', 'total_transaction_cost',
]);
const PAPER_FILL_V2_KEYS = new Set([...PAPER_FILL_KEYS].filter((key) => !PAPER_FILL_COST_KEYS.has(key)));
const PAPER_CRASH_KEYS = new Set(['event_id', 'idempotency_key', 'book_id', 'event_type', 'equity', 'generated_at', 'paper_only', 'postmortem_required']);
const PAPER_MARK_KEYS = new Set(['event_id', 'idempotency_key', 'event_type', 'generated_at', 'paper_only', ...PAPER_SUMMARY_KEYS]);
const PAPER_MARK_V2_KEYS = new Set(['event_id', 'idempotency_key', 'event_type', 'generated_at', 'paper_only', ...PAPER_SUMMARY_V2_KEYS]);
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
const PAPER_ACTION_VALUES = new Set(['PAPER_BUY', 'PAPER_SELL', 'WATCH', 'AVOID', 'POSTMORTEM_REQUIRED']);
const PAPER_TOKEN_RE = /^[A-Za-z0-9._~-]{32,256}$/;
const MORNING_BRIEF_TOKEN_RE = /^[A-Za-z0-9._~-]{32,256}$/;
const MORNING_BRIEF_RUN_ID_RE = /^[a-z0-9][a-z0-9-]{2,120}$/;
const MORNING_BRIEF_ARTIFACT_ID_RE = /^[a-z0-9][a-z0-9-]{1,120}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
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
      if (url.pathname === MORNING_BRIEFS_PATH || url.pathname.startsWith(`${MORNING_BRIEFS_PATH}/`)) {
        requireMorningBriefToken(request);
        return await handleMorningBriefRequest(request, response, url, { store });
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
  const state = validatePaperState(parsed, now(), { allowLegacyV2: false });
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

async function handleMorningBriefRequest(request, response, url, { store }) {
  if (typeof store.putMorningBrief !== 'function' || typeof store.listMorningBriefs !== 'function'
      || typeof store.getMorningBrief !== 'function' || typeof store.getMorningBriefArtifact !== 'function') {
    throw new IngestError('morning_brief_unavailable', 'Morning brief archive is not available.', { statusCode: 503 });
  }
  if (request.method === 'POST' && url.pathname === MORNING_BRIEFS_PATH) {
    return handleMorningBriefWrite(request, response, { store });
  }
  if (request.method === 'GET' && url.pathname === MORNING_BRIEFS_PATH) {
    const requested = Number.parseInt(url.searchParams.get('limit') || '30', 10);
    const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, requested)) : 30;
    return sendJson(response, 200, { ok: true, runs: await store.listMorningBriefs({ limit }) });
  }
  const artifactMatch = url.pathname.match(/^\/api\/v1\/morning-briefs\/([a-z0-9][a-z0-9-]{2,120})\/artifacts\/([a-z0-9][a-z0-9-]{1,120})$/);
  if ((request.method === 'GET' || request.method === 'HEAD') && artifactMatch) {
    const artifact = await store.getMorningBriefArtifact(artifactMatch[1], artifactMatch[2]);
    if (!artifact) throw new IngestError('morning_brief_artifact_not_found', 'Morning brief artifact not found.', { statusCode: 404 });
    if (!SHA256_RE.test(artifact.sha256) || sha256Buffer(artifact.content) !== artifact.sha256) {
      throw new IngestError('morning_brief_artifact_corrupt', 'Stored morning brief artifact failed integrity validation.', { statusCode: 503 });
    }
    const artifactHeaders = {
      'Cache-Control': 'private, no-store',
      'X-Blue-Swallow-Artifact-SHA256': artifact.sha256,
    };
    if (request.method === 'HEAD') {
      response.writeHead(200, {
        'Content-Type': artifact.media_type,
        'Content-Length': artifact.content.length,
        'X-Content-Type-Options': 'nosniff',
        ...artifactHeaders,
      });
      return response.end();
    }
    return sendBinary(response, 200, artifact.content, artifact.media_type, artifactHeaders);
  }
  const runMatch = url.pathname.match(/^\/api\/v1\/morning-briefs\/([a-z0-9][a-z0-9-]{2,120})$/);
  if (request.method === 'GET' && runMatch) {
    const brief = await store.getMorningBrief(runMatch[1]);
    if (!brief) throw new IngestError('morning_brief_not_found', 'Morning brief not found.', { statusCode: 404 });
    return sendJson(response, 200, { ok: true, brief });
  }
  request.resume();
  return sendJson(response, 404, { ok: false, error: 'not_found' });
}

async function handleMorningBriefWrite(request, response, { store }) {
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
    parsed = JSON.parse(await readBody(request, MAX_MORNING_BRIEF_BODY_BYTES));
  } catch (error) {
    if (error instanceof IngestError) throw error;
    throw new IngestError('invalid_json', 'Malformed JSON.', { statusCode: 400 });
  }
  const packet = validateMorningBrief(parsed);
  const result = await store.putMorningBrief({ idempotencyKey, package: packet });
  return sendJson(response, result.statusCode, { ok: true, replayed: result.replayed, brief: result.brief }, {
    'Idempotent-Replayed': String(result.replayed),
  });
}

export function validateMorningBrief(value) {
  if (!isPlainObject(value)
      || value.schema_version !== 'bss.morning_brief.package.v1'
      || !MORNING_BRIEF_RUN_ID_RE.test(value.run_id || '')
      || !RFC3339_RE.test(value.generated_at || '')
      || !SHA256_RE.test(value.canonical_state_hash || '')
      || !SHA256_RE.test(value.package_sha256 || '')
      || typeof value.summary !== 'string' || value.summary.length > 8_000
      || !Array.isArray(value.artifacts) || value.artifacts.length < 1 || value.artifacts.length > 64) {
    throw new IngestError('invalid_morning_brief', 'Morning brief envelope is invalid.', { statusCode: 422 });
  }
  const ids = new Set();
  let totalBytes = 0;
  const artifacts = value.artifacts.map((artifact) => {
    if (!isPlainObject(artifact)
        || !MORNING_BRIEF_ARTIFACT_ID_RE.test(artifact.artifact_id || '')
        || !/^[-\w.+/;= ]{3,160}$/.test(artifact.media_type || '')
        || !SHA256_RE.test(artifact.sha256 || '')
        || typeof artifact.content_base64 !== 'string'
        || !ids.add(artifact.artifact_id)) {
      throw new IngestError('invalid_morning_brief', 'Morning brief artifact metadata is invalid.', { statusCode: 422 });
    }
    let content;
    try {
      content = Buffer.from(artifact.content_base64, 'base64');
    } catch {
      throw new IngestError('invalid_morning_brief', 'Morning brief artifact encoding is invalid.', { statusCode: 422 });
    }
    if (!content.length || content.length > 8 * 1_024 * 1_024 || sha256Buffer(content) !== artifact.sha256) {
      throw new IngestError('invalid_morning_brief', 'Morning brief artifact content failed integrity validation.', { statusCode: 422 });
    }
    totalBytes += content.length;
    return { artifact_id: artifact.artifact_id, media_type: artifact.media_type, sha256: artifact.sha256, content };
  });
  if (totalBytes > 24 * 1_024 * 1_024) {
    throw new IngestError('invalid_morning_brief', 'Morning brief package exceeds the archive limit.', { statusCode: 422 });
  }
  const expectedPackageSha256 = sha256Buffer(canonicalJson({
    schema_version: value.schema_version,
    run_id: value.run_id,
    generated_at: value.generated_at,
    canonical_state_hash: value.canonical_state_hash,
    summary: value.summary,
    artifacts: artifacts.map(({ artifact_id, media_type, sha256 }) => ({ artifact_id, media_type, sha256 })),
  }));
  if (value.package_sha256 !== expectedPackageSha256) {
    throw new IngestError('invalid_morning_brief', 'Morning brief package hash failed integrity validation.', { statusCode: 422 });
  }
  return {
    schema_version: value.schema_version,
    run_id: value.run_id,
    generated_at: value.generated_at,
    canonical_state_hash: value.canonical_state_hash,
    package_sha256: value.package_sha256,
    summary: value.summary,
    artifacts,
  };
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validatePaperState(value, nowMs, { allowLegacyV2 = true } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IngestError('invalid_paper_state', 'Paper state must be an object.', { statusCode: 400 });
  }
  const generatedAt = timestampMs(value.generated_at);
  const hasExecutionCosts = value.schema_version === 'bss.paper_state.v3';
  if (!hasOnlyKeys(value, PAPER_STATE_KEYS)
      || !(hasExecutionCosts || (allowLegacyV2 && value.schema_version === 'bss.paper_state.v2'))
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
        || !hasOnlyKeys(book, hasExecutionCosts ? PAPER_BOOK_KEYS : PAPER_BOOK_V2_KEYS)
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
        || (hasExecutionCosts && !validAggregateCosts(book))
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
        && hasOnlyKeys(summary, hasExecutionCosts ? PAPER_SUMMARY_KEYS : PAPER_SUMMARY_V2_KEYS)
        && validatePaperSummary(summary, hasExecutionCosts, nowMs))
      || !Array.isArray(actions)
      || actions.length > MAX_PAPER_ACTIONS
      || !actions.every((action) => isPlainObject(action)
        && hasOnlyKeys(action, PAPER_ACTION_KEYS)
        && PAPER_ACTION_VALUES.has(action.action)
        && ['candidate_id', 'decision_id', 'idempotency_key'].every((field) => typeof action[field] === 'string' && action[field].length > 0 && action[field].length <= 200)
        && action.paper_only === true
        && PAPER_BOOK_IDS.includes(action.book_id)
        && validTimestampAt(action.generated_at, nowMs)
        && typeof action.autonomous_execution === 'boolean'
        && typeof action.risk_policy_passed === 'boolean'
        && typeof action.human_review_required === 'boolean'
        && typeof action.review_required === 'boolean'
        && Array.isArray(action.risk_policy_checks)
        && action.risk_policy_checks.length <= 32
        && action.risk_policy_checks.every((check) => typeof check === 'string' && check.length <= 200)
        && nullableHttpsUrl(action.source_url)
        && (action.mark_price === null || finiteNumber(action.mark_price))
        && finiteNumber(action.paper_size) && action.paper_size >= 0
        && (!['PAPER_BUY', 'PAPER_SELL'].includes(action.action) || action.autonomous_execution === true))
      || !['candidate_id', 'decision_id', 'idempotency_key'].every((field) => hasUniqueStringField(actions, field))
      || !Array.isArray(events)
      || events.length > MAX_PAPER_EVENTS
      || !events.every((event) => validatePaperEvent(event, nowMs, hasExecutionCosts))
      || !['event_id', 'idempotency_key'].every((field) => hasUniqueStringField(events, field))
      || !Array.isArray(recent)
      || recent.length > 64
      || !recent.every((event) => validatePaperEvent(event, nowMs, hasExecutionCosts) && event.event_type === 'paper_fill')
      || !['event_id', 'idempotency_key'].every((field) => hasUniqueStringField(recent, field))
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
  return isPlainObject(value) && Object.keys(value).length === allowed.size && Object.keys(value).every((key) => allowed.has(key));
}

function hasUniqueStringField(records, field) {
  const values = records.map((record) => record[field]);
  return values.every((value) => typeof value === 'string' && value.length > 0 && value.length <= 200)
    && new Set(values).size === values.length;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validAggregateCosts(value) {
  const components = ['fees_paid', 'spread_costs', 'slippage_costs', 'market_impact_costs', 'latency_costs'];
  return [...components, 'transaction_costs', 'turnover_notional'].every((field) => finiteNumber(value[field]) && value[field] >= 0)
    && Math.abs(value.transaction_costs - components.reduce((total, field) => total + value[field], 0)) <= 0.001;
}

function validFillCosts(event) {
  const components = ['fee_amount', 'spread_cost', 'slippage_cost', 'market_impact_cost', 'latency_cost'];
  return event.cost_model_version === 'bss.execution_costs.v1'
    && event.cost_assumption_source === 'bss_tradesight_research_v1'
    && [...components, 'total_transaction_cost', 'reference_price', 'execution_price', 'gross_notional'].every((field) => finiteNumber(event[field]) && event[field] >= 0)
    && Math.abs(event.total_transaction_cost - components.reduce((total, field) => total + event[field], 0)) <= 0.001;
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

function validatePaperSummary(summary, hasExecutionCosts, nowMs, { checkKeys = true } = {}) {
  if (!isPlainObject(summary)
      || (checkKeys && !hasOnlyKeys(summary, hasExecutionCosts ? PAPER_SUMMARY_KEYS : PAPER_SUMMARY_V2_KEYS))
      || summary.book_id !== `${summary.line_id}__${summary.strategy_id}`
      || !PAPER_BOOK_IDS.includes(summary.book_id)
      || !PAPER_LINE_IDS.includes(summary.line_id)
      || !PAPER_STRATEGY_IDS.includes(summary.strategy_id)
      || !['book_id', 'display_name', 'line_id', 'line_display_name', 'strategy_id', 'strategy_display_name', 'status'].every((field) => typeof summary[field] === 'string' && summary[field].length > 0)
      || !validAggressionProfile(summary.aggression_profile)
      || !nullableTimestamp(summary.crashed_at, nowMs)
      || typeof summary.postmortem_required !== 'boolean') return false;
  const baseNumericFields = [
    'starting_balance', 'cash_balance', 'realized_pnl', 'unrealized_pnl', 'gross_paper_exposure', 'equity', 'daily_pnl',
    'daily_pnl_pct', 'cumulative_pnl', 'cumulative_pnl_pct', 'drawdown_pct', 'max_drawdown_pct', 'open_position_count', 'stale_open_marks',
  ];
  const numericFields = hasExecutionCosts
    ? [...baseNumericFields, 'fees_paid', 'spread_costs', 'slippage_costs', 'market_impact_costs', 'latency_costs', 'transaction_costs', 'turnover_notional']
    : baseNumericFields;
  if (!numericFields.every((field) => finiteNumber(summary[field]))) return false;
  if (!['starting_balance', 'cash_balance', 'gross_paper_exposure', 'equity', 'open_position_count', 'stale_open_marks'].every((field) => summary[field] >= 0)) return false;
  return !hasExecutionCosts || validAggregateCosts(summary);
}

function validatePaperPosition(position, nowMs) {
  if (!isPlainObject(position)
      || !hasOnlyKeys(position, PAPER_POSITION_KEYS)
      || typeof position.position_id !== 'string' || position.position_id.length === 0
      || typeof position.instrument_ref !== 'string' || position.instrument_ref.length === 0
      || typeof position.symbol !== 'string' || position.symbol.length === 0
      || typeof position.title !== 'string' || position.title.length === 0
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

function validatePaperEvent(event, nowMs, hasExecutionCosts) {
  if (!isPlainObject(event)
      || event.paper_only !== true
      || !PAPER_BOOK_IDS.includes(event.book_id)
      || typeof event.event_id !== 'string'
      || event.event_id.length === 0
      || !validTimestampAt(event.generated_at, nowMs)) return false;
  if (event.event_type === 'paper_fill') {
    const baseValid = hasOnlyKeys(event, hasExecutionCosts ? PAPER_FILL_KEYS : PAPER_FILL_V2_KEYS)
      && ['PAPER_BUY', 'PAPER_SELL'].includes(event.action)
      && event.autonomous_execution === true
      && ['quantity', 'paper_size', 'realized_pnl', 'mark_price', 'cash_before', 'cash_after', 'position_quantity_before', 'position_quantity_after'].every((field) => finiteNumber(event[field]) && (field === 'realized_pnl' || event[field] >= 0));
    return baseValid && (!hasExecutionCosts || validFillCosts(event));
  }
  if (event.event_type === 'mark') {
    return hasOnlyKeys(event, hasExecutionCosts ? PAPER_MARK_KEYS : PAPER_MARK_V2_KEYS)
      && validatePaperSummary(event, hasExecutionCosts, nowMs, { checkKeys: false });
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
  if (!PAPER_TOKEN_RE.test(expected)) {
    throw new IngestError('paper_state_token_unconfigured', 'Paper state token is not configured.', { statusCode: 503 });
  }
  const actual = singleHeader(request, 'x-blue-swallow-paper-state-token');
  if (!safeEqualString(actual, expected)) {
    throw new IngestError('forbidden', 'Forbidden.', { statusCode: 403 });
  }
}

function requireMorningBriefToken(request) {
  const expected = String(process.env.BSS_MORNING_BRIEF_TOKEN || '').trim();
  if (!MORNING_BRIEF_TOKEN_RE.test(expected)) {
    throw new IngestError('morning_brief_token_unconfigured', 'Morning brief token is not configured.', { statusCode: 503 });
  }
  const actual = singleHeader(request, 'x-blue-swallow-morning-brief-token');
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

async function readBody(request, maximumBytes = MAX_BODY_BYTES) {
  const contentLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    request.resume();
    throw new IngestError('body_too_large', 'Request body exceeds the configured limit.', { statusCode: 413 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      request.resume();
      throw new IngestError('body_too_large', 'Request body exceeds the configured limit.', { statusCode: 413 });
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

function sendBinary(response, statusCode, payload, contentType, extraHeaders = {}) {
  if (response.writableEnded) return;
  const body = Buffer.from(payload);
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(body);
}
