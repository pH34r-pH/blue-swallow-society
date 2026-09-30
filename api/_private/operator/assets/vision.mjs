export function normalizeVisionDetection(detection, { source = 'live' } = {}) {
  if (!detection || typeof detection !== 'object') {
    return null;
  }

  const label = cleanString(firstDefined(detection, ['label', 'className', 'class', 'name', 'object', 'category'])) || 'object';
  const className = slugifyLabel(cleanString(firstDefined(detection, ['className', 'class', 'category', 'name'])) || label);
  const confidence = normalizeConfidence(firstDefined(detection, ['confidence', 'score', 'probability', 'prob']));
  const box = normalizeDetectionBox(firstDefined(detection, ['box', 'bbox', 'boundingBox', 'bounds', 'rect']), detection);
  const trackId = cleanString(firstDefined(detection, ['trackId', 'track_id', 'trackid'])) || null;
  const timestamp = cleanString(firstDefined(detection, ['timestamp', 'capturedAt', 'seenAt', 'updatedAt', 'time'])) || null;
  const sourceLabel = cleanString(firstDefined(detection, ['source', 'feedSource', 'modelSource'])) || source;
  const id = cleanString(firstDefined(detection, ['id', 'detectionId', 'detection_id'])) || deriveDetectionId(label, trackId, box, timestamp);

  return {
    id,
    label,
    className,
    confidence,
    box,
    trackId,
    timestamp,
    source: sourceLabel,
    detail: buildDetectionDetail({ label, className, confidence, box, source: sourceLabel }),
    raw: detection,
  };
}

export function mergeVisionDetections(...collections) {
  const map = new Map();

  collections.flat().forEach((entry) => {
    const normalized = normalizeVisionDetection(entry);
    if (!normalized) {
      return;
    }

    const key = normalized.trackId || normalized.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, normalized);
      return;
    }

    const preferred = shouldPreferVisionDetection(normalized, existing) ? normalized : existing;
    map.set(key, preferred);
  });

  return Array.from(map.values()).sort((left, right) => scoreDetection(right) - scoreDetection(left));
}

export function parseVisionPayload(payload, { source = 'live' } = {}) {
  if (!payload) {
    return { detections: [], frame: null, source, updatedAt: null };
  }

  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text) {
      return { detections: [], frame: null, source, updatedAt: null };
    }

    try {
      return parseVisionPayload(JSON.parse(text), { source });
    } catch {
      return parseVisionText(text, source);
    }
  }

  if (Array.isArray(payload)) {
    return {
      detections: mergeVisionDetections(payload.map((entry) => normalizeVisionDetection(entry, { source }))),
      frame: null,
      source,
      updatedAt: null,
    };
  }

  if (payload && typeof payload === 'object') {
    const detections = Array.isArray(payload.detections)
      ? payload.detections
      : Array.isArray(payload.objects)
        ? payload.objects
        : Array.isArray(payload.results)
          ? payload.results
          : Array.isArray(payload.items)
            ? payload.items
            : Array.isArray(payload.predictions)
              ? payload.predictions
              : [];

    return {
      detections: mergeVisionDetections(detections.map((entry) => normalizeVisionDetection(entry, { source: payload.source || source }))),
      frame: normalizeFrame(payload.frame || payload.image || payload.size || payload.viewport),
      source: cleanString(payload.source || source) || source,
      updatedAt: cleanString(payload.updatedAt || payload.lastUpdated || payload.timestamp || payload.capturedAt) || null,
    };
  }

  return { detections: [], frame: null, source, updatedAt: null };
}

export function buildArDetectionBoxes({
  detections = [],
  viewportWidth = 1080,
  viewportHeight = 1920,
  orientationAngle = 0,
  maxBoxes = 6,
} = {}) {
  const normalizedAngle = normalizeAngle(orientationAngle);
  const normalizedDetections = mergeVisionDetections(detections).filter((item) => item.box).slice(0, maxBoxes);

  const boxes = normalizedDetections.map((detection) => {
    const box = detection.box || {};
    const width = box.normalized ? box.width * viewportWidth : box.width;
    const height = box.normalized ? box.height * viewportHeight : box.height;
    const left = box.normalized ? box.x * viewportWidth : box.x;
    const top = box.normalized ? box.y * viewportHeight : box.y;
    const safeLeft = clamp(left, 0, viewportWidth);
    const safeTop = clamp(top, 0, viewportHeight);
    const safeWidth = clamp(left + width, 0, viewportWidth) - safeLeft;
    const safeHeight = clamp(top + height, 0, viewportHeight) - safeTop;

    return {
      id: detection.id,
      label: detection.label,
      className: detection.className,
      confidence: detection.confidence,
      x: safeLeft,
      y: safeTop,
      width: safeWidth,
      height: safeHeight,
      source: detection.source,
      trackId: detection.trackId,
      timestamp: detection.timestamp,
      rotation: 0,
      visible: true,
      subtitle: [detection.className || detection.label || 'object', confidenceLabel(detection.confidence), detection.source || null]
        .filter(Boolean)
        .join(' · '),
      detail: detection.box?.normalized ? 'normalized frame box' : 'pixel frame box',
    };
  }).filter((box) => box.width > 0 && box.height > 0);

  return {
    orientationAngle: normalizedAngle,
    boxes,
    guide: {
      hint: 'Detection overlays are driven by live, local, or imported vision payloads.',
      rotationUpright: true,
    },
  };
}

function parseVisionText(text, source) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return { detections: [], frame: null, source, updatedAt: null };
  }

  if (lines.every((line) => line.startsWith('{'))) {
    const detections = lines.flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

    return {
      detections: mergeVisionDetections(detections.map((entry) => normalizeVisionDetection(entry, { source }))),
      frame: null,
      source,
      updatedAt: null,
    };
  }

  if (lines[0].includes(',')) {
    return parseVisionCsv(lines, source);
  }

  return { detections: [], frame: null, source, updatedAt: null };
}

function parseVisionCsv(lines, source) {
  if (lines.length < 2) {
    return { detections: [], frame: null, source, updatedAt: null };
  }

  const headers = parseCsvRow(lines[0]).map(mapVisionHeader);
  const records = lines.slice(1).flatMap((line) => {
    const cells = parseCsvRow(line);
    if (!cells.length) {
      return [];
    }

    const record = {};
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      record[header] = cells[index] ?? '';
    });

    return [record];
  });

  return {
    detections: mergeVisionDetections(records.map((entry) => normalizeVisionDetection(entry, { source }))),
    frame: null,
    source,
    updatedAt: null,
  };
}

function emptyDetectionBox() {
  return null;
}

function normalizedArrayBox(box, detection) {
  const [a, b, c, d] = box.map(toNumber);
  if (![a, b, c, d].every(Number.isFinite)) return emptyDetectionBox();
  const mode = cleanString(firstDefined(detection, ['bboxMode', 'boxMode', 'boxFormat', 'format'])) || 'xywh';
  const normalized = inferNormalizedFlag(detection, [a, b, c, d]);
  if (mode === 'xyxy' || mode === 'corners' || mode === 'ltrb') {
    return {
      x: a, y: b, width: Math.max(0, c - a), height: Math.max(0, d - b), normalized,
    };
  }
  return { x: a, y: b, width: c, height: d, normalized };
}

function numericBoxFields(box, names) {
  const values = names.map((name) => toNumber(box[name]));
  return values.every(Number.isFinite) ? values : null;
}

function normalizedObjectBox(box, detection) {
  let values = numericBoxFields(box, ['x', 'y', 'width', 'height']);
  if (values) {
    const [x, y, width, height] = values;
    return { x, y, width, height, normalized: inferNormalizedFlag(detection, values, box.normalized) };
  }
  values = numericBoxFields(box, ['left', 'top', 'right', 'bottom']);
  if (values) {
    const [left, top, right, bottom] = values;
    return {
      x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top),
      normalized: inferNormalizedFlag(detection, values, box.normalized),
    };
  }
  values = numericBoxFields(box, ['xMin', 'yMin', 'xMax', 'yMax']);
  if (values) {
    const [xMin, yMin, xMax, yMax] = values;
    return {
      x: xMin, y: yMin, width: Math.max(0, xMax - xMin), height: Math.max(0, yMax - yMin),
      normalized: inferNormalizedFlag(detection, values, box.normalized),
    };
  }
  values = numericBoxFields(box, ['centerX', 'centerY', 'width', 'height']);
  if (!values) return emptyDetectionBox();
  const [centerX, centerY, width, height] = values;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    normalized: inferNormalizedFlag(detection, values, box.normalized),
  };
}

function normalizeDetectionBox(box, detection) {
  if (!box || typeof box !== 'object') return null;
  const normalized = Array.isArray(box)
    ? (box.length >= 4 ? normalizedArrayBox(box, detection) : null)
    : normalizedObjectBox(box, detection);
  return normalized && normalized.width > 0 && normalized.height > 0 ? normalized : null;
}

function normalizeFrame(frame) {
  if (!frame || typeof frame !== 'object') {
    return null;
  }

  const width = toNumber(firstDefined(frame, ['width', 'w', 'videoWidth']));
  const height = toNumber(firstDefined(frame, ['height', 'h', 'videoHeight']));

  return {
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    source: cleanString(firstDefined(frame, ['source', 'kind', 'type'])) || null,
    timestamp: cleanString(firstDefined(frame, ['timestamp', 'time'])) || null,
  };
}

function inferNormalizedFlag(detection, values = [], explicit = null) {
  if (explicit !== null && explicit !== undefined) {
    return toBoolean(explicit);
  }

  const detectionExplicit = firstDefined(detection, ['normalized', 'boxNormalized', 'bboxNormalized']);
  if (detectionExplicit !== null && detectionExplicit !== undefined) {
    return toBoolean(detectionExplicit);
  }

  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return false;
  }

  return finiteValues.every((value) => Math.abs(value) <= 1.5);
}

function normalizeConfidence(value) {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return clamp(Math.round(percent), 0, 100);
}

function confidenceLabel(confidence) {
  return Number.isFinite(confidence) ? `${confidence}%` : null;
}

function buildDetectionDetail({ label, className, confidence, box, source }) {
  const geometry = box?.normalized ? 'normalized' : 'pixel';
  return [label || className || 'object', confidenceLabel(confidence), source || null, box ? `${geometry} box` : 'geometry unavailable']
    .filter(Boolean)
    .join(' · ');
}

function deriveDetectionId(label, trackId, box, timestamp) {
  const base = [trackId || label || 'object', box?.x, box?.y, box?.width, box?.height, timestamp || ''].join(':');
  return slugifyLabel(base) || 'detection';
}

function shouldPreferVisionDetection(next, existing) {
  return scoreDetection(next) > scoreDetection(existing);
}

function scoreDetection(detection) {
  const confidence = Number.isFinite(detection.confidence) ? detection.confidence : 0;
  const area = detection.box && Number.isFinite(detection.box.width) && Number.isFinite(detection.box.height)
    ? detection.box.width * detection.box.height
    : 0;
  return confidence + area * 0.001;
}

function normalizeAngle(angle) {
  return ((Math.round(angle || 0) % 360) + 360) % 360;
}

function normalizeNumberBox(value) {
  const numeric = toNumber(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
  }

  return Boolean(value);
}

function numberOrFallback(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function parseCsvRow(line) {
  const cells = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }

    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}

const VISION_CSV_HEADERS = Object.freeze({
  label: 'label', classname: 'label', class: 'label', name: 'label',
  object: 'label', category: 'label',
  confidence: 'confidence', score: 'confidence', probability: 'confidence', prob: 'confidence',
  x: 'x', left: 'x', y: 'y', top: 'y', width: 'width', height: 'height',
  right: 'right', bottom: 'bottom',
  xmin: 'xMin', ymin: 'yMin', xmax: 'xMax', ymax: 'yMax',
  normalized: 'normalized', relative: 'normalized', isnormalized: 'normalized',
  trackid: 'trackId',
  source: 'source', feedsource: 'source', modelsource: 'source',
  timestamp: 'timestamp', updatedat: 'timestamp', capturedat: 'timestamp', seenat: 'timestamp',
});

function mapVisionHeader(header) {
  const compact = String(header || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return VISION_CSV_HEADERS[compact] || header;
}

function slugifyLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value).trim();
  return text;
}

function firstDefined(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined && object[key] !== null && object[key] !== '') {
      return object[key];
    }
  }

  return null;
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}
