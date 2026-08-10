import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tasksFile = new URL('../../../specs/020-wardriver-desktop-mtls-proof/tasks.md', import.meta.url);

test('Spec 020 task ledger preserves complete review-gate statements without compaction artifacts', async () => {
  const tasks = await readFile(tasksFile, 'utf8');
  assert.doesNotMatch(tasks, /\[truncated\]/i);
  assert.match(tasks, /T018\b/);
  assert.match(tasks, /T019\b/);
  assert.match(tasks, /T020\b/);
});
