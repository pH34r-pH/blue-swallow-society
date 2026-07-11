import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const NOW = new Date('2026-07-10T18:00:00.000Z');

const BASE_CLAIM = Object.freeze({
  claim_ref: 'claim:large-protest-near-pioneer-square',
  text: 'Large protest forming near Pioneer Square by 18:00.',
  claimed_observable: 'large visible crowd or protest forming',
  search_terms: ['protest', 'crowd', 'Pioneer Square'],
  footprint: {
    lat: 47.6019,
    lon: -122.3336,
    label: 'Pioneer Square, Seattle',
    basis: 'operator_geocode',
    accuracy_meters: 75,
  },
  time: {
    claimed_at: '2026-07-10T17:55:00.000Z',
    window_start: '2026-07-10T17:50:00.000Z',
    window_end: '2026-07-10T18:10:00.000Z',
  },
});

function greenSource(overrides = {}) {
  return {
    source_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    source_key: 'green:seattle:pioneer-square-east',
    name: 'Pioneer Square East Greenfeed',
    provider: 'Seattle DOT public camera index',
    owner_publisher: 'City of Seattle',
    source_class: 'green_public',
    feed_url: 'https://example.invalid/greenfeeds/pioneer-square-east.json',
    terms_url: 'https://example.invalid/terms/public-camera',
    terms_summary: 'Intentional public traffic feed; summary-only event validation allowed.',
    lat: 47.602,
    lon: -122.333,
    cache_ttl_seconds: 300,
    update_cadence_seconds: 60,
    last_checked_at: '2026-07-10T17:59:10.000Z',
    freshness_status: 'fresh',
    uptime_status: 'nominal',
    source_quality_score: 0.92,
    allowed_preload: true,
    persistent_jack_in_allowed: true,
    retains_raw_payload: false,
    view: {
      mode: 'fixed_visual_camera',
      heading_degrees: 95,
      fov_degrees: 70,
      angle_quality: 'declared',
    },
    provenance: {
      terms_summary: 'Intentional public traffic feed; summary-only event validation allowed.',
      publication_basis: 'intentional_public_or_authorized_feed',
      no_private_camera_probing: true,
      no_raw_payload_retention: true,
      claim_validation_allowed: true,
    },
    ...overrides,
  };
}

function sequentialIds(...ids) {
  const queue = [...ids];
  return () => queue.shift() || `generated-${queue.length}`;
}

function request(server, options = {}) {
  const address = server.address();
  const body = options.body || '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: {
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode,
          text,
          json: text ? JSON.parse(text) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('claim validation maps a geospatial claim footprint to Cybermap cells and returns inconclusive no-source caveats', async () => {
  const { validateClaimWithGreenfeeds } = await import('../vm/cybermap-api/claim-validation.mjs');

  const result = await validateClaimWithGreenfeeds({
    claim: BASE_CLAIM,
    sources: [],
    now: NOW,
    idFactory: sequentialIds('packet-no-source'),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'inconclusive');
  assert.equal(result.greenfeed_lookup.status, 'no_source');
  assert.equal(result.session, null);
  assert.equal(result.claim_ref, BASE_CLAIM.claim_ref);
  assert.equal(result.claim_footprint.location_basis.kind, 'claim_geocode');
  assert.equal(result.claim_footprint.location_basis.basis, 'operator_geocode');
  assert.equal(result.claim_footprint.coordinates.lat, BASE_CLAIM.footprint.lat);
  assert.equal(result.claim_footprint.coordinates.lon, BASE_CLAIM.footprint.lon);
  assert.match(result.claim_footprint.cells.h3_7, /^gh7:[0-9bcdefghjkmnpqrstuvwxyz]{7}$/);
  assert.match(result.claim_footprint.cells.h3_9, /^gh9:[0-9bcdefghjkmnpqrstuvwxyz]{9}$/);
  assert.match(result.claim_footprint.cells.h3_11, /^gh11:[0-9bcdefghjkmnpqrstuvwxyz]{11}$/);
  assert.equal(result.direct_observation_packet.effect_on_claim, 'inconclusive');
  assert.equal(result.direct_observation_packet.source_ref, null);
  assert.ok(result.direct_observation_packet.caveats.includes('no_green_source'));
  assert.match(result.direct_observation_packet.visible_summary, /No Green source found/);
  assert.doesNotMatch(result.direct_observation_packet.visible_summary, /shows|visible crowd|traffic/i);
});

test('claim validation rejects stale Greenfeed candidates rather than inventing sight', async () => {
  const { validateClaimWithGreenfeeds } = await import('../vm/cybermap-api/claim-validation.mjs');

  const result = await validateClaimWithGreenfeeds({
    claim: BASE_CLAIM,
    sources: [greenSource({ last_checked_at: '2026-07-10T17:00:00.000Z', cache_ttl_seconds: 60 })],
    now: NOW,
    idFactory: sequentialIds('packet-stale'),
  });

  assert.equal(result.status, 'inconclusive');
  assert.equal(result.greenfeed_lookup.status, 'stale_source');
  assert.equal(result.greenfeed_lookup.rejected_candidates[0].reason, 'stale_source');
  assert.ok(result.direct_observation_packet.caveats.includes('green_source_stale'));
  assert.equal(result.direct_observation_packet.effect_on_claim, 'inconclusive');
  assert.equal(result.session, null);
});

test('claim validation blocks candidates whose source terms disallow claim validation', async () => {
  const { validateClaimWithGreenfeeds } = await import('../vm/cybermap-api/claim-validation.mjs');

  const result = await validateClaimWithGreenfeeds({
    claim: BASE_CLAIM,
    sources: [greenSource({
      terms_claim_validation_allowed: false,
      terms_summary: 'Public view only; automated event or claim validation is prohibited by source terms.',
      provenance: {
        terms_summary: 'Public view only; automated event or claim validation is prohibited by source terms.',
        claim_validation_allowed: false,
      },
    })],
    now: NOW,
    idFactory: sequentialIds('packet-terms'),
  });

  assert.equal(result.status, 'inconclusive');
  assert.equal(result.greenfeed_lookup.status, 'source_terms_blocked');
  assert.equal(result.greenfeed_lookup.rejected_candidates[0].reason, 'source_terms_blocked');
  assert.ok(result.direct_observation_packet.caveats.includes('green_source_terms_blocked'));
  assert.equal(result.direct_observation_packet.effect_on_claim, 'inconclusive');
});

test('claim validation creates or reuses a greenfeed_jack_in session and caveated direct observation without raw frame retention', async () => {
  const { createInMemorySensoriumStore } = await import('../vm/cybermap-api/sensorium.mjs');
  const { validateClaimWithGreenfeeds } = await import('../vm/cybermap-api/claim-validation.mjs');
  const store = createInMemorySensoriumStore();

  const first = await validateClaimWithGreenfeeds({
    claim: BASE_CLAIM,
    sources: [greenSource()],
    now: NOW,
    store,
    idFactory: sequentialIds('session-green-1', 'obs-green-1'),
    observationAdapter: async ({ claim, source }) => ({
      observed_at: '2026-07-10T17:59:30.000Z',
      visible_summary: `${source.name} summary weakens ${claim.claimed_observable}: normal vehicle flow, no visible crowd in frame.`,
      not_visible_notes: ['single camera angle excludes adjacent sidewalks', 'feed may lag by one update interval'],
      confidence: 'medium',
      effect_on_claim: 'weakens',
      caveats: ['operator summary only; no raw frames retained'],
      evidence_links: [source.feed_url],
    }),
  });

  assert.equal(first.status, 'observed');
  assert.equal(first.greenfeed_lookup.status, 'source_selected');
  assert.equal(first.session.state, 'greenfeed_jack_in');
  assert.equal(first.session.policy.green_only, true);
  assert.equal(first.session.policy.raw_frame_retention, 'none');
  assert.equal(first.direct_observation_packet.session_id, 'session-green-1');
  assert.equal(first.direct_observation_packet.id, 'obs-green-1');
  assert.equal(first.direct_observation_packet.source_class, 'green_public');
  assert.equal(first.direct_observation_packet.effect_on_claim, 'weakens');
  assert.equal(first.direct_observation_packet.confidence, 'medium');
  assert.ok(first.direct_observation_packet.caveats.includes('single_greenfeed_angle'));
  assert.ok(first.direct_observation_packet.caveats.includes('read_only_greenfeed_jack_in'));
  assert.equal(first.direct_observation_packet.retention_policy.raw_frame_retention, 'none');
  assert.equal(first.direct_observation_packet.retention_policy.pii_redaction_required, true);
  assert.doesNotMatch(JSON.stringify(first), /raw_payload_ref|rawFrames|image_data|private_visual_details/i);

  const second = await validateClaimWithGreenfeeds({
    claim: { ...BASE_CLAIM, claim_ref: 'claim:follow-up' },
    sources: [greenSource()],
    now: NOW,
    store,
    idFactory: sequentialIds('obs-green-2'),
    observationAdapter: async () => ({
      visible_summary: 'The same Greenfeed view remains ordinary and does not show a large crowd.',
      not_visible_notes: ['single camera angle excludes adjacent sidewalks'],
      confidence: 'low',
      effect_on_claim: 'weakens',
      caveats: [],
    }),
  });

  assert.equal(second.session.id, 'session-green-1');
  assert.equal(second.session_action, 'reused');
  assert.equal(second.direct_observation_packet.session_id, 'session-green-1');
});

test('claim validation emits inconclusive packets without a visual summary and writes Mosaic/Murmurs/delta calibration payloads', async () => {
  const { validateClaimWithGreenfeeds } = await import('../vm/cybermap-api/claim-validation.mjs');

  const inconclusive = await validateClaimWithGreenfeeds({
    claim: BASE_CLAIM,
    sources: [greenSource()],
    now: NOW,
    idFactory: sequentialIds('session-green-2', 'obs-green-2'),
  });

  assert.equal(inconclusive.status, 'observed');
  assert.equal(inconclusive.direct_observation_packet.effect_on_claim, 'inconclusive');
  assert.ok(inconclusive.direct_observation_packet.caveats.includes('no_direct_visual_summary'));
  assert.match(inconclusive.direct_observation_packet.visible_summary, /did not capture a live visual summary/);
  assert.doesNotMatch(inconclusive.direct_observation_packet.visible_summary, /shows|visible crowd|normal vehicle flow/i);

  const calibrated = await validateClaimWithGreenfeeds({
    claim: {
      ...BASE_CLAIM,
      outcome_resolution: {
        outcome_ref: 'outcome:pioneer-square-crowd-size-resolved',
        resolved_at: '2026-07-10T19:00:00.000Z',
        effect_on_claim: 'weakens',
      },
    },
    sources: [greenSource()],
    now: NOW,
    idFactory: sequentialIds('session-green-3', 'obs-green-3'),
    observationAdapter: async () => ({
      visible_summary: 'The Greenfeed view shows normal traffic and no visible large crowd in the covered view.',
      not_visible_notes: ['coverage excludes side streets'],
      confidence: 'medium',
      effect_on_claim: 'weakens',
      caveats: ['single camera angle'],
    }),
  });

  assert.deepEqual(calibrated.memory_events.map((event) => event.lane), ['mosaic', 'murmurs', 'delta']);
  assert.equal(calibrated.memory_events[0].event_type, 'direct_observation_truth_update');
  assert.equal(calibrated.memory_events[0].payload.effect_on_claim, 'weakens');
  assert.equal(calibrated.memory_events[1].event_type, 'direct_observation_perception_update');
  assert.equal(calibrated.memory_events[1].payload.claim_ref, BASE_CLAIM.claim_ref);
  assert.equal(calibrated.memory_events[2].event_type, 'perceptual_delta_direct_observation');
  assert.equal(calibrated.memory_events[2].payload.delta_basis.direct_observation_id, 'obs-green-3');
  assert.ok(calibrated.memory_events.every((event) => event.payload.caveats.includes('single_greenfeed_angle')));
  assert.equal(calibrated.calibration_update.available, true);
  assert.equal(calibrated.calibration_update.observed_effect_on_claim, 'weakens');
  assert.equal(calibrated.calibration_update.resolved_effect_on_claim, 'weakens');
  assert.equal(calibrated.calibration_update.improved_calibration, true);
});

test('Cybermap API exposes claim validation orchestration as a scoped POST route', async () => {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const logs = [];
  const server = createCybermapApiServer({
    authTokens: ['test-token'],
    logger: (entry) => logs.push(entry),
    now: () => NOW,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await request(server, {
      method: 'POST',
      path: '/api/v1/claim-validation/greenfeeds',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        'X-Request-Id': 'req-claim-validation',
      },
      body: JSON.stringify({ claim: BASE_CLAIM, sources: [] }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.validation.status, 'inconclusive');
    assert.equal(response.json.validation.greenfeed_lookup.status, 'no_source');
    assert.equal(response.json.validation.direct_observation_packet.effect_on_claim, 'inconclusive');
    assert.ok(logs.some((entry) => entry.path === '/api/v1/claim-validation/greenfeeds' && entry.statusCode === 200));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
