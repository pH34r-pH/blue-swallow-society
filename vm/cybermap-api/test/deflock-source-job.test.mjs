import test from 'node:test';
import assert from 'node:assert/strict';

import { runDeflockSourceProcess } from '../src/deflock-source-job.mjs';

test('DeFlock source process reads the durable enabled catalog entry before running the bounded worker', async () => {
  const calls = [];
  const store = {
    async getDeflockSource(sourceKey) {
      calls.push({ kind: 'catalog', sourceKey });
      return { source_key: sourceKey, enabled: true, terms_reviewed: true };
    },
  };
  const expected = { outcome: 'success', item_count: 3 };
  const result = await runDeflockSourceProcess({
    store,
    runSourceJob: async ({ source, store: suppliedStore }) => {
      calls.push({ kind: 'worker', source, suppliedStore });
      return expected;
    },
  });
  assert.equal(result, expected);
  assert.deepEqual(calls, [
    { kind: 'catalog', sourceKey: 'deflock-osm-alpr-reports' },
    { kind: 'worker', source: { source_key: 'deflock-osm-alpr-reports', enabled: true, terms_reviewed: true }, suppliedStore: store },
  ]);
});
