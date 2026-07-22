import { randomUUID } from 'node:crypto';

import { forbidden, IngestError, tokenDigestMatches } from './auth.mjs';
import { hashCanonicalJson, hashPersistedObservation } from './contracts.mjs';

const GLOBAL_SOURCE_CLASSES = Object.freeze(['green_public', 'green_owned', 'green_authorized']);
const GLOBAL_MAX_CELLS = 1_000;
const GLOBAL_VIEWPORT_SCHEMA_VERSION = 'bss.godeye.global_viewport.v1';

export class MemoryObservationStore {
  #credentials;
  #batches = new Map();
  #observations = new Map();
  #paperStateUpdates = new Map();
  #paperState = null;
  #globalCells;
  #globalSources;
  #now;
  #randomUuid;

  constructor({
    credentials = [],
    globalCells = [],
    globalSources = [],
    now = () => new Date(),
    randomUuid = randomUUID,
  } = {}) {
    this.#credentials = credentials.map((credential) => ({
      device_id: credential.device_id,
      source_id: credential.source_id,
      source_class: credential.source_class,
      token_sha256: credential.token_sha256,
      scopes: [...(credential.scopes ?? [])],
      enabled: credential.enabled === true,
      expires_at: credential.expires_at ?? null,
    }));
    this.#globalCells = globalCells.map((cell) => structuredClone(cell));
    this.#globalSources = globalSources.map((source) => structuredClone(source));
    this.#now = now;
    this.#randomUuid = randomUuid;
  }

  async ready() {
    return { ok: true, database: 'ready', migrations: 'ready' };
  }

  async authenticate({ deviceId, token, requiredScope }) {
    const credential = this.#credentials.find((candidate) => candidate.device_id === deviceId);
    const now = this.#now();
    if (!credential || !credential.enabled || !tokenDigestMatches(token, credential.token_sha256)) throw forbidden();
    if (credential.expires_at && new Date(credential.expires_at) <= now) throw forbidden();
    if (!credential.scopes.includes(requiredScope)) throw forbidden();
    return Object.freeze({
      device_id: credential.device_id,
      source_id: credential.source_id,
      source_class: credential.source_class,
      scopes: Object.freeze([...credential.scopes]),
    });
  }

  async applyBatch({ credential, batch }) {
    if (credential.device_id !== batch.device_id) throw forbidden();
    const batchIdentity = `${credential.source_id}\u0000${batch.device_id}\u0000${batch.idempotency_key}`;
    const payloadHash = hashCanonicalJson(batch);
    const existingBatch = this.#batches.get(batchIdentity);
    if (existingBatch) {
      if (existingBatch.payloadHash !== payloadHash) {
        throw new IngestError('idempotency_key_reused', 'Idempotency key was reused with changed content.', { statusCode: 409 });
      }
      return { statusCode: 200, replayed: true, receipt: structuredClone(existingBatch.receipt) };
    }

    const pending = [];
    let duplicateCount = 0;
    for (const observation of batch.observations) {
      const identity = `${credential.source_id}\u0000${observation.external_observation_key}`;
      const contentHash = hashPersistedObservation(batch, observation);
      const existing = this.#observations.get(identity);
      if (existing) {
        if (existing.contentHash !== contentHash) {
          throw new IngestError('observation_key_reused', 'Observation key was reused with changed content.', { statusCode: 409 });
        }
        duplicateCount += 1;
      } else {
        pending.push({ identity, contentHash, observation });
      }
    }

    const serverClock = this.#now().toISOString();
    const receipt = Object.freeze({
      schema_version: 'bss.sync_receipt.v1',
      server_batch_id: this.#randomUuid(),
      idempotency_key: batch.idempotency_key,
      status: 'applied',
      accepted_count: pending.length,
      rejected_count: 0,
      duplicate_count: duplicateCount,
      validation_errors: [],
      server_clock: serverClock,
    });

    for (const entry of pending) {
      this.#observations.set(entry.identity, {
        contentHash: entry.contentHash,
        observation: structuredClone(entry.observation),
        sourceId: credential.source_id,
        sourceClass: credential.source_class,
        batchId: receipt.server_batch_id,
      });
    }
    this.#batches.set(batchIdentity, { payloadHash, receipt: structuredClone(receipt) });
    return { statusCode: 201, replayed: false, receipt: structuredClone(receipt) };
  }

  async putPaperState({ idempotencyKey, state }) {
    const payloadHash = hashCanonicalJson(state);
    const existing = this.#paperStateUpdates.get(idempotencyKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new IngestError('idempotency_key_reused', 'Idempotency key was reused with changed content.', { statusCode: 409 });
      }
      return { statusCode: 200, replayed: true, state: structuredClone(existing.state) };
    }
    const generatedAt = Date.parse(state.generated_at);
    if (this.#paperState) {
      const currentGeneratedAt = Date.parse(this.#paperState.state.generated_at);
      if (generatedAt < currentGeneratedAt) {
        throw new IngestError('stale_paper_state', 'Older paper state cannot replace the current snapshot.', { statusCode: 409 });
      }
      if (generatedAt === currentGeneratedAt && payloadHash !== this.#paperState.payloadHash) {
        throw new IngestError('paper_state_conflict', 'Changed paper state cannot reuse the current generated_at timestamp.', { statusCode: 409 });
      }
    }
    const entry = { payloadHash, state: structuredClone(state), appliedAt: this.#now().toISOString() };
    this.#paperStateUpdates.set(idempotencyKey, entry);
    this.#paperState = { idempotencyKey, ...entry };
    return { statusCode: 201, replayed: false, state: structuredClone(state) };
  }

  async getPaperState() {
    return this.#paperState ? structuredClone(this.#paperState) : null;
  }

  observationCount() {
    return this.#observations.size;
  }

  async queryViewport({ lat, lon, radiusMeters = 100, limit = 100, maxAgeMs = null, now = this.#now() } = {}) {
    const center = { lat, lon };
    const cutoffMs = Number.isFinite(maxAgeMs) ? new Date(now).getTime() - maxAgeMs : null;
    const accessPoints = [...this.#observations.values()]
      .map((entry) => toAccessPoint(entry, center))
      .filter((record) => Number.isFinite(record.distanceMeters) && record.distanceMeters <= radiusMeters)
      .filter((record) => !Number.isFinite(cutoffMs) || Date.parse(record.lastSeen) >= cutoffMs)
      .sort((a, b) => Date.parse(b.lastSeen || 0) - Date.parse(a.lastSeen || 0))
      .slice(0, limit);

    return {
      ok: true,
      mode: 'viewport',
      live: true,
      current: Number.isFinite(maxAgeMs),
      source: 'cybermap-postgis',
      location: center,
      radiusMeters,
      maxAgeMs: Number.isFinite(maxAgeMs) ? maxAgeMs : undefined,
      totalResults: accessPoints.length,
      accessPoints,
      updatedAt: accessPoints[0]?.lastSeen || new Date(now).toISOString(),
      message: accessPoints.length > 0
        ? 'Cybermap PostGIS viewport ready.'
        : 'Cybermap PostGIS viewport returned no observations for this fix.',
    };
  }

  async queryGlobalViewport({
    bbox,
    zoom,
    layer_ids: layerIds = [],
    since = null,
    max_cells: maxCells = GLOBAL_MAX_CELLS,
    now = this.#now(),
  } = {}) {
    const selectedResolution = globalResolutionForZoom(zoom);
    const eligibleSources = new Map(
      this.#globalSources
        .filter((source) => isEligibleGlobalSource(source, layerIds))
        .map((source) => [source.layer_id, source]),
    );
    const sinceMs = since === null ? null : Date.parse(since);
    const cells = this.#globalCells
      .filter((cell) => cell.resolution === selectedResolution)
      .filter((cell) => centroidInBbox(cell.centroid, bbox))
      .filter((cell) => !Number.isFinite(sinceMs) || Date.parse(cell.last_seen_at) >= sinceMs)
      .filter((cell) => cellUsesOnlyEligibleLayers(cell, eligibleSources))
      .map((cell) => toAggregateCell(cell, eligibleSources))
      .sort(compareAggregateCells)
      .slice(0, boundedGlobalLimit(maxCells));

    return {
      ok: true,
      schema_version: GLOBAL_VIEWPORT_SCHEMA_VERSION,
      mode: 'global',
      generated_at: new Date(now).toISOString(),
      bbox: structuredClone(bbox),
      requested_zoom: zoom,
      selected_resolution: selectedResolution,
      aggregation_applied: false,
      cells,
      source_health: [],
      intelligence_gaps: [],
    };
  }

  batchCount() {
    return this.#batches.size;
  }
}

function globalResolutionForZoom(zoom) {
  if (zoom <= 3) return 5;
  if (zoom <= 7) return 7;
  if (zoom <= 11) return 9;
  return 11;
}

function boundedGlobalLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return 1;
  return Math.min(limit, GLOBAL_MAX_CELLS);
}

function isEligibleGlobalSource(source, layerIds) {
  return layerIds.includes(source.layer_id)
    && source.enabled === true
    && source.global_layer === true
    && source.terms_reviewed_at !== null
    && source.allowed_preload === true
    && GLOBAL_SOURCE_CLASSES.includes(source.source_class)
    && (source.source_class !== 'green_authorized' || source.authorized_scope_ref !== null);
}

function centroidInBbox(centroid, bbox) {
  return Number.isFinite(centroid?.lat)
    && Number.isFinite(centroid?.lon)
    && centroid.lon >= bbox.west
    && centroid.lon <= bbox.east
    && centroid.lat >= bbox.south
    && centroid.lat <= bbox.north;
}

function cellUsesOnlyEligibleLayers(cell, eligibleSources) {
  const layerIds = Object.keys(cell.layers ?? {});
  return layerIds.length > 0 && layerIds.every((layerId) => eligibleSources.has(layerId));
}

function toAggregateCell(cell, eligibleSources) {
  const layers = Object.fromEntries(
    Object.entries(cell.layers).map(([layerId, aggregate]) => [
      layerId,
      { observation_count: finiteInteger(aggregate?.observation_count) },
    ]),
  );
  return {
    h3_cell: cell.h3_cell,
    resolution: finiteInteger(cell.resolution),
    centroid: {
      lat: finiteOrNull(cell.centroid?.lat),
      lon: finiteOrNull(cell.centroid?.lon),
    },
    source_classes: [...new Set(Object.keys(layers).map((layerId) => eligibleSources.get(layerId).source_class))].sort(),
    observation_count: finiteInteger(cell.observation_count),
    entity_count: finiteInteger(cell.entity_count),
    first_seen_at: toIsoString(cell.first_seen_at),
    last_seen_at: toIsoString(cell.last_seen_at),
    layers,
    freshness: aggregateFreshness(cell.freshness, Object.keys(layers)),
    caveats: aggregateCaveats(cell.caveats),
    salience: finiteOrNull(cell.salience),
  };
}

function aggregateFreshness(freshness, layerIds) {
  return Object.fromEntries(layerIds.map((layerId) => {
    const record = freshness?.[layerId] ?? {};
    return [layerId, {
      state: typeof record.state === 'string' ? record.state : 'error',
      age_seconds: finiteInteger(record.age_seconds),
    }];
  }));
}

function aggregateCaveats(caveats) {
  return Array.isArray(caveats)
    ? caveats.filter((caveat) => typeof caveat === 'string' && /^[a-z0-9_]{1,64}$/.test(caveat))
    : [];
}

function compareAggregateCells(left, right) {
  return (right.salience ?? 0) - (left.salience ?? 0)
    || Date.parse(right.last_seen_at ?? 0) - Date.parse(left.last_seen_at ?? 0)
    || String(left.h3_cell).localeCompare(String(right.h3_cell));
}

function toAccessPoint(entry, center) {
  const observation = entry.observation;
  const payload = observation.payload || {};
  const lat = observation.location.latitude;
  const lon = observation.location.longitude;
  const lastSeen = observation.observed_at;
  return {
    id: observation.external_observation_key,
    kind: observation.kind,
    ssid: stringOrNull(payload.ssid ?? payload.ssid_hmac) || 'hashed Wi-Fi AP',
    bssid: stringOrNull(payload.bssid ?? payload.bssid_hmac),
    signalDbm: finiteOrNull(payload.rssi_dbm ?? payload.signalDbm ?? payload.signal_dbm),
    frequencyMhz: finiteOrNull(payload.frequency_mhz ?? payload.frequencyMhz),
    channel: finiteOrNull(payload.channel),
    security: stringOrNull(payload.security),
    lat,
    lon,
    accuracyMeters: finiteOrNull(observation.location.accuracy_m),
    confidence: observation.confidence,
    source: entry.sourceClass,
    sourceClass: entry.sourceClass,
    lastSeen,
    observedAt: lastSeen,
    current: false,
    distanceMeters: distanceMeters(center.lat, center.lon, lat, lon),
    provenance: observation.provenance || {},
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function toIsoString(value) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value ? value : null;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (degree) => degree * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
