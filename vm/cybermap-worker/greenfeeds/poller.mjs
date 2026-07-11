import { createHash } from 'node:crypto';
import { normalizeObservationBatch, storeObservationBatch } from '../../cybermap-api/observation-ingest.mjs';
import { materializeAffectedCybermapCells } from '../cell-materialization.mjs';
import {
  loadSeedGreenfeedCatalog,
  markGreenfeedSourceChecked,
  normalizeGreenfeedSource,
  rankGreenfeedSourcesForClaim,
  upsertGreenfeedSources,
} from './catalog.mjs';

const DEFAULT_GREENFEED_CLIENT_ID = 'greenfeed-worker';
const DEFAULT_GREENFEED_USER_AGENT = 'BlueSwallowCybermapGreenfeed/0.1 (+https://blueswallow.co.in; contact: operator)';
const DEFAULT_MATERIALIZATION_LOOKBACK_MS = 5 * 60_000;
const DEFAULT_GREENFEED_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_GREENFEED_MAX_RESPONSE_BYTES = 256_000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableJsonValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
  }
  return value;
}

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableJsonValue(value ?? null)), 'utf8').digest('hex')}`;
}

function isoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function minusMs(date, ms) {
  return new Date(date.getTime() - ms).toISOString();
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return Array.isArray(value) ? value.join(', ') : String(value);
  }
  return null;
}

function responseContentType(response) {
  return headerValue(response.headers, 'content-type') || null;
}

function greenfeedFetchError(message, code, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function responseByteLimit(response, maxResponseBytes) {
  const maxBytes = Number(maxResponseBytes);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return DEFAULT_GREENFEED_MAX_RESPONSE_BYTES;
  const contentLength = Number(headerValue(response.headers, 'content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw greenfeedFetchError(`Greenfeed response exceeds ${maxBytes} bytes.`, 'greenfeed_response_too_large', 502);
  }
  return maxBytes;
}

async function boundedResponseText(response, maxResponseBytes) {
  const maxBytes = responseByteLimit(response, maxResponseBytes);
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw greenfeedFetchError(`Greenfeed response exceeds ${maxBytes} bytes.`, 'greenfeed_response_too_large', 502);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => null);
        throw greenfeedFetchError(`Greenfeed response exceeds ${maxBytes} bytes.`, 'greenfeed_response_too_large', 502);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock?.();
  }
}

async function defaultFetchJson(url, options = {}) {
  const {
    fetchTimeoutMs = DEFAULT_GREENFEED_FETCH_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_GREENFEED_MAX_RESPONSE_BYTES,
    signal,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  const timeoutMs = Number(fetchTimeoutMs);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    const body = await boundedResponseText(response, maxResponseBytes);
    let json = null;
    let text = null;
    if (contentType.includes('json')) {
      try {
        json = body ? JSON.parse(body) : null;
      } catch (error) {
        throw greenfeedFetchError(`Greenfeed response JSON parse failed: ${error.message}`, 'greenfeed_invalid_json', 502);
      }
    } else {
      text = body;
    }
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      json,
      text,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw greenfeedFetchError(`Greenfeed fetch timed out after ${timeoutMs} ms.`, 'greenfeed_fetch_timeout', 504);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function candidateTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'string' || value instanceof Date) return isoString(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = candidateTimestamp(item);
      if (found) return found;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const key of ['timestamp', 'time', 'dateTime', 'validTime', 'observed_at', 'observedAt', 't']) {
    const found = isoString(value[key]);
    if (found) return found;
  }
  for (const key of ['properties', 'metadata', 'data', 'observations']) {
    const found = candidateTimestamp(value[key]);
    if (found) return found;
  }
  return null;
}

function freshnessStatus({ observedAt, now, cacheTtlSeconds, fetchOk }) {
  if (!fetchOk) return 'unavailable';
  const observedMs = new Date(observedAt).getTime();
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(observedMs) || Number.isNaN(nowMs)) return 'unknown';
  return nowMs - observedMs > cacheTtlSeconds * 1000 ? 'stale' : 'fresh';
}

function shouldPollSource(source, now) {
  if (!source.enabled) return { poll: false, reason: 'disabled' };
  if (!source.allowed_preload) return { poll: false, reason: 'preload_not_allowed' };
  if (!source.persistent_jack_in_allowed) return { poll: false, reason: 'persistent_jack_in_not_allowed' };
  if (!source.global_lookup_allowed) return { poll: false, reason: 'global_lookup_not_allowed' };
  if (!source.last_checked_at) return { poll: true, reason: 'never_checked' };
  const checkedMs = new Date(source.last_checked_at).getTime();
  if (Number.isNaN(checkedMs)) return { poll: true, reason: 'invalid_last_checked_at' };
  const ageMs = new Date(now).getTime() - checkedMs;
  if (ageMs >= source.cache_ttl_seconds * 1000) return { poll: true, reason: 'ttl_expired' };
  return { poll: false, reason: 'ttl_fresh' };
}

function snapshotPayloadForSource(source, response, { observedAt, checkedAt, now }) {
  const responseHash = sha256Json(response.json ?? response.text ?? null);
  const responseOk = response.ok !== false && Number(response.status || 200) >= 200 && Number(response.status || 200) < 400;
  const rankedAtSource = rankGreenfeedSourcesForClaim({
    lat: source.lat,
    lon: source.lon,
    sources: [source],
    limit: 1,
    now,
  })[0];
  const status = freshnessStatus({
    observedAt,
    now,
    cacheTtlSeconds: source.cache_ttl_seconds,
    fetchOk: responseOk,
  });
  return {
    source_key: source.source_key,
    name: source.name,
    provider: source.provider,
    owner_publisher: source.owner_publisher,
    feed_url: source.feed_url,
    terms_url: source.terms_url,
    cache_ttl_seconds: source.cache_ttl_seconds,
    update_cadence_seconds: source.update_cadence_seconds,
    last_checked_at: checkedAt,
    freshness_status: status,
    uptime_status: responseOk ? source.uptime_status : 'unavailable',
    allowed_preload: source.allowed_preload,
    global_lookup_allowed: source.global_lookup_allowed,
    persistent_jack_in_allowed: source.persistent_jack_in_allowed,
    source_quality_score: source.source_quality_score,
    coordinates: { lat: source.lat, lon: source.lon },
    view: source.view,
    caveats: source.caveats,
    claim_validation_ranking: {
      distance_meters: rankedAtSource?.distance_meters ?? 0,
      bearing_degrees: rankedAtSource?.bearing_degrees ?? 0,
      angle_delta_degrees: rankedAtSource?.angle_delta_degrees ?? null,
      within_declared_fov: rankedAtSource?.within_declared_fov ?? null,
      source_quality_score: source.source_quality_score,
      claim_validation_score: rankedAtSource?.claim_validation_score ?? source.source_quality_score,
    },
    snapshot: {
      http_status: Number(response.status || (responseOk ? 200 : 0)),
      content_type: responseContentType(response),
      response_hash: responseHash,
      observed_at: observedAt,
      checked_at: checkedAt,
      adapter: 'generic-http-json-summary',
    },
  };
}

function buildObservationBatch(source, response, { now, checkedAt, clientId }) {
  const observedAt = candidateTimestamp(response.json) || checkedAt;
  const payload = snapshotPayloadForSource(source, response, { observedAt, checkedAt, now });
  const idempotencyScope = `${observedAt}:${checkedAt}`;
  const idempotencyKey = `greenfeed:${source.source_key}:${idempotencyScope}`;
  return {
    headers: { 'idempotency-key': `greenfeed-batch:${source.source_key}:${idempotencyScope}` },
    body: {
      source_id: source.source_id,
      source_class: source.source_class,
      client_id: clientId,
      provenance: {
        adapter: 'greenfeed-poller',
        source_key: source.source_key,
        source_class: source.source_class,
        provider: source.provider,
        owner_publisher: source.owner_publisher,
        terms_url: source.terms_url,
        terms_summary: source.terms_summary,
        publication_basis: source.provenance.publication_basis,
        no_private_camera_probing: true,
        no_raw_payload_retention: true,
        checked_at: checkedAt,
      },
      observations: [
        {
          source_id: source.source_id,
          source_class: source.source_class,
          external_observation_key: idempotencyKey,
          idempotency_key: idempotencyKey,
          kind: 'greenfeed_snapshot',
          observed_at: observedAt,
          lat: source.lat,
          lon: source.lon,
          confidence: source.source_quality_score,
          pii_status: 'none',
          retention_class: 'summary_only',
          payload,
          provenance: {
            adapter: 'greenfeed-poller',
            source_key: source.source_key,
            source_class: source.source_class,
            provider: source.provider,
            owner_publisher: source.owner_publisher,
            terms_url: source.terms_url,
            terms_summary: source.terms_summary,
            checked_at: checkedAt,
            no_private_camera_probing: true,
            no_raw_payload_retention: true,
          },
        },
      ],
    },
  };
}

function mergePersistedCatalogRow(source, row) {
  if (!row) return source;
  const provenance = isPlainObject(row.provenance) ? row.provenance : {};
  const allowedPreload = row.allowed_preload ?? source.allowed_preload;
  const persistentJackInAllowed = allowedPreload
    ? (provenance.persistent_jack_in_allowed ?? source.persistent_jack_in_allowed)
    : false;
  const mergedProvenance = {
    ...source.provenance,
    ...provenance,
    persistent_jack_in_allowed: persistentJackInAllowed,
  };
  return normalizeGreenfeedSource({
    ...source,
    source_id: row.id ?? row.source_id ?? source.source_id,
    source_class: row.source_class ?? source.source_class,
    source_key: row.source_key ?? source.source_key,
    name: row.name ?? source.name,
    provider: row.provider ?? source.provider,
    owner_publisher: provenance.owner_publisher ?? source.owner_publisher,
    feed_url: row.feed_url ?? source.feed_url,
    terms_url: row.terms_url ?? source.terms_url,
    terms_summary: provenance.terms_summary ?? source.terms_summary,
    authorized_scope_ref: row.authorized_scope_ref ?? source.authorized_scope_ref,
    allowed_preload: allowedPreload,
    persistent_jack_in_allowed: persistentJackInAllowed,
    retains_raw_payload: row.retains_raw_payload ?? source.retains_raw_payload,
    cache_ttl_seconds: row.cache_ttl_seconds ?? source.cache_ttl_seconds,
    update_cadence_seconds: provenance.update_cadence_seconds ?? source.update_cadence_seconds,
    enabled: row.enabled ?? source.enabled,
    last_checked_at: row.last_checked_at ?? source.last_checked_at,
    lat: row.lat ?? source.lat,
    lon: row.lon ?? source.lon,
    footprint: row.footprint ?? source.footprint,
    view: provenance.view ?? source.view,
    freshness_status: provenance.freshness_status ?? source.freshness_status,
    uptime_status: provenance.uptime_status ?? source.uptime_status,
    source_quality_score: provenance.source_quality_score ?? source.source_quality_score,
    caveats: provenance.caveats ?? source.caveats,
    provenance: mergedProvenance,
  });
}

function ingestResultError(stored) {
  if (stored?.body?.ok === true) return null;
  const code = stored?.body?.error?.code || 'greenfeed_ingest_failed';
  const message = stored?.body?.error?.message || 'Greenfeed observation ingest failed.';
  const error = new Error(message);
  error.code = code;
  error.statusCode = stored?.statusCode || 500;
  return error;
}

function materializationNowAfter(baseDate, explicitNow) {
  if (explicitNow) return new Date(baseDate.getTime() + 1);
  const current = new Date();
  return current.getTime() > baseDate.getTime() ? current : new Date(baseDate.getTime() + 1);
}

export async function pollGreenfeeds(pool, options = {}) {
  const {
    sources = null,
    now = new Date(),
    fetchJson = defaultFetchJson,
    userAgent = DEFAULT_GREENFEED_USER_AGENT,
    clientId = DEFAULT_GREENFEED_CLIENT_ID,
    materializeCells = materializeAffectedCybermapCells,
    materializationLookbackMs = DEFAULT_MATERIALIZATION_LOOKBACK_MS,
    materialize = true,
    fetchTimeoutMs = DEFAULT_GREENFEED_FETCH_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_GREENFEED_MAX_RESPONSE_BYTES,
  } = options;
  if (!pool?.query) throw new Error('pool with query(sql, params) is required');
  const explicitNow = Object.prototype.hasOwnProperty.call(options, 'now');
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = nowDate.toISOString();
  const configuredSources = (sources || loadSeedGreenfeedCatalog()).map((source) => normalizeGreenfeedSource(source));
  const upserted = await upsertGreenfeedSources(pool, configuredSources);
  const rowsBySourceKey = new Map((upserted.rows || []).map((row) => [row?.source_key ?? row?.sourceKey, row]));
  const activeSources = configuredSources.map((source) => mergePersistedCatalogRow(source, rowsBySourceKey.get(source.source_key)));

  const result = {
    sourceCount: activeSources.length,
    polledCount: 0,
    skippedCount: 0,
    ingestedObservationCount: 0,
    failures: [],
    receipts: [],
    materialized: null,
  };

  for (const source of activeSources) {
    const due = shouldPollSource(source, nowDate);
    if (!due.poll) {
      result.skippedCount += 1;
      continue;
    }
    try {
      const response = await fetchJson(source.feed_url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/json',
        },
        fetchTimeoutMs,
        maxResponseBytes,
      });
      const batchRequest = buildObservationBatch(source, response, {
        now: nowDate,
        checkedAt: nowIso,
        clientId,
      });
      const batch = normalizeObservationBatch({
        headers: batchRequest.headers,
        body: batchRequest.body,
        identity: {
          tokenId: clientId,
          clientType: 'greenfeed_worker',
          scopes: ['observations:write'],
          sourceIds: [source.source_id],
          sourceClasses: [source.source_class],
        },
        now: nowDate,
      });
      const stored = await storeObservationBatch(pool, batch);
      const ingestError = ingestResultError(stored);
      if (ingestError) throw ingestError;
      await markGreenfeedSourceChecked(pool, source, {
        checkedAt: nowDate,
        status: response.ok === false ? 'fetch_http_error' : 'ok',
        details: {
          http_status: Number(response.status || 200),
          observation_count: stored.body?.receipt?.observation_count || 0,
        },
      });
      result.polledCount += 1;
      result.ingestedObservationCount += stored.body?.receipt?.observation_count || 0;
      result.receipts.push(stored.body?.receipt || null);
    } catch (error) {
      const failure = { source_key: source.source_key, error: error.message };
      if (error.code) failure.code = error.code;
      if (error.statusCode) failure.statusCode = error.statusCode;
      result.failures.push(failure);
      await markGreenfeedSourceChecked(pool, source, {
        checkedAt: nowDate,
        status: 'failed',
        details: { error: error.message, code: error.code || null, status_code: error.statusCode || null },
      }).catch(() => null);
    }
  }

  if (materialize && result.ingestedObservationCount > 0 && materializeCells) {
    const materializationNow = materializationNowAfter(nowDate, explicitNow);
    result.materialized = await materializeCells(pool, {
      since: minusMs(nowDate, materializationLookbackMs),
      before: materializationNow.toISOString(),
      now: materializationNow,
    });
  }

  return result;
}

export const greenfeedPollerDefaults = Object.freeze({
  DEFAULT_GREENFEED_CLIENT_ID,
  DEFAULT_GREENFEED_USER_AGENT,
  DEFAULT_MATERIALIZATION_LOOKBACK_MS,
  DEFAULT_GREENFEED_FETCH_TIMEOUT_MS,
  DEFAULT_GREENFEED_MAX_RESPONSE_BYTES,
});
