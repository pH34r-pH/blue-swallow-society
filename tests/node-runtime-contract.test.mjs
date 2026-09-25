import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const selected = read('.nvmrc').trim();

test('Society runs its source qualification on the selected Node 24 runtime', () => {
  assert.equal(selected, '24');
  assert.equal(process.versions.node.split('.')[0], selected,
    'Use nvm use or actions/setup-node with .nvmrc before installing or testing');
});

for (const directory of ['api', 'vm/cybermap-api']) {
  test(`${directory} native manifest and lock agree on the selected Node major`, () => {
    const manifest = json(`${directory}/package.json`);
    const locked = json(`${directory}/package-lock.json`).packages[''];
    assert.equal(manifest.engines.node, `>=${selected}.0.0 <${Number(selected) + 1}`);
    assert.deepEqual(locked.engines, manifest.engines);
    assert.deepEqual(locked.dependencies, manifest.dependencies);
  });
}

test('the desired API runtime matches native requirements, not a live deployment claim', () => {
  assert.equal(json('app/staticwebapp.config.json').platform.apiRuntime, `node:${selected}`);
});
