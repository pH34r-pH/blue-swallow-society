import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ContractError,
  hashCanonicalJson,
  hashPersistedObservation,
  validateObservationBatch,
} from '../src/contracts.mjs';
import { validBatch, validObservation } from './helpers.mjs';

const NOW = Date.parse('2026-07-11T18:43:00.000Z');

test('validates and freezes the canonical Wardriver observation batch contract', () => {
  const batch = validBatch();
  const validated = validateObservationBatch(batch, { now: NOW });

  assert.equal(validated.schema_version, 'bss.observation_batch.v1');
  assert.equal(validated.observations.length, 1);
  assert.equal(validated.observations[0].kind, 'wifi_ap');
  assert.equal(validated.observations[0].payload.bssid_hmac.startsWith('hmac-sha256:'), true);
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.observations[0]), true);
});

test('canonical hashing is stable across object key order', () => {
  assert.equal(hashCanonicalJson({ b: 2, a: { d: 4, c: 3 } }), hashCanonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
});

test('persisted observation hash includes batch-level storage semantics', () => {
  const observation = validObservation();
  const hashOnly = hashPersistedObservation(validBatch(), observation);
  const summaryOnly = hashPersistedObservation(validBatch({ retention_class: 'summary_only' }), observation);
  assert.notEqual(hashOnly, summaryOnly);
});

test('rejects unknown envelope fields and server-derived observation fields', () => {
  assert.throws(
    () => validateObservationBatch(validBatch({ source_id: 'client-controlled' }), { now: NOW }),
    (error) => error instanceof ContractError && error.code === 'unknown_field',
  );
  assert.throws(
    () => validateObservationBatch(validBatch({ observations: [validObservation({ h3_9: 'client-controlled' })] }), { now: NOW }),
    (error) => error instanceof ContractError && error.code === 'unknown_field',
  );
});

test('preserves passively observed broadcast identifiers and frame metadata for cross-reference', () => {
  const payload = {
    bssid: '00:11:22:33:44:55',
    ssid: 'Public Broadcast Name',
    macAddress: '0011.2233.4455',
    raw_frame: 'base64:passive-management-frame',
    nested: { network_identifier: '001122334455' },
  };
  const observation = validObservation({ external_observation_key: '00:11:22:33:44:55', payload });
  const validated = validateObservationBatch(validBatch({ observations: [observation] }), { now: NOW });
  assert.deepEqual(validated.observations[0].payload, payload);
  assert.equal(validated.observations[0].external_observation_key, '00:11:22:33:44:55');
});

test('requires timezone-qualified RFC3339 timestamps and UUID session ids', () => {
  assert.throws(
    () => validateObservationBatch(validBatch({ client_clock: '2026-07-11T18:42:31' }), { now: NOW }),
    (error) => error instanceof ContractError && error.code === 'invalid_timestamp',
  );
  assert.throws(
    () => validateObservationBatch(validBatch({ client_clock: '2026-99-99T99:99:99Z' }), { now: NOW }),
    (error) => error instanceof ContractError && error.code === 'invalid_timestamp',
  );
  assert.throws(
    () => validateObservationBatch(validBatch({ session_id: 'not-a-uuid' }), { now: NOW }),
    (error) => error instanceof ContractError && error.code === 'invalid_uuid',
  );
});

test('rejects duplicate observation keys and observations too far in the future', () => {
  const duplicate = validObservation();
  assert.throws(
    () => validateObservationBatch(validBatch({ observations: [duplicate, { ...duplicate }] }), { now: NOW }),
    (error) => error instanceof ContractError && error.code === 'duplicate_observation_key',
  );
  assert.throws(
    () => validateObservationBatch(validBatch({ observations: [validObservation({ observed_at: '2026-07-11T18:49:00.000Z' })] }), { now: NOW }),
    (error) => error instanceof ContractError && error.code === 'future_observation',
  );
});
