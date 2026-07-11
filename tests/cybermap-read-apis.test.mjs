import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const FIXTURE_TOKEN = 'fixture';
const FIXTURE_SOURCE_ID = '00000000-0000-4000-8000-000000000001';
const ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const CELL_ID = 'gh9:c23nb62w7';
const BBOX = '-122.45,47.55,-122.25,47.70';
const NOW = '2026-07-10T12:00:00.000Z';

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
          headers: res.headers,
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

async function withServer({ tokenRecord = {}, pool, logger = () => {} } = {}, fn) {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const server = createCybermapApiServer({
    env: { CYBERMAP_DATABASE_URL: 'postgres://cybermap.example.invalid/app' },
    tokenRecords: [{
      tokenHash: hashToken(FIXTURE_TOKEN),
      tokenId: 'read-fixture',
      clientType: 'swa_proxy',
      scopes: ['cybermap:read'],
      sourceIds: [FIXTURE_SOURCE_ID],
      sourceClasses: ['green_public'],
      ...tokenRecord,
    }],
    dbPoolFactory: async () => pool,
    logger,
    now: () => new Date(NOW),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${FIXTURE_TOKEN}` };
}

function assertNoRawPii(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /raw_frame|raw-frames|raw_payload_ref|operator_approved_raw_ref|raw_pii|face_image|license_plate|\"ssid\"|\"bssid\"/i);
}

function makeCellRow(overrides = {}) {
  return {
    h3_cell: CELL_ID,
    resolution: 9,
    geom: { type: 'Polygon', coordinates: [[[-122.4, 47.5], [-122.3, 47.5], [-122.3, 47.6], [-122.4, 47.6], [-122.4, 47.5]]] },
    updated_at: '2026-07-10T11:59:00.000Z',
    first_seen_at: '2026-07-10T11:40:00.000Z',
    last_seen_at: '2026-07-10T11:58:00.000Z',
    source_classes: ['green_public', 'orange_exposure'],
    observation_count: 2,
    entity_count: 1,
    layers: {
      green_preload: {
        layer: 'green_preload',
        source_classes: ['green_public'],
        source_class_counts: { green_public: 1 },
        observations_by_kind: { greenfeed_snapshot: 1 },
        observation_count: 1,
        entity_count: 1,
        entities: [{ id: 'feed-1', stable_key: 'greenfeed:seattle-alerts', entity_kind: 'feed', source_class: 'green_public', source_classes: ['green_public'] }],
        first_seen_at: '2026-07-10T11:40:00.000Z',
        last_seen_at: '2026-07-10T11:40:00.000Z',
        last_ingested_at: '2026-07-10T11:41:00.000Z',
        global_preload: true,
      },
      exposure_enrichment: {
        layer: 'exposure_enrichment',
        source_classes: ['orange_exposure'],
        source_class_counts: { orange_exposure: 1 },
        observations_by_kind: { claim_anchor: 1 },
        observation_count: 1,
        entity_count: 1,
        entities: [{ id: 'claim-1', stable_key: 'claim:orange', entity_kind: 'claim', source_class: 'orange_exposure', source_classes: ['orange_exposure'] }],
        first_seen_at: '2026-07-10T11:58:00.000Z',
        last_seen_at: '2026-07-10T11:58:00.000Z',
        last_ingested_at: '2026-07-10T11:59:00.000Z',
        global_preload: false,
        gated: true,
        gated_by_source_class: {
          orange_exposure: {
            source_class: 'orange_exposure',
            authorized_scope_refs: ['scope://owned/orange'],
            observations_by_kind: { claim_anchor: 1 },
            first_seen_at: '2026-07-10T11:58:00.000Z',
            last_seen_at: '2026-07-10T11:58:00.000Z',
            last_ingested_at: '2026-07-10T11:59:00.000Z',
          },
        },
      },
    },
    counts: {
      observations_by_kind: { greenfeed_snapshot: 1, claim_anchor: 1 },
      observations_by_source_class: { green_public: 1, orange_exposure: 1 },
      entities_by_kind: { feed: 1, claim: 1 },
    },
    freshness: { updated_at: '2026-07-10T11:59:00.000Z', last_observed_at: '2026-07-10T11:58:00.000Z', age_seconds: 120, stale: false },
    caveats: [{ code: 'restricted_layer_requires_scope', severity: 'warning', source_classes: ['orange_exposure'], message: 'restricted fixture' }],
    salience: 2.5,
    provenance: { materialized_by: 'cybermap-worker/cell-materialization:v1', app_computed_cell: true, source_row_count: 2 },
    ...overrides,
  };
}

test('viewport read API validates bbox bounds before querying the database', async () => {
  const pool = {
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql: String(sql), params });
      assert.fail('invalid viewport requests must not query the database');
    },
    async end() {},
  };

  await withServer({ pool }, async (server) => {
    const badBbox = await request(server, {
      path: '/api/v1/cybermap/viewport?bbox=-200,47,-122,48&zoom=12',
      headers: authHeaders(),
    });
    assert.equal(badBbox.status, 400);
    assert.equal(badBbox.json.error.code, 'bbox_invalid');

    const oversized = await request(server, {
      path: '/api/v1/cybermap/viewport?bbox=-130,40,-120,50&zoom=12',
      headers: authHeaders(),
    });
    assert.equal(oversized.status, 400);
    assert.equal(oversized.json.error.code, 'bbox_too_large');
  });
});

test('viewport read API maps zoom to app-computed cell resolution and gates restricted layers by caller authority', async () => {
  const pool = {
    queries: [],
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      this.queries.push({ sql: text, params });
      assert.match(text, /from cybermap_cells/i);
      assert.match(text, /st_makeenvelope/i, 'viewport queries should use bounded PostGIS bbox intersections');
      assert.doesNotMatch(text, /h3_to_geo|h3_cell_to_boundary|h3_lat_lng_to_cell/i, 'read API must not require a PostgreSQL H3 extension');
      assert.ok(params.includes(9), `expected zoom=12 to map to stored resolution 9, got params ${JSON.stringify(params)}`);
      return { rows: [makeCellRow()] };
    },
    async end() {},
  };

  await withServer({ pool }, async (server) => {
    const response = await request(server, {
      path: `/api/v1/cybermap/viewport?bbox=${encodeURIComponent(BBOX)}&zoom=12&layers=green_preload,exposure_enrichment`,
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.resolution, 9);
    assert.equal(response.json.cells.length, 1);
    assert.deepEqual(response.json.cells[0].source_classes, ['green_public']);
    assert.ok(response.json.cells[0].layers.green_preload);
    assert.equal(response.json.cells[0].layers.exposure_enrichment, undefined, 'green-only caller must not see grey/orange/red exposure layer');
    assert.ok(response.json.cells[0].caveats.some((caveat) => caveat.code === 'restricted_layer_filtered'));
    assertNoRawPii(response.json);
  });
});

test('viewport read API filters materialized layers outside caller source-class authority', async () => {
  const pool = {
    queries: [],
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      this.queries.push({ sql: text, params });
      assert.match(text, /from cybermap_cells/i);
      return { rows: [makeCellRow({
        first_seen_at: '2026-07-10T11:10:00.000Z',
        last_seen_at: '2026-07-10T11:55:00.000Z',
        source_classes: ['green_public', 'owned_device'],
        observation_count: 2,
        entity_count: 2,
        freshness: {
          last_observed_at: '2026-07-10T11:55:00.000Z',
          last_ingested_at: '2026-07-10T11:56:00.000Z',
          age_seconds: 300,
        },
        caveats: [{ code: 'local_owned_context_not_global_preload', severity: 'info', source_classes: ['owned_device'] }],
        provenance: { materialized_by: 'cybermap-worker/cell-materialization:v1', app_computed_cell: true, source_row_count: 2 },
        salience: 0.91,
        layers: {
          green_preload: {
            ...makeCellRow().layers.green_preload,
            first_seen_at: '2026-07-10T11:10:00.000Z',
            last_seen_at: '2026-07-10T11:10:00.000Z',
            last_ingested_at: '2026-07-10T11:11:00.000Z',
          },
          local_owned: {
            layer: 'local_owned',
            source_classes: ['owned_device'],
            source_class_counts: { owned_device: 1 },
            observations_by_kind: { wifi_ap: 1 },
            observation_count: 1,
            entity_count: 1,
            entities: [{ id: 'network-1', stable_key: 'wifi_ap:sha256:redacted', entity_kind: 'network', source_class: 'owned_device', source_classes: ['owned_device'] }],
            first_seen_at: '2026-07-10T11:55:00.000Z',
            last_seen_at: '2026-07-10T11:55:00.000Z',
            last_ingested_at: '2026-07-10T11:56:00.000Z',
            global_preload: false,
            local_context: true,
          },
        },
        counts: {
          observations_by_kind: { greenfeed_snapshot: 1, wifi_ap: 1 },
          observations_by_source_class: { green_public: 1, owned_device: 1 },
          entities_by_kind: { feed: 1, network: 1 },
        },
      })] };
    },
    async end() {},
  };

  await withServer({ pool }, async (server) => {
    const response = await request(server, {
      path: `/api/v1/cybermap/viewport?bbox=${encodeURIComponent(BBOX)}&zoom=12&layers=green_preload,local_owned`,
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    const cell = response.json.cells[0];
    assert.deepEqual(cell.source_classes, ['green_public']);
    assert.ok(cell.layers.green_preload);
    assert.equal(cell.layers.local_owned, undefined, 'green-only caller must not see local owned/device observations from mixed cells');
    assert.equal(cell.observation_count, 1);
    assert.deepEqual(cell.counts.observations_by_source_class, { green_public: 1 });
    assert.equal(cell.first_seen_at, '2026-07-10T11:10:00.000Z');
    assert.equal(cell.last_seen_at, '2026-07-10T11:10:00.000Z');
    assert.equal(cell.freshness.last_observed_at, '2026-07-10T11:10:00.000Z');
    assert.equal(cell.freshness.last_ingested_at, '2026-07-10T11:11:00.000Z');
    assert.equal(cell.freshness.age_seconds, undefined);
    assert.equal(cell.provenance.source_row_count, 1);
    assert.equal(cell.provenance.projection_filtered, true);
    assert.equal(cell.salience, null);
    assert.ok(cell.caveats.some((caveat) => caveat.code === 'source_class_layer_filtered'));
    assert.equal(cell.caveats.some((caveat) => caveat.code === 'local_owned_context_not_global_preload'), false);
    assert.equal(JSON.stringify(cell).includes('owned_device'), false);
    assert.equal(JSON.stringify(cell).includes('local_owned'), false);
    assert.equal(JSON.stringify(cell).includes('wifi_ap'), false);
    assert.equal(JSON.stringify(cell).includes('2026-07-10T11:55:00.000Z'), false);
  });
});

test('viewport read API applies since filtering and ordering after source-class projection', async () => {
  const hiddenFreshOnly = makeCellRow({
    h3_cell: 'gh9:hiddenfresh',
    updated_at: '2026-07-10T11:55:00.000Z',
    first_seen_at: '2026-07-10T10:00:00.000Z',
    last_seen_at: '2026-07-10T11:55:00.000Z',
    source_classes: ['green_public', 'owned_device'],
    observation_count: 2,
    entity_count: 2,
    salience: 0.99,
    freshness: { last_observed_at: '2026-07-10T11:55:00.000Z', last_ingested_at: '2026-07-10T11:56:00.000Z', age_seconds: 300 },
    provenance: { materialized_by: 'cybermap-worker/cell-materialization:v1', app_computed_cell: true, source_row_count: 2 },
    layers: {
      green_preload: {
        ...makeCellRow().layers.green_preload,
        first_seen_at: '2026-07-10T10:00:00.000Z',
        last_seen_at: '2026-07-10T10:00:00.000Z',
        last_ingested_at: '2026-07-10T10:01:00.000Z',
        observation_count: 1,
        entity_count: 1,
      },
      local_owned: {
        layer: 'local_owned',
        source_classes: ['owned_device'],
        source_class_counts: { owned_device: 1 },
        observations_by_kind: { wifi_ap: 1 },
        observation_count: 1,
        entity_count: 1,
        entities: [{ id: 'hidden-network', stable_key: 'wifi_ap:hidden', entity_kind: 'network', source_class: 'owned_device', source_classes: ['owned_device'] }],
        first_seen_at: '2026-07-10T11:55:00.000Z',
        last_seen_at: '2026-07-10T11:55:00.000Z',
        last_ingested_at: '2026-07-10T11:56:00.000Z',
        global_preload: false,
        local_context: true,
      },
    },
  });
  const visibleRecent = makeCellRow({
    h3_cell: 'gh9:visiblerecent',
    updated_at: '2026-07-10T11:20:00.000Z',
    first_seen_at: '2026-07-10T11:20:00.000Z',
    last_seen_at: '2026-07-10T11:20:00.000Z',
    observation_count: 1,
    entity_count: 1,
    salience: 0.2,
    freshness: { last_observed_at: '2026-07-10T11:20:00.000Z', last_ingested_at: '2026-07-10T11:21:00.000Z', age_seconds: 2400 },
    layers: {
      green_preload: {
        ...makeCellRow().layers.green_preload,
        first_seen_at: '2026-07-10T11:20:00.000Z',
        last_seen_at: '2026-07-10T11:20:00.000Z',
        last_ingested_at: '2026-07-10T11:21:00.000Z',
        observation_count: 1,
        entity_count: 1,
      },
    },
  });
  const pool = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      assert.match(text, /from cybermap_cells/i);
      assert.doesNotMatch(text, /updated_at\s*>=\s*\$\d+/i, 'raw cell updated_at must not drive caller-visible since filtering');
      assert.doesNotMatch(text, /order by salience desc, updated_at desc/i, 'raw hidden salience/updated_at must not drive caller-visible ordering');
      assert.deepEqual(params.slice(5, 6), [['green_public']]);
      return { rows: [hiddenFreshOnly, visibleRecent] };
    },
    async end() {},
  };

  await withServer({ pool }, async (server) => {
    const response = await request(server, {
      path: `/api/v1/cybermap/viewport?bbox=${encodeURIComponent(BBOX)}&zoom=12&since=${encodeURIComponent('2026-07-10T11:00:00.000Z')}`,
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.json.cells.map((cell) => cell.h3_cell), ['gh9:visiblerecent']);
    const serialized = JSON.stringify(response.json);
    assert.equal(serialized.includes('2026-07-10T11:55:00.000Z'), false);
    assert.equal(serialized.includes('owned_device'), false);
    assert.equal(serialized.includes('local_owned'), false);
    assert.equal(serialized.includes('wifi_ap'), false);
  });
});

test('viewport read API applies since after hidden restricted layer projection', async () => {
  const row = makeCellRow({
    h3_cell: 'gh9:redfresh',
    updated_at: '2026-07-10T11:55:00.000Z',
    first_seen_at: '2026-07-10T10:00:00.000Z',
    last_seen_at: '2026-07-10T11:55:00.000Z',
    source_classes: ['green_public', 'orange_exposure'],
    observation_count: 2,
    entity_count: 1,
    freshness: {
      updated_at: '2026-07-10T11:55:00.000Z',
      last_observed_at: '2026-07-10T11:55:00.000Z',
      last_ingested_at: '2026-07-10T11:56:00.000Z',
      age_seconds: 30,
    },
    provenance: { materialized_by: 'cybermap-worker/cell-materialization:v1', app_computed_cell: true, source_row_count: 2 },
    layers: {
      green_preload: {
        layer: 'green_preload',
        source_classes: ['green_public'],
        source_class_counts: { green_public: 1 },
        observations_by_kind: { claim: 1 },
        observation_count: 1,
        entity_count: 1,
        first_seen_at: '2026-07-10T10:00:00.000Z',
        last_seen_at: '2026-07-10T10:00:00.000Z',
        last_ingested_at: '2026-07-10T10:01:00.000Z',
        entities: [{ entity_kind: 'claim', stable_key: 'claim:visible', source_classes: ['green_public'] }],
      },
      exposure_enrichment: {
        layer: 'exposure_enrichment',
        source_classes: ['orange_exposure'],
        source_class_counts: { orange_exposure: 1 },
        observations_by_kind: { shodan_exposure: 1 },
        observation_count: 1,
        entity_count: 0,
        first_seen_at: '2026-07-10T11:55:00.000Z',
        last_seen_at: '2026-07-10T11:55:00.000Z',
        last_ingested_at: '2026-07-10T11:56:00.000Z',
        gated_by_source_class: {
          orange_exposure: { authorized_scope_refs: ['ops-window'], observation_count: 1 },
        },
        entities: [],
      },
    },
  });
  const pool = {
    async query(sql, params = []) {
      assert.match(String(sql), /from cybermap_cells/i);
      assert.deepEqual(params.slice(5, 6), [['green_public']]);
      return { rows: [row] };
    },
    async end() {},
  };

  await withServer({ pool }, async (server) => {
    const response = await request(server, {
      path: `/api/v1/cybermap/viewport?bbox=${encodeURIComponent(BBOX)}&zoom=12&since=${encodeURIComponent('2026-07-10T11:00:00.000Z')}`,
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.cells.length, 0);
    const serialized = JSON.stringify(response.json);
    assert.equal(serialized.includes('orange_exposure'), false);
    assert.equal(serialized.includes('2026-07-10T11:55:00.000Z'), false);
  });
});

test('cell detail API returns provenance drilldown and bounded observation links without raw payload columns', async () => {
  const pool = {
    queries: [],
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      this.queries.push({ sql: text, params });
      assert.doesNotMatch(text, /payload|raw_payload_ref|operator_approved_raw_ref|raw_pii/i, 'read queries must not select raw payload or raw PII columns');
      if (/from cybermap_cells/i.test(text)) {
        assert.deepEqual(params.slice(0, 2), [CELL_ID, 9]);
        return { rows: [makeCellRow({ source_classes: ['green_public'], layers: { green_preload: makeCellRow().layers.green_preload } })] };
      }
      if (/from observations/i.test(text)) {
        assert.match(text, /h3_9/i, 'cell detail should use app-computed cell columns');
        return { rows: [{ id: 'obs-1', kind: 'greenfeed_snapshot', source_id: FIXTURE_SOURCE_ID, source_class: 'green_public', observed_at: '2026-07-10T11:40:00.000Z', confidence: 0.8, provenance: { adapter: 'greenfeed-fixture' } }] };
      }
      assert.fail(`unexpected SQL: ${text}`);
    },
    async end() {},
  };

  await withServer({ pool }, async (server) => {
    const response = await request(server, {
      path: `/api/v1/cybermap/cells/${CELL_ID}`,
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.cell.h3_cell, CELL_ID);
    assert.equal(response.json.cell.provenance.app_computed_cell, true);
    assert.equal(response.json.observation_links.length, 1);
    assert.equal(response.json.observation_links[0].kind, 'greenfeed_snapshot');
    assertNoRawPii(response.json);
  });
});

test('entity read API returns summary and observation links while redacting unsafe entity properties', async () => {
  const pool = {
    queries: [],
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      this.queries.push({ sql: text, params });
      assert.doesNotMatch(text, /o\.payload|raw_payload_ref|operator_approved_raw_ref|raw_pii/i, 'entity read queries must not select raw observation payloads');
      if (/from cyber_entities/i.test(text) && !/entity_observations/i.test(text)) {
        assert.equal(params[0], ENTITY_ID);
        return { rows: [{
          id: ENTITY_ID,
          entity_kind: 'feed',
          stable_key: 'greenfeed:seattle-alerts',
          display_name: 'Seattle alerts',
          source_class: 'green_public',
          first_seen_at: '2026-07-10T11:00:00.000Z',
          last_seen_at: '2026-07-10T11:40:00.000Z',
          h3_9: CELL_ID,
          confidence: 0.9,
          labels: ['greenfeed'],
          properties: { category: 'public-alert', raw_frame: 'must-not-leak', nested: { raw_pii: 'drop-me' } },
          provenance: { adapter: 'greenfeed-fixture' },
        }] };
      }
      if (/from entity_observations/i.test(text)) {
        return { rows: [{ observation_id: 'obs-1', relationship: 'observed_as', source_class: 'green_public', kind: 'greenfeed_snapshot', observed_at: '2026-07-10T11:40:00.000Z', confidence: 0.8, provenance: { adapter: 'greenfeed-fixture' } }] };
      }
      assert.fail(`unexpected SQL: ${text}`);
    },
    async end() {},
  };

  await withServer({ pool }, async (server) => {
    const response = await request(server, {
      path: `/api/v1/entities/${ENTITY_ID}`,
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.entity.id, ENTITY_ID);
    assert.equal(response.json.entity.properties.category, 'public-alert');
    assert.equal(response.json.entity.properties.raw_frame, undefined);
    assert.equal(response.json.observation_links.length, 1);
    assertNoRawPii(response.json);
  });
});

test('sources read API keeps filters bounded and gates source classes by token authority', async () => {
  const pool = {
    queries: [],
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      this.queries.push({ sql: text, params });
      assert.match(text, /from source_catalog/i);
      assert.match(text, /st_makeenvelope/i);
      assert.doesNotMatch(text, /;|--|\/\*/i, 'source catalog query shape must stay static and non-SQL-like');
      assert.ok(params.flat().includes('green_public'), `expected bounded class param, got ${JSON.stringify(params)}`);
      return { rows: [{
        id: FIXTURE_SOURCE_ID,
        source_class: 'green_public',
        source_key: 'greenfeed:seattle-alerts',
        name: 'Seattle public alerts',
        provider: 'fixture-greenfeed',
        feed_url: 'https://example.invalid/feed',
        terms_url: 'https://example.invalid/terms',
        allowed_preload: true,
        cache_ttl_seconds: 300,
        last_checked_at: '2026-07-10T11:58:00.000Z',
        provenance: { adapter: 'greenfeed-fixture' },
      }] };
    },
    async end() {},
  };

  await withServer({ pool }, async (server) => {
    const rejected = await request(server, {
      path: `/api/v1/sources?bbox=${encodeURIComponent(BBOX)}&class=orange_exposure`,
      headers: authHeaders(),
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.json.error.code, 'source_scope_forbidden');
    assert.equal(pool.queries.length, 0, 'unauthorized source class filter must be rejected before DB query');

    const invalid = await request(server, {
      path: `/api/v1/sources?bbox=${encodeURIComponent(BBOX)}&class=${encodeURIComponent('green_public;drop table source_catalog')}`,
      headers: authHeaders(),
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.error.code, 'source_class_invalid');
    assert.equal(pool.queries.length, 0, 'invalid class filter must be rejected before DB query');

    const response = await request(server, {
      path: `/api/v1/sources?bbox=${encodeURIComponent(BBOX)}&class=green_public`,
      headers: authHeaders(),
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.sources.length, 1);
    assert.equal(response.json.sources[0].source_class, 'green_public');
    assert.equal(response.json.sources[0].freshness.last_checked_at, '2026-07-10T11:58:00.000Z');
    assert.deepEqual(response.json.sources[0].caveats.map((c) => c.code), ['green_preload_allowed']);
    assertNoRawPii(response.json);
  });
});
