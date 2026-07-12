import http from 'node:http';

import { IngestError } from './auth.mjs';
import { ContractError, validateObservationBatch } from './contracts.mjs';

const MAX_BODY_BYTES = 1_048_576;
const INGEST_PATH = '/api/v1/observations/batch';

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
      if (request.method === 'GET' && url.pathname === '/readyz') {
        const readiness = await store.ready();
        return sendJson(response, readiness.ok ? 200 : 503, readiness);
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
