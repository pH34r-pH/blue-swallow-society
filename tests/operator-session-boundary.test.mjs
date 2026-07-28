import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const publicMain = read('app/main.js');
const loader = read('app/operator/loader.js');
const sessionModule = read('app/operator/operator-session.mjs');
const privateSessionModule = read('api/_private/operator/assets/operator-session.mjs');
const privateMain = read('api/_private/operator/assets/main.js');
const privateTzeentch = read('api/_private/operator/assets/tzeentch.mjs');
const privateMorningBrief = read('api/_private/operator/assets/morning-brief.mjs');
const passcodeApi = read('api/validate-passcode/index.js');

test('operator access material is memory-only across the public handoff and sealed private asset graph', () => {
  for (const source of [publicMain, loader, privateMain, privateTzeentch, privateMorningBrief]) {
    assert.doesNotMatch(source, /blue-swallow-society:operator-session/);
    assert.doesNotMatch(source, /sessionStorage\.(?:getItem|setItem|removeItem)\([^)]*operator/);
  }
  for (const source of [sessionModule, privateSessionModule]) {
    assert.doesNotMatch(source, /sessionStorage|localStorage/);
    assert.match(source, /let activeSession = null/);
    assert.match(source, /X-Blue-Swallow-Operator-Token/);
  }
  assert.match(sessionModule, /operatorFetch/);
  assert.match(loader, /activateOperatorSession/);
  assert.match(loader, /bootOperatorSurface/);
  assert.match(privateMain, /bootOperatorSurface/);
  assert.match(privateMain, /api\/operator-signals/);
});

test('passcode issuance does not claim a Set-Cookie transport that SWA does not preserve', () => {
  assert.doesNotMatch(passcodeApi, /Set-Cookie/);
  assert.doesNotMatch(passcodeApi, /buildOperatorSessionCookie/);
});
