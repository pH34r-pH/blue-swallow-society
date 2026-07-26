export const GODEYE_GLOBAL_VIEWPORT_ENDPOINT = '/api/cybermap/global-viewport';
export const DEFAULT_GODEYE_GLOBAL_VIEWPORT = {
  schema_version: 'bss.godeye.global_viewport.v1',
  bbox: { west: -180, south: -85, east: 180, north: 85 },
  zoom: 2,
  layer_ids: ['usgs-earthquakes'],
  max_cells: 1_000,
};

const DEFAULT_CACHE_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 12;

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(Math.max(number, minimum), maximum);
}

function cacheKey(request) {
  return JSON.stringify(request);
}

function cancellationResult() {
  return {
    ok: false,
    cancelled: true,
    state: 'empty',
    cells: [],
    source_health: [],
    intelligence_gaps: [],
  };
}

function errorResult() {
  return {
    ok: false,
    state: 'unavailable',
    cells: [],
    source_health: [],
    intelligence_gaps: [{ state: 'unavailable', reason: 'global_viewport_unavailable' }],
  };
}

function healthStates(sourceHealth) {
  return sourceHealth
    .map((entry) => entry?.health)
    .filter((state) => ['fresh', 'stale', 'error', 'disabled'].includes(state));
}

function deriveState(ok, cells, sourceHealth, intelligenceGaps) {
  if (!ok) {
    return 'error';
  }

  const states = healthStates(sourceHealth);
  if (cells.length) {
    if (states.includes('fresh')) return 'fresh';
    if (states.includes('stale')) return 'stale';
    if (states.includes('error')) return 'error';
    if (states.includes('disabled')) return 'disabled';
    return 'empty';
  }

  for (const state of ['error', 'stale', 'disabled']) {
    if (states.includes(state) || intelligenceGaps.some((gap) => gap?.state === state)) {
      return state;
    }
  }

  return 'empty';
}

export function normalizeGlobalViewportResponse(payload) {
  const cells = Array.isArray(payload?.cells) ? payload.cells : [];
  const source_health = Array.isArray(payload?.source_health) ? payload.source_health : [];
  const intelligence_gaps = Array.isArray(payload?.intelligence_gaps) ? payload.intelligence_gaps : [];
  const ok = payload?.ok === true;

  return {
    ok,
    state: deriveState(ok, cells, source_health, intelligence_gaps),
    cells,
    source_health,
    intelligence_gaps,
  };
}

export function createGlobalViewportClient({
  fetchImpl = globalThis.fetch,
  getHeaders = () => ({}),
  now = () => Date.now(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  maxCacheEntries = MAX_CACHE_ENTRIES,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required for Global viewport reads.');
  }

  const ttlMs = boundedNumber(cacheTtlMs, DEFAULT_CACHE_TTL_MS, 0, 60_000);
  const cacheLimit = boundedNumber(maxCacheEntries, MAX_CACHE_ENTRIES, 1, MAX_CACHE_ENTRIES);
  const cache = new Map();
  let activeRequest = null;
  let requestSequence = 0;

  function cancel() {
    activeRequest?.controller.abort();
    activeRequest = null;
  }

  function cacheResult(key, result) {
    if (!result.ok) {
      return;
    }

    cache.set(key, { createdAt: now(), result });
    while (cache.size > cacheLimit) {
      cache.delete(cache.keys().next().value);
    }
  }

  async function load(request) {
    const key = cacheKey(request);
    const cached = cache.get(key);
    if (cached && now() - cached.createdAt <= ttlMs) {
      return { ...cached.result, cacheState: 'hit' };
    }
    cache.delete(key);

    cancel();
    const controller = new AbortController();
    const id = ++requestSequence;
    activeRequest = { id, controller };

    try {
      const response = await fetchImpl(GODEYE_GLOBAL_VIEWPORT_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...getHeaders(),
        },
        body: JSON.stringify(request),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (controller.signal.aborted || activeRequest?.id !== id) {
        return cancellationResult();
      }
      if (!response.ok) {
        return errorResult();
      }

      const result = normalizeGlobalViewportResponse(await response.json());
      if (controller.signal.aborted || activeRequest?.id !== id) {
        return cancellationResult();
      }

      cacheResult(key, result);
      return { ...result, cacheState: 'miss' };
    } catch {
      if (controller.signal.aborted || activeRequest?.id !== id) {
        return cancellationResult();
      }
      return errorResult();
    } finally {
      if (activeRequest?.id === id) {
        activeRequest = null;
      }
    }
  }

  return { load, cancel };
}

function renderLedgerEntry(documentRef, source) {
  const entry = documentRef.createElement('article');
  entry.className = `godeye-global-source godeye-global-source-${source?.health || 'empty'}`;
  entry.textContent = [
    `Layer: ${source?.display_name || source?.layer_id || 'Unnamed source'}`,
    `Source class: ${source?.source_class || 'unclassified'}`,
    `Freshness: ${source?.health || 'empty'}`,
    `Last success: ${source?.last_success_at || 'no successful fetch recorded'}`,
    `Next retry: ${source?.next_retry_at || 'no retry scheduled'}`,
    `Attribution: ${source?.attribution || 'attribution unavailable'}`,
    `Terms: ${source?.terms_url || 'terms unavailable'}`,
    `Caveats: ${source?.caveat_count ?? 0}`,
  ].join(' · ');
  return entry;
}

function renderGapEntry(documentRef, gap) {
  const entry = documentRef.createElement('li');
  entry.className = `godeye-global-gap godeye-global-gap-${gap?.state || 'empty'}`;
  entry.textContent = gap?.reason || gap?.state || 'empty';
  return entry;
}

function renderCellEntry(documentRef, cell, sourceHealthByLayer) {
  const entry = documentRef.createElement('article');
  entry.className = 'godeye-global-cell';
  const sourceClasses = Array.isArray(cell?.source_classes) && cell.source_classes.length
    ? cell.source_classes.join(', ')
    : 'unclassified';
  const caveats = Array.isArray(cell?.caveats) && cell.caveats.length
    ? cell.caveats.join(', ')
    : 'no caveats';
  const layerIds = Object.keys(cell?.layers || {});
  const provenance = layerIds.length
    ? layerIds.map((layerId) => {
      const source = sourceHealthByLayer.get(layerId);
      const freshness = cell?.freshness?.[layerId]?.state || source?.health || 'unavailable';
      return [
        `Layer: ${source?.display_name || layerId}`,
        `Source class: ${source?.source_class || sourceClasses}`,
        `Attribution: ${source?.attribution || 'attribution unavailable'}`,
        `Freshness: ${freshness}`,
        `Caveats: ${caveats}`,
      ].join(' / ');
    }).join(' · ')
    : [
      `Source class: ${sourceClasses}`,
      'Attribution: attribution unavailable',
      'Freshness: unavailable',
      `Caveats: ${caveats}`,
    ].join(' / ');
  entry.textContent = [
    cell?.h3_cell || 'unresolved cell',
    `${cell?.observation_count ?? 0} observations`,
    `${cell?.entity_count ?? 0} entities`,
    provenance,
  ].join(' · ');
  return entry;
}

export function renderGlobalViewportResult(result, documentRef = globalThis.document) {
  if (!documentRef) {
    return;
  }

  const cells = documentRef.querySelector('[data-godeye-global-cells]');
  if (cells) {
    const sourceHealthByLayer = new Map(
      result.source_health
        .filter((source) => source?.layer_id)
        .map((source) => [source.layer_id, source]),
    );
    const entries = result.cells.map((cell) => renderCellEntry(documentRef, cell, sourceHealthByLayer));
    if (!entries.length) {
      const empty = documentRef.createElement('p');
      empty.className = `godeye-global-cell godeye-global-cell-${result.state}`;
      empty.textContent = `Global cells: ${result.state}.`;
      entries.push(empty);
    }
    cells.replaceChildren(...entries);
  }

  const ledger = documentRef.querySelector('[data-godeye-global-ledger]');
  if (ledger) {
    const entries = result.source_health.map((source) => renderLedgerEntry(documentRef, source));
    if (!entries.length) {
      const empty = documentRef.createElement('p');
      empty.className = `godeye-global-source godeye-global-source-${result.state}`;
      empty.textContent = `Global source ledger: ${result.state}.`;
      entries.push(empty);
    }
    ledger.replaceChildren(...entries);
  }

  const gaps = documentRef.querySelector('[data-godeye-global-intelligence-gaps]');
  if (gaps) {
    const entries = result.intelligence_gaps.map((gap) => renderGapEntry(documentRef, gap));
    if (!entries.length) {
      const empty = documentRef.createElement('li');
      empty.className = 'godeye-global-gap godeye-global-gap-fresh';
      empty.textContent = 'fresh';
      entries.push(empty);
    }
    gaps.replaceChildren(...entries);
  }
}

export function createGodeyeGlobalRenderer(options = {}) {
  const client = createGlobalViewportClient(options);
  const documentRef = options.documentRef || globalThis.document;

  return {
    async loadViewport(request = DEFAULT_GODEYE_GLOBAL_VIEWPORT) {
      const result = await client.load(request);
      renderGlobalViewportResult(result, documentRef);
      return result;
    },
    cancel: client.cancel,
  };
}
