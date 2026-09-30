import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { companionRoute, companionUrl } from '../api/_private/operator/assets/companion-navigation.mjs';

test('companion routes are explicit and retain filters and selection', () => {
  const routes = { godeye: 'travels', entities: 'entities', world: 'world', devices: 'devices' };
  for (const [key, path] of Object.entries(routes)) {
    const url = companionUrl(key, 'https://example.test/operator/travels?layers=owned&selected=cell-1');
    assert.equal(url, `/operator/${path}?layers=owned&selected=cell-1`);
    assert.equal(companionRoute(new URL(url, 'https://example.test').pathname), key);
  }
  assert.equal(companionRoute('/'), 'godeye');
  assert.equal(companionRoute('/operator/unknown'), 'godeye');
  assert.throws(() => companionUrl('tzeentch', 'https://example.test/'), TypeError);
});

test('primary companion shell has four links, existing release card in Devices and no experiments', () => {
  const shell = readFileSync(new URL('../api/_private/operator/shell.html', import.meta.url), 'utf8');
  for (const route of ['travels', 'entities', 'world', 'devices']) assert.match(shell, new RegExp(`href="/operator/${route}"`));
  assert.doesNotMatch(shell, /data-tab="(?:landing|tzeentch|morning-brief|slang)"/);
  assert.match(shell, /id="devices-tab"[\s\S]*data-operator-release-card/);
  assert.match(shell, /data-check-release/);
  assert.match(shell, /Entity review is unavailable/);
  assert.match(shell, /unrelated public context/i);
});
