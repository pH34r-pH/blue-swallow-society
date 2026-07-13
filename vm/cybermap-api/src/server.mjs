import crypto from 'node:crypto';
import http from 'node:http';

import { IngestError } from './auth.mjs';
import { ContractError, validateObservationBatch } from './contracts.mjs';

const MAX_BODY_BYTES = 1_048_576;
const INGEST_PATH = '/api/v1/observations/batch';
const VIEWPORT_PATH = '/api/v1/cybermap/viewport';
const PAPER_STATE_PATH = '/api/v1/paper/state';
const PAPER_BOOK_IDS = Object.freeze(['prediction_markets', 'crypto', 'equity_watch', 'local_event_watch', 'ai_cyber_watch']);

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
        if (request.method === 'GET') return await handlePaperStateRead(response, { store });
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
  if (!idempotencyKey || idempotencyKey.length > 200) {
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

async function handlePaperStateRead(response, { store }) {
  if (typeof store.getPaperState !== 'function') {
    throw new IngestError('paper_state_unavailable', 'Paper state persistence is not available.', { statusCode: 503 });
  }
  const current = await store.getPaperState();
  if (!current) throw new IngestError('paper_state_not_found', 'No paper state has been synchronized.', { statusCode: 404 });
  return sendJson(response, 200, {
    ok: true,
    source: 'mosaic-murmurs-paper-engine',
    idempotency_key: current.idempotencyKey,
    updated_at: current.appliedAt,
    state: current.state,
  });
}

function validatePaperState(value, nowMs) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IngestError('invalid_paper_state', 'Paper state must be an object.', { statusCode: 400 });
  }
  const generatedAt = Date.parse(value.generated_at);
  if (value.schema_version !== 'bss.paper_state.v1'
      || value.paper_only !== true
      || value.autonomous_execution !== true
      || !Number.isFinite(generatedAt)
      || generatedAt > nowMs + 300_000) {
    throw new IngestError('invalid_paper_state', 'Paper state envelope is invalid.', { statusCode: 400 });
  }
  const ledger = value.ledger;
  if (!ledger || ledger.schema_version !== 3 || ledger.paper_only !== true || !Array.isArray(ledger.books)) {
    throw new IngestError('invalid_paper_state', 'Canonical paper ledger is required.', { statusCode: 400 });
  }
  const bookIds = ledger.books.map((book) => book?.book_id);
  if (bookIds.length !== PAPER_BOOK_IDS.length || PAPER_BOOK_IDS.some((bookId) => !bookIds.includes(bookId))) {
    throw new IngestError('invalid_paper_state', 'All five canonical paper books are required.', { statusCode: 400 });
  }
  for (const book of ledger.books) {
    if (Number(book?.starting_balance) !== 2000
        || !Number.isFinite(Number(book?.cash_balance))
        || Number(book.cash_balance) < 0
        || !Array.isArray(book?.positions)) {
      throw new IngestError('invalid_paper_state', 'Paper book accounting is invalid.', { statusCode: 400 });
    }
  }
  if (!Array.isArray(value.paper_books) || !Array.isArray(value.paper_action_candidates)) {
    throw new IngestError('invalid_paper_state', 'Paper summaries and actions must be arrays.', { statusCode: 400 });
  }
  if (value.paper_action_candidates.some((candidate) => candidate?.paper_only !== true)) {
    throw new IngestError('invalid_paper_state', 'Every action must be paper-only.', { statusCode: 400 });
  }
  return structuredClone(value);
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
