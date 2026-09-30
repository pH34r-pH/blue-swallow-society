import { WORLD_SOURCES, WORLD_LIMITS, normalizeExistingWorldSource, normalizeNws } from './world-sources.mjs';

async function boundedJson(response) {
  if (Number(response.headers.get('content-length')) > WORLD_LIMITS.bytes) throw new Error('response_too_large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_payload');
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > WORLD_LIMITS.bytes) throw new Error('response_too_large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Process-local public snapshots only. Host must schedule refresh independently of reads.
 * No startup fetch, interval, DB mutation, raw RF data, or entity/observation-store dependency.
 */
export function createWorldService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const states = new Map(); const inFlight = new Map();
  function read() {
    const at = now(); const items = [];
    const sources = WORLD_SOURCES.map((source) => {
      const state = states.get(source.id);
      const age = state?.fetchedAt ? at - Date.parse(state.fetchedAt) : null;
      const expired = age !== null && age > source.maxAgeMs;
      const stale = age !== null && age > source.staleMs;
      const retained = !expired ? state?.items || [] : [];
      items.push(...retained.map((item) => ({ ...item,
        semantics: item.expiresAt && Date.parse(item.expiresAt) <= at ? 'historical' : item.semantics,
        freshness: state?.error || stale ? 'stale' : 'fresh' })));
      return { ...source, state: !source.enabled ? 'disabled' : state?.error ? 'failure' : !state?.fetchedAt ? 'unavailable' : expired ? 'expired' : stale ? 'stale' : retained.length ? 'fresh' : 'empty',
        fetchedAt: state?.fetchedAt || null, attemptedAt: state?.attemptedAt || null,
        nextAttemptAt: state?.nextAttemptAt ? new Date(state.nextAttemptAt).toISOString() : null,
        error: state?.error || null, rejected: state?.rejected || 0, expired, count: retained.length };
    });
    return structuredClone({ version: 'bss.world.v1', generatedAt: new Date(at).toISOString(), sources, items,
      storage: 'process-local; lost on restart', boundary: 'public_context_not_entity_evidence' });
  }
  async function acquire(source) {
    const started = now(); const previous = states.get(source.id) || {};
    const state = { ...previous, attemptedAt: new Date(started).toISOString(), nextAttemptAt: started + source.intervalMs };
    states.set(source.id, state);
    try {
      const response = await fetchImpl(source.url, { redirect: 'error', signal: AbortSignal.timeout(WORLD_LIMITS.timeoutMs),
        headers: { Accept: 'application/geo+json, application/json', 'User-Agent': 'BlueSwallowSociety-World/1 (https://github.com/pH34r-pH/blue-swallow-society)' } });
      if (response.status !== 200) {
        await response.body?.cancel();
        const retry = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retry) && retry > 0) state.nextAttemptAt = started + Math.min(86400000, Math.max(source.intervalMs, retry * 1000));
        throw new Error(`http_${response.status}`);
      }
      const payload = await boundedJson(response);
      const fetchedAt = new Date(now()).toISOString();
      const normalized = source.id === 'nws-alerts' ? normalizeNws(payload, fetchedAt) : normalizeExistingWorldSource(source.id, payload, fetchedAt);
      // A malformed nonempty response cannot erase the last successful context as an 'empty' success.
      if (normalized.rejected && !normalized.items.length) throw new Error('invalid_payload');
      states.set(source.id, { ...state, ...normalized, fetchedAt, error: null });
    } catch (error) {
      state.error = /^http_\d{3}$/.test(error.message) ? error.message : ['response_too_large', 'invalid_payload', 'invalid_or_oversize_items'].includes(error.message) ? error.message : 'source_unavailable';
    }
    return read();
  }
  function refresh(id) {
    const source = WORLD_SOURCES.find((item) => item.id === id);
    if (!source?.enabled) return Promise.resolve(read());
    if (inFlight.has(id)) return inFlight.get(id);
    if ((states.get(id)?.nextAttemptAt || 0) > now()) return Promise.resolve(read());
    const promise = acquire(source).finally(() => inFlight.delete(id));
    inFlight.set(id, promise); return promise;
  }
  return Object.freeze({ read, refresh });
}
