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
