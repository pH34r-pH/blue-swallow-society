import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateObservationBatch } from '../src/contracts.mjs';

const v1FixtureUrl = new URL('../../../shared/contracts/bss.observation_batch.v1.wardriver-golden.json', import.meta.url);
const v2FixtureUrl = new URL('../../../shared/contracts/bss.observation_batch.v2.wardriver-golden.json', import.meta.url);

// Mirrors BssVmObservationBatchTest.serializesTheCanonicalAuthenticatedIdempotentBatchContract.
test('Wardriver golden bss.observation_batch.v1 fixture conforms to the VM contract', async () => {
  const fixture = JSON.parse(await readFile(v1FixtureUrl, 'utf8'));
  const validated = validateObservationBatch(fixture, { now: Date.parse('2026-07-11T18:43:00.000Z') });
  assert.equal(validated.schema_version, 'bss.observation_batch.v1');
  assert.equal(validated.redaction_class, 'hashed');
  assert.equal(validated.retention_class, 'hash_only');
  assert.equal(validated.observations[0].payload.bssid_hmac, fixture.observations[0].payload.bssid_hmac);
  assert.equal(validated.observations[0].provenance.collector, 'co.blueswallow.wardriver');
});

test('Wardriver golden bss.observation_batch.v2 fixture conforms with a derived progress request', async () => {
  const fixture = JSON.parse(await readFile(v2FixtureUrl, 'utf8'));
  const validated = validateObservationBatch(fixture, { now: Date.parse('2026-07-11T18:43:00.000Z') });
  assert.equal(validated.schema_version, 'bss.observation_batch.v2');
  assert.deepEqual(validated.progress, {
    schema_version: 'bss.wardriver_progress.v1',
    requested_through: '42',
  });
  assert.equal(validated.observations[0].external_observation_key, 'wardriver-observation:42');
  assert.equal(validated.observations[0].provenance.collector, 'co.blueswallow.wardriver');
});
