import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateCommand, validateList } from '../src/entity-contract.mjs';
import { createEntityService } from '../src/entity-service.mjs';

const id = randomUUID();
const command = { action: 'create', entity_id: id, expected_revisions: { [id]: 0 },
  idempotency_key: 'synthetic-request', reason: 'Synthetic test correction', evidence_ids: [], device_ids: [] };
test('strict entity bounds reject client actor, timestamps, unknown fields and malformed revisions', () => {
  for (const extra of [{ actor_id: 'forged' }, { created_at: '2026-01-01' }, { source_class: 'green_public' }]) {
    assert.throws(() => validateCommand({ ...command, ...extra }), { code: 'invalid_entity_request' });
  }
  for (const limit of [0, -1, 101, '10']) assert.throws(() => validateList({ limit }));
  assert.throws(() => validateList({ sort: 'label; DROP TABLE observations' }));
  assert.throws(() => validateList({ min_confidence: NaN }));
  assert.throws(() => validateCommand({ ...command, expected_revisions: { [id]: -1 } }));
  assert.equal(validateCommand(command).label, null);
});
test('entity service fails closed and READ verification cannot authorize writes or previews', async () => {
  const calls = [];
  const store = { list: async (input) => { calls.push(input); return 'read'; }, mutate: async (input) => input };
  const read = async () => ({ exact_owner: true, actor_id: 'synthetic-tenant:synthetic-owner' });
  for (const operation of ['list', 'detail', 'preview', 'mutate']) {
    await assert.rejects(createEntityService({ store }).handle({ operation }), { code: 'forbidden' });
  }
  const service = createEntityService({ store, authorizeOwner: read });
  assert.equal(await service.handle({ operation: 'list', input: {} }), 'read');
  for (const operation of ['mutate', 'preview']) await assert.rejects(service.handle({ operation }), { code: 'forbidden' });
  for (const owner of [undefined, { actor_id: 'forged' }, { exact_owner: true }, { exact_owner: true, actor_id: '' }]) {
    await assert.rejects(createEntityService({ store, authorizeMutation: async () => owner }).handle({ operation: 'mutate' }), { code: 'forbidden' });
  }
  const verified = createEntityService({ store, authorizeMutation: read });
  const result = await verified.handle({ operation: 'mutate', actor_id: 'forged', input: command });
  assert.equal(result.actor_id, 'synthetic-tenant:synthetic-owner');
  assert.equal(calls.length, 1);
});
