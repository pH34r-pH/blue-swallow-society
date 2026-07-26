import { gunzipSync } from 'node:zlib';

import { materializeDeflockReports } from './deflock-materializer.mjs';
import { DEFLOCK_DATA_URL, DEFLOCK_SOURCE_ID, extractDeflockReportPoints } from './sources/deflock-osm-alpr-reports.mjs';

export { DEFLOCK_DATA_URL, DEFLOCK_SOURCE_ID };

const DEFAULT_BACKOFF_MS = Object.freeze({
  rate_limited: 60_000,
  failed: 30_000,
});

/**
 * Run one source acquisition attempt through injected worker-side dependencies.
 * This module has no scheduler, provider configuration, or read-path integration.
 */
export async function runGreenfeedWorker({
  source,
  fetch,
  normalize,
  writeSnapshots,
  recordRun,
  logger = null,
  now = () => new Date(),
  backoffMs = DEFAULT_BACKOFF_MS,
} = {}) {
  const startedAt = toIsoTimestamp(now());

  if (source?.terms_reviewed_at == null) {
    return persistRun(recordRun, createRun({
      source,
      startedAt,
      outcome: 'disabled',
      responseClass: 'terms_unreviewed',
      errorCode: 'terms_unreviewed',
    }));
  }

  if (source?.enabled !== true) {
    return persistRun(recordRun, createRun({
      source,
      startedAt,
      outcome: 'disabled',
      responseClass: 'source_disabled',
      errorCode: 'source_disabled',
    }));
  }

  let run;
  try {
    const response = await fetch({ source });
    const responseClass = responseClassFor(response?.status);

    if (response?.status === 429) {
      run = createRun({
        source,
        startedAt,
        outcome: 'rate_limited',
        responseClass,
        nextRetryAt: retryAt(startedAt, backoffMs?.rate_limited),
        errorCode: 'rate_limited',
      });
    } else if (!isSuccessfulResponse(response)) {
      run = createRun({
        source,
        startedAt,
        outcome: 'failed',
        responseClass,
        nextRetryAt: retryAt(startedAt, backoffMs?.failed),
        errorCode: 'http_error',
      });
    } else {
      const payload = await response.json();
      const snapshots = await normalize(payload, { source });
      if (!Array.isArray(snapshots)) {
        throw invalidPayloadError();
      }

      if (snapshots.length === 0) {
        run = createRun({ source, startedAt, outcome: 'empty', responseClass });
      } else {
        const written = await writeSnapshots({ source, snapshots });
        run = createRun({
          source,
          startedAt,
          outcome: 'success',
          responseClass,
          fetchedCount: snapshots.length,
          acceptedCount: boundedCount(written?.accepted_count),
          duplicateCount: boundedCount(written?.duplicate_count),
          rejectedCount: boundedCount(written?.rejected_count),
        });
      }
    }
  } catch (error) {
    const failure = classifyFailure(error);
    run = createRun({
      source,
      startedAt,
      outcome: 'failed',
      responseClass: failure.responseClass,
      nextRetryAt: retryAt(startedAt, backoffMs?.failed),
      errorCode: failure.errorCode,
    });
    logFailure(logger, run);
  }

  return persistRun(recordRun, run);
}

function createRun({
  source,
  startedAt,
  outcome,
  responseClass,
  fetchedCount = 0,
  acceptedCount = 0,
  duplicateCount = 0,
  rejectedCount = 0,
  nextRetryAt = null,
  errorCode = null,
}) {
  return Object.freeze({
    source_id: source?.id,
    started_at: startedAt,
    completed_at: startedAt,
    outcome,
    response_class: responseClass,
    fetched_count: boundedCount(fetchedCount),
    accepted_count: boundedCount(acceptedCount),
    duplicate_count: boundedCount(duplicateCount),
    rejected_count: boundedCount(rejectedCount),
    next_retry_at: nextRetryAt,
    error_code: errorCode,
  });
}

async function persistRun(recordRun, run) {
  await recordRun(run);
  return structuredClone(run);
}

function isSuccessfulResponse(response) {
  return response?.ok === true && Number.isInteger(response.status) && response.status >= 200 && response.status < 300;
}

function responseClassFor(status) {
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? `http_${status}`
    : 'transport_error';
}

function classifyFailure(error) {
  if (error?.name === 'AbortError' || error?.code === 'timeout') {
    return { responseClass: 'timeout', errorCode: 'timeout' };
  }
  if (error?.code === 'invalid_payload') {
    return { responseClass: 'invalid_payload', errorCode: 'invalid_payload' };
  }
  return { responseClass: 'transport_error', errorCode: 'transport_error' };
}

function invalidPayloadError() {
  const error = new TypeError('Normalized snapshots must be an array.');
  error.code = 'invalid_payload';
  return error;
}

function retryAt(startedAt, delayMs) {
  const delay = boundedDelay(delayMs);
  return delay === 0 ? startedAt : new Date(new Date(startedAt).getTime() + delay).toISOString();
}

function boundedDelay(value) {
  const delay = Number(value);
  return Number.isFinite(delay) && delay >= 0 ? Math.min(Math.trunc(delay), 86_400_000) : 0;
}

function boundedCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? Math.min(count, Number.MAX_SAFE_INTEGER) : 0;
}

function toIsoTimestamp(value) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError('now must produce a valid timestamp.');
  return timestamp.toISOString();
}

function logFailure(logger, run) {
  try {
    logger?.error?.({
      event: 'greenfeed_worker_failed',
      source_id: run.source_id,
      response_class: run.response_class,
      error_code: run.error_code,
    });
  } catch {
    // Diagnostic sinks must not alter worker state or source-run receipts.
  }
}

const DEFLOCK_MAX_BYTES = 35 * 1024 * 1024;
const DEFLOCK_MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
const DEFLOCK_DEADLINE_MS = 45_000;

export async function runDeflockSourceJob({ source, fetchImpl = globalThis.fetch, store, now = () => new Date(), deadlineMs = DEFLOCK_DEADLINE_MS } = {}) {
  const sourceKey = source?.source_key ?? source?.id;
  if (!source || sourceKey !== DEFLOCK_SOURCE_ID) throw new TypeError('A DeFlock source entry is required.');
  if (!store || typeof store.recordDeflockSourceFetchRun !== 'function' || typeof store.replaceDeflockSourceCells !== 'function') {
    throw new TypeError('A DeFlock source-run/cell store is required.');
  }
  const startedAt = deflockIsoNow(now);
  if (source.enabled !== true) {
    const sourceRun = deflockRun({ startedAt, outcome: 'disabled' });
    await store.recordDeflockSourceFetchRun(sourceRun);
    return { outcome: 'disabled', source_id: DEFLOCK_SOURCE_ID };
  }

  let timeout = null;
  const controller = new AbortController();
  try {
    timeout = setTimeout(() => controller.abort(), deadlineMs);
    const response = await fetchImpl(DEFLOCK_DATA_URL, {
      method: 'GET',
      headers: { Accept: 'application/geo+json, application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response?.ok) return deflockRecordFailure(store, deflockRun({ startedAt, outcome: response?.status === 429 ? 'rate_limited' : 'http_error', http_status: Number(response?.status) || null }));
    if (deflockContentLength(response.headers?.get?.('content-length')) > DEFLOCK_MAX_BYTES) {
      return deflockRecordFailure(store, deflockRun({ startedAt, outcome: 'payload_too_large', http_status: response.status }));
    }
    const compressedBytes = Buffer.from(await response.arrayBuffer());
    if (compressedBytes.byteLength > DEFLOCK_MAX_BYTES) {
      return deflockRecordFailure(store, deflockRun({ startedAt, outcome: 'payload_too_large', http_status: response.status }));
    }
    let payload;
    try {
      payload = decodeDeflockPayload(compressedBytes);
    } catch (error) {
      return deflockRecordFailure(store, deflockRun({
        startedAt,
        outcome: error?.code === 'payload_too_large' ? 'payload_too_large' : 'invalid_payload',
        http_status: response.status,
      }));
    }
    let reports;
    try {
      reports = extractDeflockReportPoints(payload);
    } catch {
      return deflockRecordFailure(store, deflockRun({ startedAt, outcome: 'invalid_payload', http_status: response.status }));
    }
    const observedAt = deflockIsoNow(now);
    const cells = materializeDeflockReports(reports, { observedAt });
    await store.replaceDeflockSourceCells({ source_id: DEFLOCK_SOURCE_ID, observed_at: observedAt, cells });
    const success = deflockRun({
      startedAt, outcome: 'success', http_status: response.status, etag: deflockEtag(response.headers?.get?.('etag')),
      item_count: reports.length, normalized_count: reports.length, cell_count: cells.length, completed_at: deflockIsoNow(now),
    });
    await store.recordDeflockSourceFetchRun(success);
    return { outcome: 'success', source_id: DEFLOCK_SOURCE_ID, item_count: reports.length, cell_count: cells.length };
  } catch (error) {
    return deflockRecordFailure(store, deflockRun({ startedAt, outcome: error?.name === 'AbortError' ? 'timeout' : 'network_error' }));
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function deflockRun({ startedAt, outcome, http_status = null, etag = null, item_count = 0, normalized_count = 0, cell_count = 0, completed_at = startedAt }) {
  return { source_id: DEFLOCK_SOURCE_ID, outcome, started_at: startedAt, completed_at, http_status, etag, item_count, normalized_count, cell_count };
}

async function deflockRecordFailure(store, sourceRun) {
  await store.recordDeflockSourceFetchRun(sourceRun);
  return { outcome: sourceRun.outcome, source_id: DEFLOCK_SOURCE_ID };
}

function decodeDeflockPayload(bytes) {
  const isGzip = bytes?.[0] === 0x1f && bytes?.[1] === 0x8b;
  let decoded;
  try {
    decoded = isGzip ? gunzipSync(bytes, { maxOutputLength: DEFLOCK_MAX_DECOMPRESSED_BYTES }) : bytes;
  } catch (cause) {
    const error = new Error('The DeFlock source payload could not be decompressed.');
    error.code = cause?.code === 'ERR_BUFFER_TOO_LARGE' ? 'payload_too_large' : 'invalid_payload';
    throw error;
  }
  if (decoded.byteLength > DEFLOCK_MAX_DECOMPRESSED_BYTES) {
    const error = new Error('The decompressed DeFlock source payload exceeds the configured bound.');
    error.code = 'payload_too_large';
    throw error;
  }
  return JSON.parse(decoded.toString('utf8'));
}

function deflockContentLength(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function deflockEtag(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : null;
}

function deflockIsoNow(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('now must return a valid date');
  return date.toISOString();
}
