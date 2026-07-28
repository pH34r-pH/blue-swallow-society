import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateObservationBatch } from '../src/contracts.mjs';

const fixtureUrl = new URL('../../../shared/contracts/bss.observation_batch.v1.wardriver-golden.json', import.meta.url);

// Mirrors BssVmObservationBatchTest.serializesTheCanonicalAuthenticatedIdempotentBatchContract.
test('Wardriver golden bss.observation_batch.v1 fixture conforms to the VM contract', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const validated = validateObservationBatch(fixture, { now: Date.parse('2026-07-11T18:43:00.000Z') });
  assert.equal(validated.schema_version, 'bss.observation_batch.v1');
  assert.equal(validated.redaction_class, 'hashed');
  assert.equal(validated.retention_class, 'hash_only');
  assert.equal(validated.observations[0].payload.bssid_hmac, fixture.observations[0].payload.bssid_hmac);
  assert.equal(validated.observations[0].provenance.collector, 'co.blueswallow.wardriver');
});
