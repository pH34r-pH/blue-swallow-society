import { mergeVisionDetections } from './vision.mjs';

// A conservative presentation bound, not proof that a detection matches a camera pose.
const DEFAULT_MAX_AGE_MS = 1000;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

export function createVisionController({ now = () => new Date().toISOString(), maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) throw new TypeError('maxAgeMs must be positive and finite');
  return Object.freeze({ emptyDataset, reduceDataset, getView });

  function emptyDataset() {
    return { frame: null, detections: [], source: 'unavailable', updatedAt: null, mode: 'live' };
  }

  function reduceDataset(payload = {}, { sourceLabel = 'unavailable', previous = null, merge = false, mode = 'live' } = {}) {
    if (!['live', 'historical'].includes(mode)) throw new TypeError('Unsupported vision dataset mode');
    const updatedAt = timestamp(payload.updatedAt) || timestamp(payload.frame?.timestamp);
    const incoming = capturedDetections(payload, updatedAt);
    const historicalMerge = mode === 'historical' && previous?.mode === 'historical' && merge;
    return {
      frame: payload.frame || null,
      detections: historicalMerge ? mergeVisionDetections(previous.detections, incoming) : incoming,
      source: sourceLabel,
      updatedAt,
      mode,
    };
  }

  function getView(dataset = emptyDataset()) {
    const clock = now();
    const nowMs = typeof clock === 'number' ? clock : Date.parse(clock);
    const detections = dataset.detections || [];
    if (dataset.mode === 'historical') return { status: 'historical', overlayDetections: [], expiresInMs: null };
    if (!detections.length) return { status: 'empty', overlayDetections: [], expiresInMs: null };
    const current = detections.filter((item) => {
      const capturedAt = Date.parse(item.timestamp);
      const age = nowMs - capturedAt;
      return Number.isFinite(age) && age >= 0 && age < maxAgeMs;
    });
    return {
      status: current.length ? 'current' : detections.some((item) => Date.parse(item.timestamp) <= nowMs) ? 'stale' : 'unknown-time',
      overlayDetections: current,
      expiresInMs: current.length ? Math.min(...current.map((item) => Date.parse(item.timestamp) + maxAgeMs - nowMs)) : null,
    };
  }
}

function capturedDetections(payload, updatedAt) {
  return mergeVisionDetections(payload.detections || []).map((item) => ({
      ...item,
      // An explicitly invalid timestamp must not inherit a newer dataset timestamp.
      timestamp: item.timestamp ? timestamp(item.timestamp) : updatedAt,
  }));
}
