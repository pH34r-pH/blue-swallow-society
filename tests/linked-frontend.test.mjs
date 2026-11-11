import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareFrontend } from '../scripts/prepare-linked-frontend.mjs';

test('linked frontend is source-bound, omits managed runtime and refuses overwrite', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'society-frontend-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const first = join(root, 'first'); const second = join(root, 'second');
  const manifest = await prepareFrontend(commit, first);
  assert.equal(manifest.sourceCommit, commit);
  assert.ok(manifest.files['index.html']); assert.ok(manifest.files['staticwebapp.config.json']);
  assert.equal(manifest.files['AGENTS.md'], undefined);
  const config = JSON.parse(await readFile(join(first, 'site', 'staticwebapp.config.json'), 'utf8'));
  assert.equal(config.platform, undefined);
  const original = JSON.parse(execFileSync('git', ['show', `${commit}:app/staticwebapp.config.json`], { encoding: 'utf8' }));
  delete original.platform; assert.deepEqual(config, original);
  assert.deepEqual(await prepareFrontend(commit, second), manifest);
  await assert.rejects(prepareFrontend(commit, first), { code: 'EEXIST' });
  await assert.rejects(prepareFrontend('not-a-commit', join(root, 'invalid')));
});
