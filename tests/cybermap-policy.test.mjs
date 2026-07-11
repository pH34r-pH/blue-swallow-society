import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createEmptyCybermapState,
  parseCybermapViewportPayload,
} from '../app/cybermap.mjs';
import { handleCybermapReadRequest } from '../vm/cybermap-api/cybermap-read.mjs';
import { validateClaimWithGreenfeeds } from '../vm/cybermap-api/claim-validation.mjs';
import { normalizeObservationBatch } from '../vm/cybermap-api/observation-ingest.mjs';
import { createPublicRateLimiter } from '../vm/cybermap-api/rate-limit.mjs';
import { normalizeGreenfeedSource } from '../vm/cybermap-worker/greenfeeds/catalog.mjs';

const NOW = '2026-07-10T12:00:00.000Z';
const OWNED_SOURCE_ID = '00000000-0000-4000-8000-000000000001';
const ORANGE_SOURCE_ID = '00000000-0000-4000-8000-000000000002';
const GREEN_SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const BBOX = '-122.45,47.55,-122.25,47.70';

function makeObservation(overrides = {}) {
  return {
    external_observation_key: 'policy-suite:2026-07-10T115900Z:001',
    idempotency_key: 'policy-suite-item-001',
    kind: 'wifi_ap',
    observed_at: '2026-07-10T11:59:00.000Z',
    lat: 47.6205,
    lon: -122.3493,
    confidence: 0.8,
    pii_status: 'redacted',
    retention_class: 'summary_only',
    payload: { ssid_hash: 'sha256:ssid-redacted', bssid_hash: 'sha256:bssid-redacted' },
    provenance: { sensor: 'policy-regression' },
    ...overrides,
  };
}

function makeBatch({ sourceId = OWNED_SOURCE_ID, sourceClass = 'owned_device', observations = [makeObservation()], overrides = {} } = {}) {
  return {
    source_id: sourceId,
    source_class: sourceClass,
    client_id: 'policy-suite-client',
    provenance: { adapter: 'policy-regression', chain: ['test-only'] },
    observations,
    ...overrides,
  };
}

function normalizePolicyBatch(body, { tokenId = 'policy-token', headers = { 'idempotency-key': 'policy-suite-batch-001' } } = {}) {
  return normalizeObservationBatch({
    headers,
    body,
    identity: { tokenId, scopes: ['observations:write'] },
    now: new Date(NOW),
  });
}

function makeGreenfeedSource(overrides = {}) {
  return {
    source_id: GREEN_SOURCE_ID,
    source_key: 'public-seattle-feed',
    name: 'Public Seattle event feed',
    source_class: 'green_public',
    provider: 'city-open-data',
    owner_publisher: 'City of Seattle',
    feed_url: 'https://public.example.test/events.json',
    terms_url: 'https://public.example.test/terms',
    terms_summary: 'Public open-data feed permits automated event/claim validation with attribution.',
    lat: 47.6205,
    lon: -122.3493,
    cache_ttl_seconds: 300,
    update_cadence_seconds: 300,
    enabled: true,
    allowed_preload: true,
    persistent_jack_in_allowed: true,
    retains_raw_payload: false,
    freshness_status: 'fresh',
    uptime_status: 'nominal',
    last_checked_at: '2026-07-10T11:59:00.000Z',
    source_quality_score: 0.9,
    view: {
      mode: 'public_fixed_camera_metadata',
      heading_degrees: 180,
      fov_degrees: 65,
      angle_quality: 'declared',
    },
    ...overrides,
  };
}

function makeClaim(claimRef = 'claim:policy-suite') {
  return {
    claim_ref: claimRef,
    claimed_observable: 'public lane closure sign visible near Space Needle',
    search_terms: ['lane closure', 'space needle'],
    footprint: {
      lat: 47.6205,
      lon: -122.3493,
      label: 'Space Needle',
    },
    time: { claimed_at: NOW },
  };
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

function assertNoUnsafeResponseMaterial(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /service[_-]?token|api[_-]?key|database[_-]?url|db[_-]?password|postgres:\/\/|raw[_-]?frame|raw[_-]?image|raw[_-]?payload|s3:\/\/private-frame/i);
}

test('production Godeye empty or unavailable Cybermap backends never synthesize demo cells', () => {
  const unavailable = parseCybermapViewportPayload(null);
  const empty = parseCybermapViewportPayload({
    ok: true,
    state: 'empty',
    cells: [],
    caveats: [{ code: 'backend_empty', message: 'No materialized cells exist for this viewport.' }],
    generated_at: NOW,
  });
  const explicit = createEmptyCybermapState({ reason: 'backend_unavailable', message: 'backend down' });

  for (const state of [unavailable, empty, explicit]) {
    assert.equal(state.ready, false);
    assert.deepEqual(state.cells, []);
    assert.doesNotMatch(JSON.stringify(state), /demo|fake|sample|CorpGuest|BSS-DeadDrop|WiGLE fixture/i);
  }
});

test('grey orange and red observations cannot globally preload without owned local or authorized trigger metadata', () => {
  assertThrowsCode(() => normalizePolicyBatch(makeBatch({
    sourceId: ORANGE_SOURCE_ID,
    sourceClass: 'orange_exposure',
    observations: [makeObservation({
      kind: 'claim_anchor',
      payload: { claim_ref: 'claim:orange-global-preload', summary: 'untriggered exposure attempt' },
      provenance: { sensor: 'enrichment-worker' },
    })],
    overrides: {
      context: { global_preload: true, requested_layer: 'exposure_enrichment' },
      provenance: { adapter: 'enrichment-worker', preload_mode: 'global' },
    },
  })), 'source_policy_forbidden');
});

function privateIpv4Url(a, b, c, d) {
  return `https://${[a, b, c, d].join('.')}/private-camera/feed.m3u8`;
}

function bracketedIpv6Url(literalParts) {
  const literal = Array.isArray(literalParts) ? literalParts.join('') : literalParts;
  return `https://${'['}${literal}${']'}/private-camera/feed.m3u8`;
}

test('Greenfeed catalog rejects private camera or feed URLs as persistent jack-in sources', () => {
  const forbiddenFeedUrls = [
    ['private IPv4', privateIpv4Url(192, 168, 1, 42)],
    ['IPv6 loopback', bracketedIpv6Url([':', ':1'])],
    ['IPv6 unspecified', bracketedIpv6Url([':', ':'])],
    ['IPv6 unique local fc00', bracketedIpv6Url(['fc00', ':', ':1'])],
    ['IPv6 unique local fd00', bracketedIpv6Url(['fd12', ':3456:', ':1'])],
    ['IPv6 link local', bracketedIpv6Url(['fe80', ':', ':1'])],
    ['IPv4-mapped private 10/8', bracketedIpv6Url([':', ':ffff:', [10, 0, 0, 1].join('.')])],
    ['IPv4-mapped private 172.16/12', bracketedIpv6Url([':', ':ffff:', [172, 16, 0, 1].join('.')])],
    ['IPv4-mapped private 192.168/16', bracketedIpv6Url([':', ':ffff:', [192, 168, 1, 42].join('.')])],
    ['IPv4-mapped loopback', bracketedIpv6Url([':', ':ffff:', [127, 0, 0, 1].join('.')])],
    ['IPv4-mapped link local', bracketedIpv6Url([':', ':ffff:', [169, 254, 1, 42].join('.')])],
    ['IPv4-mapped documentation range', bracketedIpv6Url([':', ':ffff:', [198, 51, 100, 10].join('.')])],
    ['IPv6 documentation range', bracketedIpv6Url(['2001', ':db8:', ':1'])],
    ['IPv6 multicast range', bracketedIpv6Url(['ff02', ':', ':1'])],
  ];

  for (const [label, feedUrl] of forbiddenFeedUrls) {
    assert.throws(() => normalizeGreenfeedSource(makeGreenfeedSource({
      source_key: `private-building-camera-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      feed_url: feedUrl,
      terms_url: 'https://public.example.test/private-camera-terms',
    })), /private|reserved|persistent|jack-in|feed_url/i, label);
  }
});

test('ingest rejects private person face and license-plate product entities by default', () => {
  for (const [label, payload] of [
    ['private person', { product_entities: [{ entity_kind: 'private-person', display_name: 'Jane Doe' }] }],
    ['face', { entities: [{ kind: 'face', stable_key: 'face:raw:001' }] }],
    ['license plate', { product_entities: [{ type: 'license-plate', value: 'ABC1234' }] }],
  ]) {
    assertThrowsCode(() => normalizePolicyBatch(makeBatch({
      observations: [makeObservation({
        external_observation_key: `policy-suite:${label}`,
        payload,
      })],
    })), 'unsafe_product_entity');
  }
});

test('read API responses omit service tokens DB credentials and raw visual frames by default', async () => {
  const pool = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      assert.match(text, /from cybermap_cells/i);
      assert.deepEqual(params[5], ['green_public']);
      return {
        rows: [{
          h3_cell: 'gh9:c23nb62w7',
          resolution: 9,
          geom: { type: 'Polygon', coordinates: [[[-122.4, 47.5], [-122.3, 47.5], [-122.3, 47.6], [-122.4, 47.6], [-122.4, 47.5]]] },
          updated_at: NOW,
          first_seen_at: '2026-07-10T11:40:00.000Z',
          last_seen_at: '2026-07-10T11:58:00.000Z',
          source_classes: ['green_public'],
          observation_count: 1,
          entity_count: 1,
          layers: {
            green_preload: {
              layer: 'green_preload',
              source_classes: ['green_public'],
              source_class_counts: { green_public: 1 },
              observations_by_kind: { greenfeed_snapshot: 1 },
              observation_count: 1,
              entity_count: 1,
              entities: [{ id: 'feed-1', entity_kind: 'feed', stable_key: 'greenfeed:public-seattle-feed', source_class: 'green_public' }],
              first_seen_at: '2026-07-10T11:40:00.000Z',
              last_seen_at: '2026-07-10T11:58:00.000Z',
              last_ingested_at: '2026-07-10T11:59:00.000Z',
              service_token: 'vm-service-token-should-not-escape',
              raw_frame_ref: 's3://private-frame/capture.jpg',
              database_url: 'postgres://cybermap:secret@db.example.invalid/cybermap',
            },
          },
          counts: { observations_by_kind: { greenfeed_snapshot: 1 }, observations_by_source_class: { green_public: 1 }, entities_by_kind: { feed: 1 } },
          freshness: { last_observed_at: '2026-07-10T11:58:00.000Z', last_ingested_at: '2026-07-10T11:59:00.000Z' },
          caveats: [],
          salience: 0.5,
          confidence: 0.7,
          provenance: {
            materialized_by: 'policy-suite',
            service_token: 'vm-service-token-should-not-escape',
            db_password: 'secret',
            raw_frame: 'base64-private-frame',
          },
        }],
      };
    },
    async end() {},
  };

  const response = await handleCybermapReadRequest({
    method: 'GET',
    pathname: '/api/v1/cybermap/viewport',
    searchParams: new URLSearchParams({ bbox: BBOX, zoom: '12', layers: 'green_preload' }),
    identity: { tokenId: 'green-reader', scopes: ['cybermap:read'], sourceClasses: ['green_public'], sourceIds: [OWNED_SOURCE_ID] },
    env: { CYBERMAP_DATABASE_URL: 'postgres://redacted@example.invalid/cybermap' },
    dbPoolFactory: async () => pool,
    now: new Date(NOW),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assertNoUnsafeResponseMaterial(response.body);
});

test('Wardriver RaID fixture stays owned/local before nearby enrichment can be returned', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/wardriver-raid-batch-v1.json', import.meta.url), 'utf8'));
  const batch = normalizePolicyBatch(fixture.body, {
    tokenId: 'wardriver-alpha',
    headers: { 'idempotency-key': fixture.request.headers['Idempotency-Key'] },
  });

  assert.equal(batch.contractVersion, 'bss.wardriver.batch.v1');
  assert.equal(batch.sourceClass, 'owned_device');
  assert.match(batch.sessionId, /^[0-9a-f-]{36}$/i);
  assert.ok(batch.context.raid?.session_ref, 'RaID batches must carry local session context');
  assert.ok(batch.observations.length > 0);
  for (const observation of batch.observations) {
    assert.equal(observation.sourceClass, 'owned_device');
    assert.equal(observation.sessionId, batch.sessionId);
    assert.doesNotMatch(JSON.stringify(observation), /orange_exposure|red_restricted|grey_enrichment|raw_frame":"|face_image|license_plate/i);
  }
});

test('read API rejects caller source-class spoofing and public rate limits ignore spoofed forwarded-for headers', async () => {
  const spoofedScope = await handleCybermapReadRequest({
    method: 'GET',
    pathname: '/api/v1/sources',
    searchParams: new URLSearchParams({ source_class: 'orange_exposure' }),
    identity: { tokenId: 'green-reader', scopes: ['cybermap:read'], sourceClasses: ['green_public'], sourceIds: [OWNED_SOURCE_ID] },
    env: {},
    dbPoolFactory: async () => assert.fail('spoofed source-class requests must fail before DB access'),
  });
  assert.equal(spoofedScope.statusCode, 403);
  assert.equal(spoofedScope.body.error.code, 'source_scope_forbidden');

  const limiter = createPublicRateLimiter({ readLimit: 1, readWindowMs: 60_000, now: () => new Date(NOW) });
  const first = limiter({
    method: 'GET',
    path: '/api/v1/cybermap/viewport',
    req: { headers: { 'x-forwarded-for': '198.51.100.10' }, socket: { remoteAddress: '203.0.113.7' } },
  });
  const second = limiter({
    method: 'GET',
    path: '/api/v1/cybermap/viewport',
    req: { headers: { 'x-forwarded-for': '198.51.100.200' }, socket: { remoteAddress: '203.0.113.7' } },
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.code, 'rate_limited');
});

test('claim validation emits no-source stale-source and one-angle caveats instead of proof claims', async () => {
  const noSource = await validateClaimWithGreenfeeds({
    claim: makeClaim('claim:no-source'),
    sources: [],
    now: new Date(NOW),
    idFactory: () => 'packet-no-source',
  });
  assert.equal(noSource.status, 'inconclusive');
  assert.deepEqual(noSource.session, null);
  assert.ok(noSource.direct_observation_packet.caveats.includes('no_usable_green_source'));
  assert.ok(noSource.direct_observation_packet.caveats.includes('no_green_source'));

  const stale = await validateClaimWithGreenfeeds({
    claim: makeClaim('claim:stale-source'),
    sources: [makeGreenfeedSource({ last_checked_at: '2026-07-10T09:00:00.000Z', freshness_status: 'fresh' })],
    now: new Date(NOW),
    maxSourceAgeSeconds: 60,
    idFactory: () => 'packet-stale-source',
  });
  assert.equal(stale.greenfeed_lookup.status, 'stale_source');
  assert.ok(stale.direct_observation_packet.caveats.includes('green_source_stale'));

  let sequence = 0;
  const oneAngle = await validateClaimWithGreenfeeds({
    claim: makeClaim('claim:one-angle'),
    sources: [makeGreenfeedSource()],
    now: new Date(NOW),
    idFactory: () => `policy-id-${++sequence}`,
    observationAdapter: async () => ({
      visible_summary: 'A public camera angle shows a lane-closure sign candidate; human review still required.',
      not_visible_notes: ['Only one public camera angle was checked.'],
      confidence: 'medium',
      effect_on_claim: 'supports',
      caveats: ['operator_review_required'],
    }),
  });
  const packet = oneAngle.direct_observation_packet;
  assert.equal(oneAngle.status, 'observed');
  assert.equal(packet.effect_on_claim, 'supports');
  assert.ok(packet.caveats.includes('single_greenfeed_angle'));
  assert.ok(packet.caveats.includes('raw_frame_retention_none'));
  assert.doesNotMatch(JSON.stringify(packet), /proof|proved|confirmed|debunked|raw_frame_ref|raw_image|face_image|license_plate/i);
});
