import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { companionRoute, companionUrl } from '../api/_private/operator/assets/companion-navigation.mjs';

test('companion routes are explicit and retain filters and selection', () => {
  const routes = { godeye: 'travels', entities: 'entities', world: 'world', devices: 'devices', fleet: 'fleet' };
  for (const [key, path] of Object.entries(routes)) {
    const url = companionUrl(key, 'https://example.test/operator/travels?layers=owned&selected=cell-1');
    assert.equal(url, `/operator/${path}?layers=owned&selected=cell-1`);
    assert.equal(companionRoute(new URL(url, 'https://example.test').pathname), key);
  }
  assert.equal(companionRoute('/'), 'godeye');
  assert.equal(companionRoute('/operator/unknown'), 'godeye');
  assert.throws(() => companionUrl('tzeentch', 'https://example.test/'), TypeError);
});

test('primary companion shell has five links, existing release card in Devices and no experiments', () => {
  const shell = readFileSync(new URL('../api/_private/operator/shell.html', import.meta.url), 'utf8');
  for (const route of ['travels', 'entities', 'world', 'devices', 'fleet']) assert.match(shell, new RegExp(`href="/operator/${route}"`));
  assert.doesNotMatch(shell, /data-tab="(?:landing|tzeentch|morning-brief|slang)"/);
  assert.match(shell, /id="devices-tab"[\s\S]*data-operator-release-card/);
  assert.match(shell, /data-check-release/);
  assert.match(shell, /data-entity-workbench/);
  assert.match(shell, /id="fleet-tab"[^>]*aria-labelledby="tab-fleet"/);
  assert.match(shell, /<section[^>]*data-fleet-view/);
  assert.match(shell, /unrelated public context/i);
});


test('experiment routes, startup hooks and asset grants are retired without deleting backend APIs', () => {
  const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const main = read('api/_private/operator/assets/main.js');
  const loader = read('app/operator/loader.js');
  const assets = read('api/operator-assets/index.js');
  for (const name of ['tzeentch.mjs', 'morning-brief.mjs', 'tzeentch-dashboard.mjs', 'chained-daemon.mjs']) {
    assert.equal(main.includes(name), false);
    assert.equal(loader.includes(name), false);
    assert.equal(assets.includes(name), false);
  }
  assert.deepEqual(JSON.parse(read('app/staticwebapp.config.json')).routes.find((route) => route.route === '/operator/morning-brief.html'), { route: '/operator/morning-brief.html', statusCode: 404 });
  assert.match(read('api/morning-brief/index.js'), /requireOperatorToken/);
  assert.match(read('api/tzeentch/index.js'), /requireOperatorToken/);
});


test('Fleet uses the existing private loader route and dependency order', () => {
  const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const config = JSON.parse(read('app/staticwebapp.config.json'));
  const fleetRoute = config.routes.find((route) => route.route === '/operator/fleet');
  assert.deepEqual(fleetRoute, {
    route: '/operator/fleet',
    rewrite: '/operator/index.html',
    allowedRoles: ['anonymous', 'authenticated'],
  });
  const loader = read('app/operator/loader.js');
  const order = [...loader.match(/const MODULE_BOOT_ORDER = Object.freeze\(\[([\s\S]*?)\]\);/)[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(order.indexOf('fleet-state.mjs') > -1);
  assert.ok(order.indexOf('fleet-state.mjs') < order.indexOf('fleet-elements.mjs'));
  assert.ok(order.indexOf('fleet-elements.mjs') < order.indexOf('fleet-view.mjs'));
  assert.ok(order.indexOf('fleet-view.mjs') < order.indexOf('main.js'));
  assert.match(loader, /installPrivateStyle\('bss-fleet-styles', sources\['fleet\.css'\]\)/);
  assert.doesNotMatch(read('app/operator/index.html'), /data-fleet-view|fleet-state\.mjs|fleet-elements\.mjs|fleet-view\.mjs/);
});
