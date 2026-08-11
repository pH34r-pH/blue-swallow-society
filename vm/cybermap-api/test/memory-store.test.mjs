import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryObservationStore } from '../src/memory-store.mjs';
import { hashToken } from '../src/auth.mjs';
import { normalizeMtlsCredentialPolicy } from '../src/mtls-credential-policy.mjs';
import { hashPersistedObservation } from '../src/contracts.mjs';
import { validBatch, validObservation, validWardriverV2Batch, DEVICE_ID, INGEST_TOKEN } from './helpers.mjs';

function createStore({ legacyObservationIdentities = [], mtlsCredentialPolicy = memoryMtlsPolicy, credentials = [
  {
    device_id: DEVICE_ID,
    source_id: 'source-owned-device-1',
    source_class: 'owned_device',
    token_sha256: hashToken(INGEST_TOKEN),
    scopes: ['observations:write'],
    enabled: true,
  },
] } = {}) {
  return new MemoryObservationStore({
    credentials,
    legacyObservationIdentities,
    mtlsCredentialPolicy,
    now: () => new Date('2026-07-11T18:43:00.000Z'),
    randomUuid: (() => {
      let index = 0;
      return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`;
    })(),
  });
}

const memoryMtlsPolicy = Object.freeze({
  deviceId: DEVICE_ID,
  sourceKey: 'source-mtls-active',
  sourceClass: 'owned_device',
  sourceProvenance: Object.freeze({ credential_source: 'memory-test', environment: 'unit-test' }),
  credentialMetadata: Object.freeze({ credential_source: 'memory-test', environment: 'unit-test' }),
  scopes: Object.freeze(['observations:write']),
});

function mtlsCredential(overrides = {}) {
  return {
    device_id: DEVICE_ID,
    source_id: 'source-mtls-active',
    source_key: memoryMtlsPolicy.sourceKey,
    source_class: memoryMtlsPolicy.sourceClass,
    source_enabled: true,
    source_provenance: { ...memoryMtlsPolicy.sourceProvenance },
    token_sha256: hashToken(INGEST_TOKEN),
    mtls_certificate_fingerprint: 'a'.repeat(64),
    metadata: {
      ...memoryMtlsPolicy.credentialMetadata,
      mtls_certificate_fingerprint: 'a'.repeat(64),
    },
    scopes: [...memoryMtlsPolicy.scopes],
    enabled: true,
    expires_at: null,
    ...overrides,
  };
}

test('memory mTLS fails closed before tuple evaluation when policy is absent', async () => {
  await assert.rejects(
    createStore({ credentials: [mtlsCredential()], mtlsCredentialPolicy: null }).authenticateMtls({
      deviceId: DEVICE_ID,
      certificateFingerprint: 'a'.repeat(64),
      requiredScope: 'observations:write',
    }),
    (error) => error.code === 'forbidden' && error.statusCode === 403
      && error.mtlsRejectionReason === 'policy_mismatch',
  );
});

test('memory mTLS rejects a non-string certificate fingerprint before candidate evaluation', async () => {
  await assert.rejects(
    createStore({ credentials: [mtlsCredential()] }).authenticateMtls({
      deviceId: DEVICE_ID,
      certificateFingerprint: { toString: () => 'a'.repeat(64) },
      requiredScope: 'observations:write',
    }),
    (error) => error.code === 'forbidden' && error.statusCode === 403,
  );
});

test('mTLS policy normalization rejects non-string and incomplete identity provenance', () => {
  const invalidPolicies = [
    { ...memoryMtlsPolicy, sourceKey: 7 },
    {
      ...memoryMtlsPolicy,
      sourceProvenance: { credential_source: 7, environment: 'unit-test' },
    },
    {
      ...memoryMtlsPolicy,
      credentialMetadata: { credential_source: 'memory-test' },
    },
  ];
  for (const policy of invalidPolicies) {
    assert.throws(() => normalizeMtlsCredentialPolicy(policy), TypeError);
  }
});

test('memory mTLS authorizes one eligible credential beside ineligible historical twins', async () => {
  const variants = [
    ['disabled', { enabled: false }],
    ['expired', { expires_at: '2000-01-01T00:00:00.000Z' }],
    ['scope-missing', { scopes: ['cybermap:read'] }],
  ];

  for (const [name, overrides] of variants) {
    const active = mtlsCredential({ source_id: 'source-mtls-active' });
    const historical = mtlsCredential({ source_id: 'source-mtls-historical', ...overrides });
    const credential = await createStore({ credentials: [historical, active] }).authenticateMtls({
      deviceId: DEVICE_ID,
      certificateFingerprint: 'a'.repeat(64),
      requiredScope: 'observations:write',
    });
    assert.equal(credential.source_id, active.source_id, name);
  }
});

test('memory mTLS preserves one eligible credential behind every PostgreSQL-ineligible historical twin', async () => {
  const variants = [
    ['source-disabled', { source_enabled: false }, memoryMtlsPolicy],
    ['source-state-absent', { source_enabled: undefined }, memoryMtlsPolicy],
    ['provenance-mismatched', {
      metadata: {
        credential_source: 'other',
        environment: 'unit-test',
        mtls_certificate_fingerprint: 'a'.repeat(64),
      },
    }, memoryMtlsPolicy],
    ['provenance-absent', { source_provenance: null }, memoryMtlsPolicy],
    ['policy-key-mismatched', { source_key: 'other-source' }, memoryMtlsPolicy],
    ['policy-class-mismatched', { source_class: 'other_class' }, memoryMtlsPolicy],
    ['policy-provenance-mismatched', {
      source_provenance: { credential_source: 'other', environment: 'unit-test' },
      metadata: {
        credential_source: 'other',
        environment: 'unit-test',
        mtls_certificate_fingerprint: 'a'.repeat(64),
      },
    }, memoryMtlsPolicy],
    ['policy-metadata-mismatched', {
      metadata: {
        ...memoryMtlsPolicy.credentialMetadata,
        mtls_certificate_fingerprint: 'a'.repeat(64),
        policy_extra: 'unexpected',
      },
    }, memoryMtlsPolicy],
    ['policy-scope-mismatched', { scopes: ['observations:write', 'cybermap:read'] }, memoryMtlsPolicy],
    ['invalid-expiry', { expires_at: 'not-a-timestamp' }, memoryMtlsPolicy],
  ];

  for (const [name, overrides, mtlsCredentialPolicy] of variants) {
    const active = mtlsCredential({ source_id: 'source-mtls-active' });
    const historical = mtlsCredential({ source_id: 'source-mtls-historical', ...overrides });
    const credential = await createStore({
      credentials: [historical, active],
      mtlsCredentialPolicy,
    }).authenticateMtls({
      deviceId: DEVICE_ID,
      certificateFingerprint: 'a'.repeat(64),
      requiredScope: 'observations:write',
    });
    assert.equal(credential.source_id, active.source_id, name);
  }
});

test('memory mTLS returns PostgreSQL-compatible fixed reasons for every additional predicate', async () => {
  const cases = [
    ['source_disabled', { source_enabled: false }, memoryMtlsPolicy],
    ['source_disabled', { source_enabled: undefined }, memoryMtlsPolicy],
    ['provenance_mismatch', {
      metadata: {
        credential_source: 'other',
        environment: 'unit-test',
        mtls_certificate_fingerprint: 'a'.repeat(64),
      },
    }, memoryMtlsPolicy],
    ['provenance_mismatch', { source_provenance: null }, memoryMtlsPolicy],
    ['provenance_mismatch', {
      source_provenance: { credential_source: 7, environment: 'unit-test' },
      metadata: {
        credential_source: 7,
        environment: 'unit-test',
        mtls_certificate_fingerprint: 'a'.repeat(64),
      },
    }, memoryMtlsPolicy],
    ['policy_mismatch', { source_key: 'other-source' }, memoryMtlsPolicy],
    ['policy_mismatch', { source_class: 'other_class' }, memoryMtlsPolicy],
    ['credential_expired', { expires_at: 'not-a-timestamp' }, memoryMtlsPolicy],
  ];

  for (const [expectedReason, overrides, mtlsCredentialPolicy] of cases) {
    await assert.rejects(
      createStore({
        credentials: [mtlsCredential(overrides)],
        mtlsCredentialPolicy,
      }).authenticateMtls({
        deviceId: DEVICE_ID,
        certificateFingerprint: 'a'.repeat(64),
        requiredScope: 'observations:write',
      }),
      (error) => error.mtlsRejectionReason === expectedReason,
      expectedReason,
    );
  }
});

test('memory mTLS classifies absent, fully eligible ambiguity, and mixed ineligible tuples deterministically', async () => {
  const authenticate = (credentials) => createStore({ credentials }).authenticateMtls({
    deviceId: DEVICE_ID,
    certificateFingerprint: 'a'.repeat(64),
    requiredScope: 'observations:write',
  });

  await assert.rejects(authenticate([]), (error) => error.mtlsRejectionReason === 'binding_absent');
  await assert.rejects(authenticate([mtlsCredential(), mtlsCredential({ source_id: 'source-mtls-second' })]),
    (error) => error.mtlsRejectionReason === 'binding_ambiguous');
  await assert.rejects(authenticate([
    mtlsCredential({ enabled: false }),
    mtlsCredential({ source_id: 'source-mtls-scope-missing', scopes: ['cybermap:read'] }),
  ]), (error) => error.mtlsRejectionReason === 'credential_disabled');
});

test('authenticates an enrolled device without retaining the raw token', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  assert.equal(credential.source_id, 'source-owned-device-1');
  assert.equal(JSON.stringify(store).includes(INGEST_TOKEN), false);
  await assert.rejects(
    store.authenticate({ deviceId: DEVICE_ID, token: 'wrong-token-value', requiredScope: 'observations:write' }),
    (error) => error.code === 'forbidden',
  );
});

test('returns only bounded catalog-approved aggregate global cells from memory materialization', async () => {
  const store = new MemoryObservationStore({
    globalSources: [
      {
        layer_id: 'usgs-earthquakes',
        source_class: 'green_public',
        enabled: true,
        global_layer: true,
        terms_reviewed_at: '2026-07-22T00:00:00.000Z',
        allowed_preload: true,
      },
      {
        layer_id: 'orange-exposure',
        source_class: 'orange_exposure',
        enabled: true,
        global_layer: true,
        terms_reviewed_at: '2026-07-22T00:00:00.000Z',
        allowed_preload: true,
      },
      {
        layer_id: 'disabled-greenfeed',
        source_class: 'green_public',
        enabled: false,
        global_layer: true,
        terms_reviewed_at: '2026-07-22T00:00:00.000Z',
        allowed_preload: true,
      },
    ],
    globalCells: [
      {
        h3_cell: '872830828ffffff',
        resolution: 7,
        centroid: { lat: 47.61, lon: -122.33 },
        source_classes: ['green_public'],
        observation_count: 12,
        entity_count: 0,
        first_seen_at: '2026-07-22T19:00:00.000Z',
        last_seen_at: '2026-07-22T19:55:00.000Z',
        layers: { 'usgs-earthquakes': { observation_count: 12 } },
        freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 300 } },
        caveats: ['public_report_not_local_observation'],
        salience: 0.9,
        payload: { bssid: '00:11:22:33:44:55' },
      },
      {
        h3_cell: '872830829ffffff',
        resolution: 7,
        centroid: { lat: 47.62, lon: -122.34 },
        source_classes: ['green_public'],
        observation_count: 4,
        entity_count: 0,
        first_seen_at: '2026-07-22T19:00:00.000Z',
        last_seen_at: '2026-07-22T19:50:00.000Z',
        layers: { 'usgs-earthquakes': { observation_count: 4 } },
        freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 600 } },
        caveats: [],
        salience: 0.2,
      },
      {
        h3_cell: '87283082affffff',
        resolution: 7,
        centroid: { lat: 47.61, lon: -122.33 },
        source_classes: ['orange_exposure'],
        observation_count: 99,
        entity_count: 0,
        first_seen_at: '2026-07-22T19:00:00.000Z',
        last_seen_at: '2026-07-22T19:59:00.000Z',
        layers: { 'orange-exposure': { observation_count: 99 } },
        freshness: { 'orange-exposure': { state: 'fresh', age_seconds: 60 } },
        caveats: [],
        salience: 1,
      },
      {
        h3_cell: '87283082bffffff',
        resolution: 7,
        centroid: { lat: 46.61, lon: -122.33 },
        source_classes: ['green_public'],
        observation_count: 4,
        entity_count: 0,
        first_seen_at: '2026-07-22T19:00:00.000Z',
        last_seen_at: '2026-07-22T19:50:00.000Z',
        layers: { 'usgs-earthquakes': { observation_count: 4 } },
        freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 600 } },
        caveats: [],
        salience: 0.8,
      },
    ],
    now: () => new Date('2026-07-22T20:00:00.000Z'),
  });

  const response = await store.queryGlobalViewport({
    bbox: { west: -123, south: 47, east: -122, north: 48 },
    zoom: 7,
    layer_ids: ['usgs-earthquakes', 'orange-exposure', 'disabled-greenfeed'],
    since: '2026-07-21T00:00:00.000Z',
    max_cells: 1,
  });

  assert.equal(response.selected_resolution, 7);
  assert.equal(response.aggregation_applied, false);
  assert.equal(response.cells.length, 1);
  assert.deepEqual(response.cells[0], {
    h3_cell: '872830828ffffff',
    resolution: 7,
    centroid: { lat: 47.61, lon: -122.33 },
    source_classes: ['green_public'],
    observation_count: 12,
    entity_count: 0,
    first_seen_at: '2026-07-22T19:00:00.000Z',
    last_seen_at: '2026-07-22T19:55:00.000Z',
    layers: { 'usgs-earthquakes': { observation_count: 12 } },
    freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 300 } },
    caveats: ['public_report_not_local_observation'],
    salience: 0.9,
  });
  assert.equal('payload' in response.cells[0], false);
});

test('applies a batch once and replays the identical stored receipt', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  const batch = validBatch();

  const first = await store.applyBatch({ credential, batch });
  const replay = await store.applyBatch({ credential, batch: structuredClone(batch) });

  assert.equal(first.replayed, false);
  assert.equal(first.statusCode, 201);
  assert.equal(first.receipt.status, 'applied');
  assert.equal(first.receipt.accepted_count, 1);
  assert.equal(replay.replayed, true);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(store.observationCount(), 1);
  assert.equal(store.batchCount(), 1);
});

test('v2 applies a derived Wardriver acknowledgement once and replays its immutable receipt', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  const batch = validWardriverV2Batch();

  const first = await store.applyBatch({ credential, batch });
  const replay = await store.applyBatch({ credential, batch: structuredClone(batch) });

  assert.equal(first.statusCode, 201);
  assert.equal(first.receipt.schema_version, 'bss.sync_receipt.v2');
  assert.equal(first.receipt.preserved_conflict_count, 0);
  assert.deepEqual(first.receipt.progress, {
    schema_version: 'bss.wardriver_progress.v1',
    acknowledged_through: '42',
  });
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(store.observationCount(), 1);
});

test('v2 preserves a changed same-device observation as a durable first-writer-wins no-op', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  await store.applyBatch({ credential, batch: validWardriverV2Batch() });

  const changed = validWardriverV2Batch({
    idempotency_key: 'batch-00000000-0000-4000-8000-000000000043',
    observations: [validObservation({ external_observation_key: 'wardriver-observation:42', confidence: 0.2 })],
  });
  const result = await store.applyBatch({ credential, batch: changed });

  assert.equal(result.statusCode, 201);
  assert.equal(result.receipt.accepted_count, 0);
  assert.equal(result.receipt.duplicate_count, 0);
  assert.equal(result.receipt.preserved_conflict_count, 1);
  assert.equal(result.receipt.rejected_count, 0);
  assert.deepEqual(result.receipt.progress, {
    schema_version: 'bss.wardriver_progress.v1',
    acknowledged_through: '42',
  });
  assert.equal(store.observationCount(), 1);
});

test('rejects reuse of a batch key with changed content', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  const first = validBatch();
  await store.applyBatch({ credential, batch: first });

  const changed = validBatch({ observations: [validObservation({ confidence: 0.4 })] });
  await assert.rejects(
    store.applyBatch({ credential, batch: changed }),
    (error) => error.code === 'idempotency_key_reused',
  );
  assert.equal(store.observationCount(), 1);
});

test('observation idempotency includes persisted batch semantics', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  await store.applyBatch({ credential, batch: validBatch() });

  await assert.rejects(
    store.applyBatch({
      credential,
      batch: validBatch({
        idempotency_key: 'batch-00000000-0000-4000-8000-000000000003',
        retention_class: 'summary_only',
      }),
    }),
    (error) => error.code === 'observation_key_reused',
  );
});

test('device-scoped observation identities accept the same Wardriver key from another enrolled device', async () => {
  const secondaryDeviceId = 'wardriver-secondary-device';
  const secondaryToken = `${INGEST_TOKEN}:secondary`;
  const store = new MemoryObservationStore({
    credentials: [
      {
        device_id: DEVICE_ID,
        source_id: 'source-owned-device-1',
        source_class: 'owned_device',
        token_sha256: hashToken(INGEST_TOKEN),
        scopes: ['observations:write'],
        enabled: true,
      },
      {
        device_id: secondaryDeviceId,
        source_id: 'source-owned-device-1',
        source_class: 'owned_device',
        token_sha256: hashToken(secondaryToken),
        scopes: ['observations:write'],
        enabled: true,
      },
    ],
    now: () => new Date('2026-07-29T18:43:00.000Z'),
  });
  const primary = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  const secondary = await store.authenticate({ deviceId: secondaryDeviceId, token: secondaryToken, requiredScope: 'observations:write' });

  await store.applyBatch({ credential: primary, batch: validBatch() });
  const second = await store.applyBatch({
    credential: secondary,
    batch: validBatch({
      device_id: secondaryDeviceId,
      idempotency_key: 'batch-00000000-0000-4000-8000-000000000002',
    }),
  });

  assert.equal(second.statusCode, 201);
  assert.equal(second.receipt.accepted_count, 1);
  assert.equal(second.receipt.duplicate_count, 0);
  assert.equal(store.observationCount(), 2);
});

test('an unscoped legacy observation identity fails closed without a durable receipt', async () => {
  const store = new MemoryObservationStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      token_sha256: hashToken(INGEST_TOKEN),
      scopes: ['observations:write'],
      enabled: true,
    }],
    legacyObservationIdentities: [{
      source_id: 'source-owned-device-1',
      external_observation_key: 'scan-42:wifi:1',
      content_hash: 'a'.repeat(64),
    }],
  });
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });

  await assert.rejects(
    store.applyBatch({ credential, batch: validBatch() }),
    (error) => error.code === 'observation_identity_unscoped' && error.statusCode === 409,
  );
  assert.equal(store.observationCount(), 0);
  assert.equal(store.batchCount(), 0);
});

test('a proven same-device legacy scope is a durable duplicate', async () => {
  const batch = validBatch();
  const store = createStore({
    legacyObservationIdentities: [{
      source_id: 'source-owned-device-1',
      producer_device_id: DEVICE_ID,
      external_observation_key: batch.observations[0].external_observation_key,
      content_hash: hashPersistedObservation(batch, batch.observations[0]),
    }],
  });
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });

  const result = await store.applyBatch({ credential, batch });

  assert.equal(result.statusCode, 201);
  assert.equal(result.receipt.accepted_count, 0);
  assert.equal(result.receipt.duplicate_count, 1);
  assert.equal(store.observationCount(), 0);
  assert.equal(store.batchCount(), 1);
});

test('v2 treats changed content for a proven same-device legacy identity as a bounded first-writer-wins no-op', async () => {
  const original = validWardriverV2Batch();
  const changed = validWardriverV2Batch({
    idempotency_key: 'batch-00000000-0000-4000-8000-000000000043',
    observations: [validObservation({ external_observation_key: 'wardriver-observation:42', confidence: 0.2 })],
  });
  const store = createStore({
    legacyObservationIdentities: [{
      source_id: 'source-owned-device-1',
      producer_device_id: DEVICE_ID,
      external_observation_key: 'wardriver-observation:42',
      content_hash: hashPersistedObservation(original, original.observations[0]),
    }],
  });
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });

  const result = await store.applyBatch({ credential, batch: changed });

  assert.equal(result.statusCode, 201);
  assert.equal(result.receipt.accepted_count, 0);
  assert.equal(result.receipt.duplicate_count, 0);
  assert.equal(result.receipt.preserved_conflict_count, 1);
  assert.equal(result.receipt.progress.acknowledged_through, '42');
  assert.equal(store.observationCount(), 0);
  assert.equal(store.batchCount(), 1);
});

test('a legacy scope for another device does not block this device-local key', async () => {
  const batch = validBatch();
  const store = createStore({
    legacyObservationIdentities: [{
      source_id: 'source-owned-device-1',
      producer_device_id: 'wardriver-legacy-device',
      external_observation_key: batch.observations[0].external_observation_key,
      content_hash: hashPersistedObservation(batch, batch.observations[0]),
    }],
  });
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });

  const result = await store.applyBatch({ credential, batch });

  assert.equal(result.statusCode, 201);
  assert.equal(result.receipt.accepted_count, 1);
  assert.equal(result.receipt.duplicate_count, 0);
  assert.equal(store.observationCount(), 1);
});

test('a malformed same-device legacy scope fails closed without a receipt', async () => {
  const batch = validBatch();
  const store = createStore({
    legacyObservationIdentities: [{
      source_id: 'source-owned-device-1',
      producer_device_id: DEVICE_ID,
      external_observation_key: batch.observations[0].external_observation_key,
      content_hash: 'not-a-valid-content-hash',
    }],
  });
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });

  await assert.rejects(
    store.applyBatch({ credential, batch }),
    (error) => error.code === 'observation_identity_unscoped' && error.statusCode === 409,
  );
  assert.equal(store.observationCount(), 0);
  assert.equal(store.batchCount(), 0);
});

test('paper snapshots replay only exact key/payload pairs and reject older or equal-time changed state', async () => {
  const store = createStore();
  const firstState = {
    generated_at: '2026-07-11T18:43:00.000Z',
    paper_only: true,
    sequence: 1,
  };
  const first = await store.putPaperState({ idempotencyKey: 'paper-key-1', state: firstState });
  const replay = await store.putPaperState({ idempotencyKey: 'paper-key-1', state: structuredClone(firstState) });
  assert.equal(first.statusCode, 201);
  assert.equal(first.replayed, false);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.replayed, true);

  await assert.rejects(
    store.putPaperState({
      idempotencyKey: 'paper-key-older',
      state: { ...firstState, generated_at: '2026-07-11T18:42:59.999Z' },
    }),
    (error) => error.code === 'stale_paper_state' && error.statusCode === 409,
  );
  await assert.rejects(
    store.putPaperState({
      idempotencyKey: 'paper-key-equal-changed',
      state: { ...firstState, sequence: 2 },
    }),
    (error) => error.code === 'paper_state_conflict' && error.statusCode === 409,
  );
  assert.deepEqual((await store.getPaperState()).state, firstState);
});

test('counts an exact observation replay under a new batch and rejects changed-content key reuse', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  await store.applyBatch({ credential, batch: validBatch() });

  const duplicate = await store.applyBatch({ credential, batch: validBatch({ idempotency_key: 'batch-00000000-0000-4000-8000-000000000002' }) });
  assert.equal(duplicate.receipt.accepted_count, 0);
  assert.equal(duplicate.receipt.duplicate_count, 1);
  assert.equal(store.observationCount(), 1);

  await assert.rejects(
    store.applyBatch({
      credential,
      batch: validBatch({
        idempotency_key: 'batch-00000000-0000-4000-8000-000000000003',
        observations: [validObservation({ confidence: 0.2 })],
      }),
    }),
    (error) => error.code === 'observation_key_reused',
  );
  assert.equal(store.batchCount(), 2);
});
