import { randomUUID } from 'node:crypto';
import { computeObservationCells } from './observation-ingest.mjs';
import {
  createInMemorySensoriumStore,
  handleDirectObservationRequest,
  handleSensoriumSessionRequest,
} from './sensorium.mjs';
import {
  loadSeedGreenfeedCatalog,
  normalizeGreenfeedSource,
  rankGreenfeedSourcesForClaim,
} from '../cybermap-worker/greenfeeds/catalog.mjs';

const DEFAULT_MAX_SOURCE_AGE_SECONDS = 15 * 60;
const BAD_UPTIME = new Set(['offline', 'down', 'unavailable', 'disabled', 'failed']);
const STALE_FRESHNESS = new Set(['stale', 'expired', 'unavailable']);
const EFFECT_ON_CLAIM = new Set(['supports', 'weakens', 'contradicts', 'inconclusive']);
const CONFIDENCE = new Set(['low', 'medium', 'high']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compactStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))];
}

function stringValue(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numberValue(value, fieldName, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    const error = new Error(`${fieldName} must be between ${min} and ${max}`);
    error.code = 'invalid_claim_footprint';
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function validationError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function isoString(value, fieldName = 'timestamp') {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw validationError('invalid_timestamp', `${fieldName} must be a valid timestamp.`);
  return date.toISOString();
}

function normalizeNow(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function valueFor(body, snake, camel = null) {
  if (!body || typeof body !== 'object') return undefined;
  if (body[snake] !== undefined) return body[snake];
  if (camel && body[camel] !== undefined) return body[camel];
  return undefined;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

async function resolveFootprintPoint(claim, geocoder) {
  const footprint = valueFor(claim, 'footprint') || valueFor(claim, 'location') || {};
  const latValue = firstDefined(footprint.lat, footprint.latitude, claim.lat, claim.latitude);
  const lonValue = firstDefined(footprint.lon, footprint.lng, footprint.longitude, claim.lon, claim.lng, claim.longitude);
  if (latValue !== undefined && lonValue !== undefined) {
    return { source: footprint, lat: latValue, lon: lonValue, geocoded: null };
  }

  const query = stringValue(footprint.label || footprint.place || footprint.address || claim.location_text || claim.locationText);
  if (query && geocoder) {
    const geocoded = await geocoder({ query, claim: clone(claim) });
    if (geocoded && geocoded.lat !== undefined && geocoded.lon !== undefined) {
      return { source: { ...footprint, ...geocoded, label: geocoded.label || query }, lat: geocoded.lat, lon: geocoded.lon, geocoded };
    }
  }
  throw validationError('claim_footprint_required', 'claim footprint requires lat/lon or a geocoder-resolvable location.');
}

function normalizeClaimTime(claim) {
  const raw = valueFor(claim, 'time') || {};
  return {
    claimed_at: isoString(firstDefined(raw.claimed_at, raw.claimedAt, claim.claimed_at, claim.claimedAt), 'claimed_at'),
    window_start: isoString(firstDefined(raw.window_start, raw.windowStart, claim.window_start, claim.windowStart), 'window_start'),
    window_end: isoString(firstDefined(raw.window_end, raw.windowEnd, claim.window_end, claim.windowEnd), 'window_end'),
    basis: stringValue(raw.basis || raw.time_basis || claim.time_basis || claim.timeBasis) || 'claim_time_extraction',
  };
}

export async function normalizeClaimForValidation(claim, { geocoder } = {}) {
  if (!isPlainObject(claim)) throw validationError('invalid_claim', 'claim must be an object.');
  const claimRef = stringValue(valueFor(claim, 'claim_ref', 'claimRef') || claim.id);
  if (!claimRef) throw validationError('claim_ref_required', 'claim_ref is required.');
  const claimedObservable = stringValue(valueFor(claim, 'claimed_observable', 'claimedObservable') || claim.observable || claim.text);
  if (!claimedObservable) throw validationError('claimed_observable_required', 'claimed_observable is required.');

  const point = await resolveFootprintPoint(claim, geocoder);
  const footprint = point.source || {};
  const lat = numberValue(point.lat, 'claim footprint lat', { min: -90, max: 90 });
  const lon = numberValue(point.lon, 'claim footprint lon', { min: -180, max: 180 });
  const cells = computeObservationCells({ lat, lon });
  const locationBasis = {
    kind: 'claim_geocode',
    basis: stringValue(footprint.basis || footprint.location_basis || claim.location_basis || claim.locationBasis) || (point.geocoded ? 'geocoder' : 'explicit_coordinates'),
    label: stringValue(footprint.label || footprint.place || footprint.address || claim.location_text || claim.locationText),
    accuracy_meters: footprint.accuracy_meters ?? footprint.accuracyMeters ?? null,
    geocoder: point.geocoded?.provider || point.geocoded?.geocoder || null,
  };

  return {
    claim_ref: claimRef,
    text: stringValue(claim.text),
    claimed_observable: claimedObservable,
    search_terms: compactStrings(valueFor(claim, 'search_terms', 'searchTerms')),
    time: normalizeClaimTime(claim),
    outcome_resolution: valueFor(claim, 'outcome_resolution', 'outcomeResolution') || null,
    footprint: {
      coordinates: { lat, lon },
      cells,
      location_basis: locationBasis,
    },
  };
}

function sourceTermsAllowed(rawSource, source) {
  const explicitFlags = [
    rawSource?.claim_validation_allowed,
    rawSource?.claimValidationAllowed,
    rawSource?.terms_claim_validation_allowed,
    rawSource?.termsClaimValidationAllowed,
    rawSource?.terms?.claim_validation_allowed,
    rawSource?.terms?.claimValidationAllowed,
    rawSource?.provenance?.claim_validation_allowed,
    rawSource?.provenance?.claimValidationAllowed,
  ];
  if (explicitFlags.some((flag) => flag === false)) {
    return { allowed: false, caveat: 'green_source_terms_blocked' };
  }
  const text = [
    rawSource?.terms_summary,
    rawSource?.termsSummary,
    rawSource?.terms?.summary,
    rawSource?.provenance?.terms_summary,
    source?.terms_summary,
  ].map((value) => String(value ?? '').toLowerCase()).join('\n');
  if (/claim validation.*prohibited|automated (?:event|claim).*prohibited|no automated (?:event|claim)|not for (?:event|claim) validation|validation prohibited/.test(text)) {
    return { allowed: false, caveat: 'green_source_terms_blocked' };
  }
  return { allowed: true, caveat: null };
}

function sourceFreshness(source, nowDate, maxSourceAgeSeconds) {
  const status = String(source.freshness_status || 'unknown').toLowerCase();
  if (STALE_FRESHNESS.has(status)) return { usable: false, caveat: 'green_source_stale', age_seconds: null };
  if (!source.last_checked_at) return { usable: true, caveat: 'green_source_freshness_unknown', age_seconds: null };
  const checked = new Date(source.last_checked_at);
  if (Number.isNaN(checked.getTime())) return { usable: false, caveat: 'green_source_stale', age_seconds: null };
  const ageSeconds = Math.max(0, Math.floor((nowDate.getTime() - checked.getTime()) / 1000));
  const sourceLimit = Math.max(1, Number(source.cache_ttl_seconds || maxSourceAgeSeconds) * 4);
  const ageLimit = Math.min(maxSourceAgeSeconds, sourceLimit);
  if (ageSeconds > ageLimit) return { usable: false, caveat: 'green_source_stale', age_seconds: ageSeconds };
  return { usable: true, caveat: null, age_seconds: ageSeconds };
}

function sourceUptime(source) {
  const status = String(source.uptime_status || 'unknown').toLowerCase();
  if (BAD_UPTIME.has(status)) return { usable: false, caveat: 'green_source_unavailable' };
  return { usable: true, caveat: status === 'unknown' ? 'green_source_uptime_unknown' : null };
}

function termMatchesForClaim(claim, source) {
  const terms = compactStrings([
    ...claim.search_terms,
    ...String(claim.claimed_observable || '').split(/[^a-z0-9]+/i).filter((term) => term.length >= 4),
  ]).map((term) => term.toLowerCase());
  if (!terms.length) return [];
  const sourceText = [
    source.name,
    source.provider,
    source.owner_publisher,
    source.terms_summary,
    source.provenance?.terms_summary,
  ].map((value) => String(value ?? '').toLowerCase()).join('\n');
  return terms.filter((term) => sourceText.includes(term));
}

function rejectedStatusFrom(rejectedCandidates) {
  const reasons = rejectedCandidates.map((candidate) => candidate.reason);
  if (reasons.includes('source_terms_blocked')) return 'source_terms_blocked';
  if (reasons.includes('stale_source')) return 'stale_source';
  if (reasons.includes('source_unavailable')) return 'source_unavailable';
  return 'no_source';
}

function noSourceCaveats(status, rejectedCandidates) {
  const caveats = ['no_usable_green_source'];
  if (status === 'no_source') caveats.push('no_green_source');
  if (status === 'stale_source') caveats.push('green_source_stale');
  if (status === 'source_terms_blocked') caveats.push('green_source_terms_blocked');
  if (status === 'source_unavailable') caveats.push('green_source_unavailable');
  for (const rejected of rejectedCandidates) {
    if (rejected.caveat) caveats.push(rejected.caveat);
  }
  return compactStrings(caveats);
}

export function rankClaimGreenfeedCandidates({ claim, footprint, sources = [], now = new Date(), limit = 10, maxSourceAgeSeconds = DEFAULT_MAX_SOURCE_AGE_SECONDS } = {}) {
  const nowDate = normalizeNow(now);
  const rejectedCandidates = [];
  const eligible = [];
  for (const rawSource of sources || []) {
    let source;
    try {
      source = normalizeGreenfeedSource(rawSource);
    } catch (error) {
      rejectedCandidates.push({
        source_key: rawSource?.source_key || rawSource?.sourceKey || rawSource?.id || null,
        reason: 'invalid_source',
        caveat: 'green_source_invalid',
        error: error.message,
      });
      continue;
    }

    const terms = sourceTermsAllowed(rawSource, source);
    if (!terms.allowed) {
      rejectedCandidates.push({ source_key: source.source_key, source_ref: `greenfeed:${source.source_key}`, reason: 'source_terms_blocked', caveat: terms.caveat });
      continue;
    }
    const freshness = sourceFreshness(source, nowDate, maxSourceAgeSeconds);
    if (!freshness.usable) {
      rejectedCandidates.push({ source_key: source.source_key, source_ref: `greenfeed:${source.source_key}`, reason: 'stale_source', caveat: freshness.caveat, age_seconds: freshness.age_seconds });
      continue;
    }
    const uptime = sourceUptime(source);
    if (!uptime.usable) {
      rejectedCandidates.push({ source_key: source.source_key, source_ref: `greenfeed:${source.source_key}`, reason: 'source_unavailable', caveat: uptime.caveat });
      continue;
    }
    eligible.push({ source, freshness, uptime, rawSource });
  }

  const rankedBase = rankGreenfeedSourcesForClaim({
    lat: footprint.coordinates.lat,
    lon: footprint.coordinates.lon,
    sources: eligible.map((candidate) => candidate.source),
    limit: Math.max(1, Number.parseInt(String(limit), 10) || 10),
    now: nowDate,
  });
  const eligibleByKey = new Map(eligible.map((candidate) => [candidate.source.source_key, candidate]));
  const ranked_candidates = rankedBase.map((candidate) => {
    const metadata = eligibleByKey.get(candidate.source_key) || {};
    const termMatches = termMatchesForClaim(claim, candidate);
    const termScore = termMatches.length ? 1 : 0.4;
    const uptimeScore = candidate.uptime_status === 'nominal' ? 1 : 0.7;
    const freshnessScore = metadata.freshness?.caveat ? 0.75 : 1;
    const score = Number(Math.min(1, (
      (candidate.claim_validation_score * 0.84)
      + (termScore * 0.05)
      + (uptimeScore * 0.06)
      + (freshnessScore * 0.05)
    )).toFixed(6));
    const caveats = compactStrings([
      ...(candidate.ranking_caveats || []),
      metadata.freshness?.caveat,
      metadata.uptime?.caveat,
      candidate.within_declared_fov === false ? 'claim_outside_declared_fov' : null,
    ]);
    return {
      ...candidate,
      source_ref: `greenfeed:${candidate.source_key}`,
      term_matches: termMatches,
      claim_validation_score: score,
      ranking_basis: {
        distance_meters: candidate.distance_meters,
        freshness_status: candidate.freshness_status,
        age_seconds: metadata.freshness?.age_seconds ?? null,
        terms_allowed: true,
        term_matches: termMatches,
        angle_delta_degrees: candidate.angle_delta_degrees,
        within_declared_fov: candidate.within_declared_fov,
        uptime_status: candidate.uptime_status,
        source_quality_score: candidate.source_quality_score,
      },
      ranking_caveats: caveats,
    };
  }).sort((a, b) => (b.claim_validation_score - a.claim_validation_score) || (a.distance_meters - b.distance_meters));

  return { ranked_candidates, rejected_candidates: rejectedCandidates };
}

function noSourcePacket({ claim, lookupStatus, rejectedCandidates, footprint, nowDate, idFactory, store }) {
  const caveats = noSourceCaveats(lookupStatus, rejectedCandidates);
  const packet = {
    id: idFactory(),
    session_id: null,
    observed_at: nowDate.toISOString(),
    recorded_at: nowDate.toISOString(),
    claim_ref: claim.claim_ref,
    source_ref: null,
    source_class: null,
    location_basis: clone(footprint.location_basis),
    visible_summary: lookupStatus === 'no_source'
      ? 'No Green source found for claim footprint; Mosaic remains unsighted for this event.'
      : 'No usable Green source could be opened for claim validation; Mosaic remains unsighted for this event.',
    not_visible_notes: ['No direct sight was attempted because no eligible Green source was available.'],
    confidence: 'low',
    caveats,
    evidence_links: [],
    effect_on_claim: 'inconclusive',
    retention_policy: {
      read_only: true,
      green_only: true,
      raw_frame_retention: 'none',
      pii_redaction_required: true,
    },
  };
  store?.saveObservation?.(packet);
  return packet;
}

function findActiveSession(store, source) {
  return store?.findActiveSessionBySource?.({
    state: 'greenfeed_jack_in',
    source_ref: `greenfeed:${source.source_key}`,
    source_class: source.source_class,
  }) || null;
}

function feedLocationBasis(source, nowDate) {
  return {
    kind: 'feed_coordinates',
    lat: source.lat,
    lon: source.lon,
    accuracy_meters: null,
    heading_degrees: Number.isFinite(source.view?.heading_degrees) ? source.view.heading_degrees : null,
    map_context: `${source.name} (${source.provider})`,
    feed_id: source.source_key,
    publisher: source.owner_publisher,
    observed_at: nowDate.toISOString(),
  };
}

function startOrReuseGreenfeedSession({ store, source, nowDate, idFactory }) {
  const existing = findActiveSession(store, source);
  if (existing) return { session: existing, action: 'reused' };

  const result = handleSensoriumSessionRequest({
    body: {
      action: 'start',
      state: 'greenfeed_jack_in',
      source_ref: `greenfeed:${source.source_key}`,
      source_class: source.source_class,
      location_basis: feedLocationBasis(source, nowDate),
      retention_policy: { raw_frame_retention: 'none', pii_redaction_required: true },
    },
    now: () => nowDate,
    store,
    identity: { clientType: 'operator_admin', scopes: ['*'] },
    idFactory,
  });
  if (!result.ok) throw validationError(result.code || 'sensorium_session_failed', result.message || 'Could not create greenfeed_jack_in session.', result.statusCode || 400);
  return { session: result.body.session, action: 'created' };
}

function hasDeclaredAngle(source) {
  return Number.isFinite(source.view?.heading_degrees) && Number.isFinite(source.view?.fov_degrees);
}

function normalizeAdapterObservation(adapterObservation, { claim, source }) {
  const observation = isPlainObject(adapterObservation) ? adapterObservation : {};
  const noSummary = !stringValue(valueFor(observation, 'visible_summary', 'visibleSummary'));
  const effect = stringValue(valueFor(observation, 'effect_on_claim', 'effectOnClaim')) || 'inconclusive';
  const confidence = stringValue(observation.confidence) || 'low';
  return {
    observed_at: isoString(valueFor(observation, 'observed_at', 'observedAt')),
    visible_summary: noSummary
      ? `Green source ${source.name} was selected, but this run did not capture a live visual summary; no sight claim is made.`
      : stringValue(valueFor(observation, 'visible_summary', 'visibleSummary')),
    not_visible_notes: compactStrings(valueFor(observation, 'not_visible_notes', 'notVisibleNotes')).length
      ? compactStrings(valueFor(observation, 'not_visible_notes', 'notVisibleNotes'))
      : ['Live view was not available to this orchestration step; claim remains unresolved by direct sight.'],
    confidence: CONFIDENCE.has(confidence) ? confidence : 'low',
    effect_on_claim: EFFECT_ON_CLAIM.has(effect) ? effect : 'inconclusive',
    caveats: compactStrings([
      ...(compactStrings(valueFor(observation, 'caveats'))),
      noSummary ? 'no_direct_visual_summary' : null,
      `claimed_observable:${claim.claimed_observable}`,
    ]),
    evidence_links: compactStrings(valueFor(observation, 'evidence_links', 'evidenceLinks')),
  };
}

async function createDirectObservationPacket({ claim, source, candidate, footprint, session, nowDate, store, idFactory, observationAdapter }) {
  const adapterObservation = observationAdapter
    ? await observationAdapter({ claim: clone(claim), source: clone(source), candidate: clone(candidate), footprint: clone(footprint), session: clone(session), now: nowDate })
    : null;
  const normalized = normalizeAdapterObservation(adapterObservation, { claim, source });
  const caveats = compactStrings([
    'read_only_greenfeed_jack_in',
    'raw_frame_retention_none',
    'pii_redaction_required',
    hasDeclaredAngle(source) ? 'single_greenfeed_angle' : 'greenfeed_angle_unavailable',
    candidate.within_declared_fov === false ? 'claim_outside_declared_fov' : null,
    ...(candidate.ranking_caveats || []),
    ...normalized.caveats,
  ]);
  const body = {
    session_id: session.id,
    observed_at: normalized.observed_at || nowDate.toISOString(),
    claim_ref: claim.claim_ref,
    source_ref: `greenfeed:${source.source_key}`,
    source_class: source.source_class,
    location_basis: feedLocationBasis(source, nowDate),
    visible_summary: normalized.visible_summary,
    not_visible_notes: normalized.not_visible_notes,
    confidence: normalized.confidence,
    caveats,
    evidence_links: compactStrings([source.feed_url, ...normalized.evidence_links]),
    effect_on_claim: normalized.effect_on_claim,
    retention_policy: { raw_frame_retention: 'none', pii_redaction_required: true },
  };
  const result = handleDirectObservationRequest({ body, now: () => nowDate, store, idFactory });
  if (!result.ok) throw validationError(result.code || 'direct_observation_failed', result.message || 'Could not create DirectObservationPacket.', result.statusCode || 400);
  return result.body.observation;
}

function memoryEvents({ claim, footprint, packet, lookup, selectedSource, nowDate }) {
  const caveats = compactStrings(packet.caveats || []);
  const base = {
    claim_ref: claim.claim_ref,
    observed_at: packet.observed_at,
    recorded_at: nowDate.toISOString(),
    effect_on_claim: packet.effect_on_claim,
    caveats,
    direct_observation_id: packet.id,
    session_id: packet.session_id,
    source_ref: packet.source_ref,
    source_class: packet.source_class,
    claim_footprint: clone(footprint),
    greenfeed_lookup: {
      status: lookup.status,
      selected_source_key: selectedSource?.source_key || null,
      rejected_count: lookup.rejected_candidates.length,
    },
  };
  return [
    {
      lane: 'mosaic',
      event_type: 'direct_observation_truth_update',
      payload: {
        ...base,
        truth_update: {
          visible_summary: packet.visible_summary,
          not_visible_notes: packet.not_visible_notes,
          confidence: packet.confidence,
        },
      },
    },
    {
      lane: 'murmurs',
      event_type: 'direct_observation_perception_update',
      payload: {
        ...base,
        perception_update: {
          claimed_observable: claim.claimed_observable,
          public_claim_text: claim.text,
          effect_on_claim: packet.effect_on_claim,
        },
      },
    },
    {
      lane: 'delta',
      event_type: 'perceptual_delta_direct_observation',
      payload: {
        ...base,
        delta_basis: {
          direct_observation_id: packet.id,
          claim_ref: claim.claim_ref,
          effect_on_claim: packet.effect_on_claim,
          caveats,
        },
      },
    },
  ];
}

function calibrationUpdate(claim, packet) {
  const resolution = claim.outcome_resolution;
  if (!isPlainObject(resolution)) return { available: false, reason: 'outcome_resolution_missing' };
  const resolvedEffect = stringValue(valueFor(resolution, 'effect_on_claim', 'effectOnClaim') || valueFor(resolution, 'resolved_effect_on_claim', 'resolvedEffectOnClaim'));
  if (!EFFECT_ON_CLAIM.has(resolvedEffect)) return { available: false, reason: 'resolved_effect_on_claim_missing' };
  return {
    available: true,
    outcome_ref: stringValue(valueFor(resolution, 'outcome_ref', 'outcomeRef')),
    resolved_at: isoString(valueFor(resolution, 'resolved_at', 'resolvedAt')),
    observed_effect_on_claim: packet.effect_on_claim,
    resolved_effect_on_claim: resolvedEffect,
    improved_calibration: packet.effect_on_claim === resolvedEffect,
    basis: packet.effect_on_claim === resolvedEffect
      ? 'direct_observation_effect_matched_resolution'
      : 'direct_observation_effect_diverged_from_resolution',
  };
}

export async function validateClaimWithGreenfeeds(options = {}) {
  const {
    claim: rawClaim,
    sources = null,
    now = new Date(),
    geocoder = null,
    store = createInMemorySensoriumStore(),
    idFactory = randomUUID,
    observationAdapter = null,
    maxSourceAgeSeconds = DEFAULT_MAX_SOURCE_AGE_SECONDS,
    limit = 10,
  } = options;
  const nowDate = normalizeNow(now);
  const claim = await normalizeClaimForValidation(rawClaim, { geocoder });
  const sourceCatalog = sources === null ? loadSeedGreenfeedCatalog() : sources;
  const { ranked_candidates, rejected_candidates } = rankClaimGreenfeedCandidates({
    claim,
    footprint: claim.footprint,
    sources: sourceCatalog,
    now: nowDate,
    limit,
    maxSourceAgeSeconds,
  });

  if (ranked_candidates.length === 0) {
    const status = rejected_candidates.length ? rejectedStatusFrom(rejected_candidates) : 'no_source';
    const packet = noSourcePacket({ claim, lookupStatus: status, rejectedCandidates: rejected_candidates, footprint: claim.footprint, nowDate, idFactory, store });
    const lookup = { status, ranked_candidates, rejected_candidates };
    const events = memoryEvents({ claim, footprint: claim.footprint, packet, lookup, selectedSource: null, nowDate });
    return {
      ok: true,
      status: 'inconclusive',
      claim_ref: claim.claim_ref,
      claim_footprint: clone(claim.footprint),
      greenfeed_lookup: lookup,
      session: null,
      session_action: null,
      direct_observation_packet: packet,
      memory_events: events,
      calibration_update: calibrationUpdate(claim, packet),
    };
  }

  const selected = ranked_candidates[0];
  const { session, action } = startOrReuseGreenfeedSession({ store, source: selected, nowDate, idFactory });
  const packet = await createDirectObservationPacket({
    claim,
    source: selected,
    candidate: selected,
    footprint: claim.footprint,
    session,
    nowDate,
    store,
    idFactory,
    observationAdapter,
  });
  const lookup = {
    status: 'source_selected',
    selected_source_key: selected.source_key,
    selected_source_ref: selected.source_ref,
    ranked_candidates,
    rejected_candidates,
  };
  const events = memoryEvents({ claim, footprint: claim.footprint, packet, lookup, selectedSource: selected, nowDate });
  return {
    ok: true,
    status: 'observed',
    claim_ref: claim.claim_ref,
    claim_footprint: clone(claim.footprint),
    greenfeed_lookup: lookup,
    session,
    session_action: action,
    direct_observation_packet: packet,
    memory_events: events,
    calibration_update: calibrationUpdate(claim, packet),
  };
}

export async function handleClaimValidationRequest({ body, now = new Date(), store, sources, idFactory = randomUUID, observationAdapter, geocoder } = {}) {
  try {
    const validation = await validateClaimWithGreenfeeds({
      claim: valueFor(body, 'claim') || body,
      sources: body?.sources || sources,
      now: typeof now === 'function' ? now() : now,
      store,
      idFactory,
      observationAdapter,
      geocoder,
      maxSourceAgeSeconds: body?.max_source_age_seconds || body?.maxSourceAgeSeconds || DEFAULT_MAX_SOURCE_AGE_SECONDS,
      limit: body?.limit || 10,
    });
    return { ok: true, statusCode: 200, body: { ok: true, validation } };
  } catch (error) {
    return {
      ok: false,
      statusCode: error.statusCode || 400,
      code: error.code || 'claim_validation_failed',
      message: error.message || 'Claim validation failed.',
    };
  }
}

export const claimValidationDefaults = Object.freeze({
  DEFAULT_MAX_SOURCE_AGE_SECONDS,
});
