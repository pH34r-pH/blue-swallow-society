import test from 'node:test';
import assert from 'node:assert/strict';

const CELL_9 = 'gh9:c23nb62w7';
const CELL_7 = 'gh7:c23nb62';
const CELL_11 = 'gh11:c23nb62w7e1';
const NOW = '2026-07-10T12:00:00.000Z';

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function observation(overrides = {}) {
  return {
    observation_id: overrides.observation_id || overrides.id || 'obs-1',
    kind: overrides.kind || 'wifi_ap',
    source_class: overrides.source_class || 'owned_device',
    observed_at: overrides.observed_at || '2026-07-10T11:55:00.000Z',
    ingested_at: overrides.ingested_at || '2026-07-10T11:56:00.000Z',
    h3_7: overrides.h3_7 || CELL_7,
    h3_9: overrides.h3_9 || CELL_9,
    h3_11: overrides.h3_11 || CELL_11,
    confidence: overrides.confidence ?? 0.8,
    session_id: overrides.session_id || null,
    trigger_observation_id: overrides.trigger_observation_id || null,
    authorized_scope_ref: overrides.authorized_scope_ref || null,
    payload: overrides.payload || { bssid_hash: 'sha256:bssid-fixture' },
    provenance: overrides.provenance || { adapter: 'test' },
    entity_id: overrides.entity_id || null,
    entity_kind: overrides.entity_kind || null,
    entity_stable_key: overrides.entity_stable_key || null,
    entity_display_name: overrides.entity_display_name || null,
    entity_source_class: overrides.entity_source_class || overrides.entitySourceClass || null,
    entity_labels: overrides.entity_labels || [],
  };
}

function createCellPool(rows) {
  const pool = {
    rows,
    cells: new Map(),
    queries: [],
    upsertCount: 0,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      this.queries.push({ sql: text, params });

      if (/select distinct/i.test(text) && /from observations/i.test(text)) {
        assert.match(text, /h3_7/i, 'affected scan should consume app-computed h3_7 cells');
        assert.match(text, /h3_9/i, 'affected scan should consume app-computed h3_9 cells');
        assert.match(text, /h3_11/i, 'affected scan should consume app-computed h3_11 cells');
        assert.doesNotMatch(text, /h3_to_geo|h3_cell_to_boundary|h3_lat_lng_to_cell/i, 'P0 must not require a PostgreSQL H3 extension');
        const since = new Date(params[0]).getTime();
        const before = params.length >= 5 ? new Date(params[1]).getTime() : Infinity;
        const afterResolution = params.length >= 5 ? params[2] : params.length >= 4 ? params[1] : null;
        const afterCell = params.length >= 5 ? params[3] : params.length >= 4 ? params[2] : null;
        const limit = params.length >= 5 ? params[4] : params.length >= 4 ? params[3] : params[1];
        const affected = [];
        for (const row of rows) {
          const ingestedAt = new Date(row.ingested_at).getTime();
          if (ingestedAt < since || ingestedAt >= before) continue;
          affected.push({ resolution: 7, h3_cell: row.h3_7 });
          affected.push({ resolution: 9, h3_cell: row.h3_9 });
          affected.push({ resolution: 11, h3_cell: row.h3_11 });
        }
        const unique = new Map(affected.filter((row) => row.h3_cell).map((row) => [`${row.resolution}|${row.h3_cell}`, row]));
        const sorted = [...unique.values()].sort((a, b) => (a.resolution - b.resolution) || a.h3_cell.localeCompare(b.h3_cell));
        const paged = sorted.filter((row) => {
          if (!afterResolution || !afterCell) return true;
          return row.resolution > afterResolution || (row.resolution === afterResolution && row.h3_cell > afterCell);
        });
        return { rows: paged.slice(0, limit) };
      }

      if (/from observations/i.test(text) && /left join entity_observations/i.test(text) && /left join cyber_entities/i.test(text)) {
        assert.doesNotMatch(text, /h3_to_geo|h3_cell_to_boundary|h3_lat_lng_to_cell/i, 'cell rows should use app-computed cells, not a PG H3 extension');
        const [h3Cell] = params;
        const field = /o\.h3_7\s*=\s*\$1/i.test(text)
          ? 'h3_7'
          : /o\.h3_11\s*=\s*\$1/i.test(text)
            ? 'h3_11'
            : 'h3_9';
        return { rows: rows.filter((row) => row[field] === h3Cell) };
      }

      if (/insert into cybermap_cells/i.test(text)) {
        assert.match(text, /on conflict\s*\(\s*h3_cell\s*,\s*resolution\s*\)/i, 'cell materialization must upsert by primary key');
        assert.match(text, /st_geomfromgeojson/i, 'cell geometry should be passed as app-computed GeoJSON');
        assert.doesNotMatch(text, /h3_to_geo|h3_cell_to_boundary|h3_lat_lng_to_cell/i, 'upsert must not require a PG H3 extension');
        const [
          h3Cell,
          resolution,
          geomJson,
          firstSeenAt,
          lastSeenAt,
          sourceClasses,
          observationCount,
          entityCount,
          layers,
          counts,
          freshness,
          caveats,
          salience,
        ] = params;
        const key = `${resolution}|${h3Cell}`;
        const row = {
          h3_cell: h3Cell,
          resolution,
          geom: parseJson(geomJson),
          first_seen_at: firstSeenAt,
          last_seen_at: lastSeenAt,
          source_classes: sourceClasses,
          observation_count: observationCount,
          entity_count: entityCount,
          layers: parseJson(layers),
          counts: parseJson(counts),
          freshness: parseJson(freshness),
          caveats: parseJson(caveats),
          salience,
        };
        this.upsertCount += 1;
        this.cells.set(key, row);
        return { rows: [row] };
      }

      assert.fail(`unexpected SQL: ${text}`);
    },
  };
  return pool;
}

test('cell materialization aggregates multiple observations and entity-backed summaries into one viewport cell', async () => {
  const { materializeCybermapCell } = await import('../vm/cybermap-worker/cell-materialization.mjs');
  const pool = createCellPool([
    observation({
      observation_id: 'obs-green-1',
      kind: 'greenfeed_snapshot',
      source_class: 'green_public',
      observed_at: '2026-07-10T11:45:00.000Z',
      confidence: 0.6,
      entity_id: 'entity-feed-1',
      entity_kind: 'feed',
      entity_stable_key: 'greenfeed:source:seattle-alerts',
      entity_display_name: 'Seattle open alerts',
      entity_labels: ['greenfeed', 'source'],
    }),
    observation({
      observation_id: 'obs-owned-1',
      kind: 'wifi_ap',
      source_class: 'owned_device',
      observed_at: '2026-07-10T11:55:00.000Z',
      confidence: 0.9,
      entity_id: 'entity-network-1',
      entity_kind: 'network',
      entity_stable_key: 'wifi_ap:bssid_hash:sha256:bssid-fixture',
      entity_display_name: 'Wi-Fi AP sha256:bssid-fixture',
      entity_labels: ['wifi', 'access-point'],
    }),
  ]);

  const result = await materializeCybermapCell(pool, { h3Cell: CELL_9, resolution: 9, now: NOW });

  assert.equal(result.observationCount, 2);
  assert.equal(result.entityCount, 2);
  assert.equal(result.upserted, true);
  const cell = pool.cells.get(`9|${CELL_9}`);
  assert.equal(cell.observation_count, 2);
  assert.equal(cell.entity_count, 2);
  assert.equal(cell.first_seen_at, '2026-07-10T11:45:00.000Z');
  assert.equal(cell.last_seen_at, '2026-07-10T11:55:00.000Z');
  assert.deepEqual(cell.source_classes, ['green_public', 'owned_device']);
  assert.equal(cell.counts.observations_by_kind.greenfeed_snapshot, 1);
  assert.equal(cell.counts.observations_by_kind.wifi_ap, 1);
  assert.equal(cell.layers.green_preload.global_preload, true);
  assert.equal(cell.layers.green_preload.observation_count, 1);
  assert.deepEqual(cell.layers.green_preload.source_classes, ['green_public']);
  assert.equal(cell.layers.local_owned.global_preload, false);
  assert.equal(cell.layers.local_owned.observation_count, 1);
  assert.deepEqual(cell.layers.local_owned.entities.map((entity) => entity.stable_key), [
    'wifi_ap:bssid_hash:sha256:bssid-fixture',
  ]);
  assert.equal(cell.freshness.last_observed_at, '2026-07-10T11:55:00.000Z');
  assert.equal(cell.freshness.age_seconds, 300);
  assert.ok(cell.salience > 0);
  assert.equal(cell.geom.type, 'Polygon');
});

test('cell salience respects the numeric(5,3) storage ceiling', async () => {
  const { buildCybermapCellSummary } = await import('../vm/cybermap-worker/cell-materialization.mjs');
  const rows = Array.from({ length: 400 }, (_, index) => observation({
    observation_id: `obs-hot-${index}`,
    source_class: 'red_restricted',
    observed_at: '2026-07-10T11:59:00.000Z',
    confidence: 1,
    entity_id: `entity-hot-${index}`,
    entity_kind: 'claim',
    entity_stable_key: `claim:hot-${index}`,
  }));

  const summary = buildCybermapCellSummary(rows, { h3Cell: CELL_9, resolution: 9, now: NOW });

  assert.equal(summary.salience, 99.999);
});

test('rerunning cell materialization upserts the same cell without double-counting', async () => {
  const { materializeCybermapCell } = await import('../vm/cybermap-worker/cell-materialization.mjs');
  const pool = createCellPool([
    observation({ observation_id: 'obs-owned-1', kind: 'wifi_ap', source_class: 'owned_device' }),
    observation({ observation_id: 'obs-owned-2', kind: 'ble_device', source_class: 'owned_device' }),
  ]);

  await materializeCybermapCell(pool, { h3Cell: CELL_9, resolution: 9, now: NOW });
  await materializeCybermapCell(pool, { h3Cell: CELL_9, resolution: 9, now: NOW });

  assert.equal(pool.upsertCount, 2, 'rerun should issue an idempotent replacement upsert');
  assert.equal(pool.cells.size, 1, 'same h3/resolution primary key should be replaced, not duplicated');
  const cell = pool.cells.get(`9|${CELL_9}`);
  assert.equal(cell.observation_count, 2);
  assert.equal(cell.layers.local_owned.observation_count, 2);
  assert.equal(cell.counts.observations_by_source_class.owned_device, 2);
});

test('grey orange and red layers are gated, provenance-bearing, and filtered without matching caller scope', async () => {
  const {
    materializeCybermapCell,
    projectCybermapCellForScope,
  } = await import('../vm/cybermap-worker/cell-materialization.mjs');
  const pool = createCellPool([
    observation({
      observation_id: 'obs-green-1',
      kind: 'greenfeed_snapshot',
      source_class: 'green_public',
      observed_at: '2026-07-10T11:40:00.000Z',
      ingested_at: '2026-07-10T11:41:00.000Z',
      entity_id: 'entity-claim-1',
      entity_kind: 'claim',
      entity_stable_key: 'claim:grey-correlation',
      entity_display_name: 'Grey correlation',
      entity_source_class: 'green_public',
    }),
    observation({
      observation_id: 'obs-grey-1',
      kind: 'claim_anchor',
      source_class: 'grey_enrichment',
      observed_at: '2026-07-10T11:57:00.000Z',
      ingested_at: '2026-07-10T11:58:00.000Z',
      authorized_scope_ref: 'scope://owned/grey-correlation',
      trigger_observation_id: 'obs-owned-1',
      entity_id: 'entity-claim-1',
      entity_kind: 'claim',
      entity_stable_key: 'claim:grey-correlation',
      entity_display_name: 'Grey correlation',
      entity_source_class: 'green_public',
    }),
    observation({
      observation_id: 'obs-orange-1',
      kind: 'service_exposure',
      source_class: 'orange_exposure',
      observed_at: '2026-07-10T11:58:00.000Z',
      ingested_at: '2026-07-10T11:59:00.000Z',
      authorized_scope_ref: 'scope://owned/orange-exposure',
      trigger_observation_id: 'obs-owned-1',
    }),
    observation({
      observation_id: 'obs-red-1',
      kind: 'operator_note',
      source_class: 'red_restricted',
      observed_at: '2026-07-10T11:59:00.000Z',
      ingested_at: '2026-07-10T11:59:30.000Z',
      authorized_scope_ref: 'scope://operator/red-team',
      session_id: '00000000-0000-4000-8000-000000000011',
    }),
  ]);

  await materializeCybermapCell(pool, { h3Cell: CELL_9, resolution: 9, now: NOW });
  const cell = pool.cells.get(`9|${CELL_9}`);
  cell.provenance = {
    materialized_by: 'cybermap-worker/cell-materialization:v1',
    app_computed_cell: true,
    source_row_count: 4,
  };

  assert.equal(cell.layers.exposure_enrichment.gated, true);
  assert.equal(cell.layers.exposure_enrichment.global_preload, false);
  assert.equal(cell.layers.exposure_enrichment.provenance_bearing, true);
  assert.deepEqual(cell.layers.exposure_enrichment.source_classes, [
    'grey_enrichment',
    'orange_exposure',
    'red_restricted',
  ]);
  assert.equal(cell.layers.exposure_enrichment.observation_count, 3);
  assert.deepEqual(cell.layers.exposure_enrichment.gated_by_source_class.grey_enrichment.authorized_scope_refs, [
    'scope://owned/grey-correlation',
  ]);
  assert.ok(cell.caveats.some((caveat) => caveat.code === 'restricted_layer_requires_scope'));

  const publicProjection = projectCybermapCellForScope(cell, { callerScopes: ['cybermap:read'] });
  assert.equal(publicProjection.layers.exposure_enrichment, undefined);
  assert.ok(publicProjection.caveats.some((caveat) => caveat.code === 'restricted_layer_filtered'));
  assert.deepEqual(publicProjection.source_classes, ['green_public']);
  assert.equal(publicProjection.observation_count, 1);
  assert.equal(publicProjection.entity_count, 1);
  assert.equal(publicProjection.provenance.source_row_count, 1);
  assert.deepEqual(publicProjection.counts.entities_by_kind, { claim: 1 });
  assert.equal(publicProjection.last_seen_at, '2026-07-10T11:40:00.000Z');
  assert.equal(publicProjection.freshness.last_observed_at, '2026-07-10T11:40:00.000Z');
  assert.deepEqual(publicProjection.counts.observations_by_source_class, { green_public: 1 });
  assert.equal(JSON.stringify(publicProjection).includes('grey_enrichment'), false);
  assert.equal(JSON.stringify(publicProjection).includes('orange_exposure'), false);
  assert.equal(JSON.stringify(publicProjection).includes('red_restricted'), false);
  assert.equal(JSON.stringify(publicProjection).includes('2026-07-10T11:59:00.000Z'), false);

  const greenSourceProjection = projectCybermapCellForScope(cell, {
    callerScopes: ['cybermap:read'],
    sourceClasses: ['green_public'],
  });
  assert.equal(greenSourceProjection.layers.exposure_enrichment, undefined);

  const scopedProjection = projectCybermapCellForScope(cell, {
    callerScopes: ['cybermap:read'],
    authorizedScopeRefs: ['scope://owned/grey-correlation'],
  });
  assert.equal(scopedProjection.layers.exposure_enrichment.observation_count, 1);
  assert.deepEqual(scopedProjection.layers.exposure_enrichment.source_classes, ['grey_enrichment']);
  assert.deepEqual(scopedProjection.layers.exposure_enrichment.observations_by_kind, { claim_anchor: 1 });
  assert.deepEqual(scopedProjection.layers.exposure_enrichment.entities.map((entity) => entity.stable_key), ['claim:grey-correlation']);
  assert.deepEqual(scopedProjection.source_classes, ['green_public', 'grey_enrichment']);
  assert.equal(scopedProjection.observation_count, 2);
  assert.equal(scopedProjection.entity_count, 1);
  assert.equal(scopedProjection.provenance.source_row_count, 2);
  assert.deepEqual(scopedProjection.counts.entities_by_kind, { claim: 1 });
  assert.equal(scopedProjection.last_seen_at, '2026-07-10T11:57:00.000Z');
  assert.equal(scopedProjection.freshness.last_observed_at, '2026-07-10T11:57:00.000Z');
  assert.deepEqual(scopedProjection.counts.observations_by_kind, { claim_anchor: 1, greenfeed_snapshot: 1 });
  assert.deepEqual(scopedProjection.counts.observations_by_source_class, { green_public: 1, grey_enrichment: 1 });
  assert.equal(JSON.stringify(scopedProjection).includes('service_exposure'), false);
  assert.equal(JSON.stringify(scopedProjection).includes('operator_note'), false);
  assert.equal(JSON.stringify(scopedProjection).includes('orange_exposure'), false);
  assert.equal(JSON.stringify(scopedProjection).includes('red_restricted'), false);
  assert.equal(JSON.stringify(scopedProjection).includes('2026-07-10T11:59:00.000Z'), false);
  assert.ok(scopedProjection.caveats.some((caveat) => caveat.code === 'restricted_layer_scope_limited'));
});

test('affected-cell materialization consumes newly ingested app-computed cells across resolutions', async () => {
  const { materializeAffectedCybermapCells } = await import('../vm/cybermap-worker/cell-materialization.mjs');
  const pool = createCellPool([
    observation({ observation_id: 'obs-old', ingested_at: '2026-07-10T10:00:00.000Z' }),
    observation({ observation_id: 'obs-new', ingested_at: '2026-07-10T11:59:00.000Z' }),
  ]);

  const result = await materializeAffectedCybermapCells(pool, {
    since: '2026-07-10T11:00:00.000Z',
    now: NOW,
  });

  assert.deepEqual(result.materialized.map((cell) => `${cell.resolution}|${cell.h3Cell}`).sort(), [
    `11|${CELL_11}`,
    `7|${CELL_7}`,
    `9|${CELL_9}`,
  ]);
  assert.equal(pool.cells.size, 3);
});

test('affected-cell materialization exposes a cursor when the bounded scan hits its limit', async () => {
  const { materializeAffectedCybermapCells } = await import('../vm/cybermap-worker/cell-materialization.mjs');
  const pool = createCellPool([
    observation({ observation_id: 'obs-a', h3_7: 'gh7:c23nb60', h3_9: 'gh9:c23nb6000', h3_11: 'gh11:c23nb600000' }),
    observation({ observation_id: 'obs-b', h3_7: 'gh7:c23nb61', h3_9: 'gh9:c23nb6100', h3_11: 'gh11:c23nb610000' }),
  ]);

  const firstPage = await materializeAffectedCybermapCells(pool, {
    since: '2026-07-10T11:00:00.000Z',
    now: NOW,
    limit: 2,
  });
  const secondPage = await materializeAffectedCybermapCells(pool, {
    since: '2026-07-10T11:00:00.000Z',
    now: NOW,
    limit: 2,
    after: firstPage.nextCursor,
  });

  assert.equal(firstPage.limitReached, true);
  assert.deepEqual(firstPage.nextCursor, { resolution: 7, h3Cell: 'gh7:c23nb61' });
  assert.deepEqual(firstPage.materialized.map((cell) => `${cell.resolution}|${cell.h3Cell}`), [
    '7|gh7:c23nb60',
    '7|gh7:c23nb61',
  ]);
  assert.equal(secondPage.limitReached, true);
  assert.deepEqual(secondPage.nextCursor, { resolution: 9, h3Cell: 'gh9:c23nb6100' });
  assert.deepEqual(secondPage.materialized.map((cell) => `${cell.resolution}|${cell.h3Cell}`), [
    '9|gh9:c23nb6000',
    '9|gh9:c23nb6100',
  ]);
});

test('worker keeps the materialization window open while an affected-cell page is limited', async () => {
  const { createCybermapWorker } = await import('../vm/cybermap-worker/worker.mjs');
  const calls = [];
  const logs = [];
  let currentNow = new Date('2026-07-10T12:00:00.000Z');
  const worker = createCybermapWorker({
    pool: { async query() { return { rows: [] }; } },
    logger: (entry) => logs.push(entry),
    now: () => currentNow,
    materializationLookbackMs: 5 * 60 * 1000,
    materializationLimit: 2,
    materializeCells: async (_pool, options) => {
      calls.push(options);
      if (calls.length === 1) {
        return {
          since: options.since,
          before: options.before,
          affectedCellCount: 2,
          upsertedCellCount: 2,
          limitReached: true,
          nextCursor: { resolution: 9, h3Cell: 'gh9:c23nb6100' },
        };
      }
      return {
        since: options.since,
        before: options.before,
        affectedCellCount: 1,
        upsertedCellCount: 1,
        limitReached: false,
        nextCursor: null,
      };
    },
  });

  await worker.tick('first-page');
  currentNow = new Date('2026-07-10T12:01:00.000Z');
  await worker.tick('second-page');

  assert.equal(calls[0].since, '2026-07-10T11:55:00.000Z');
  assert.equal(calls[0].before, '2026-07-10T12:00:00.000Z');
  assert.equal(calls[0].after, null);
  assert.equal(worker.lastMaterializedAt, '2026-07-10T11:55:00.000Z');
  assert.equal(calls[1].since, '2026-07-10T11:55:00.000Z');
  assert.equal(calls[1].before, '2026-07-10T12:00:00.000Z');
  assert.deepEqual(calls[1].after, { resolution: 9, h3Cell: 'gh9:c23nb6100' });
  assert.ok(logs.some((entry) => entry.event === 'job_complete' && entry.limitReached === true));
});
