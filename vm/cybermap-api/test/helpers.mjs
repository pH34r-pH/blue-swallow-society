export const INGEST_TOKEN = 'test-ingest-token-32-bytes-minimum-value';
export const DEVICE_ID = 'wardriver-test-device';

export function validObservation(overrides = {}) {
  return {
    external_observation_key: 'scan-42:wifi:1',
    kind: 'wifi_ap',
    observed_at: '2026-07-11T18:42:29.814Z',
    location: {
      latitude: 47.6062,
      longitude: -122.3321,
      accuracy_m: 8.4,
    },
    confidence: 0.82,
    payload: {
      bssid_hmac: 'hmac-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ssid_hmac: 'hmac-sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      rssi_dbm: -67,
      frequency_mhz: 2412,
      passive_only: true,
    },
    provenance: {
      collector: 'co.blueswallow.wardriver',
      app_version: '2.109-bss.1',
    },
    ...overrides,
  };
}

export function validBatch(overrides = {}) {
  return {
    schema_version: 'bss.observation_batch.v1',
    idempotency_key: 'batch-00000000-0000-4000-8000-000000000001',
    device_id: DEVICE_ID,
    session_id: null,
    client_clock: '2026-07-11T18:42:31.120Z',
    redaction_class: 'hashed',
    retention_class: 'hash_only',
    observations: [validObservation()],
    ...overrides,
  };
}

export async function withServer(server, run) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

export function ingestHeaders(batch, overrides = {}) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'x-blue-swallow-ingest-token': INGEST_TOKEN,
    'x-blue-swallow-device-id': batch.device_id,
    'idempotency-key': batch.idempotency_key,
    ...overrides,
  };
}
