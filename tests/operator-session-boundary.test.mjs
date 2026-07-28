import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const publicMain = read('app/main.js');
const operatorMain = read('app/operator/main.js');
const agent = read('app/operator/agent.js');
const loader = read('app/operator/loader.js');
const sessionModule = read('app/operator/operator-session.mjs');
const passcodeApi = read('api/validate-passcode/index.js');

test('operator access material is memory-only and only the session module injects it into requests', () => {
  for (const source of [publicMain, operatorMain, agent, loader]) {
    assert.doesNotMatch(source, /blue-swallow-society:operator-session/);
    assert.doesNotMatch(source, /sessionStorage\.(?:getItem|setItem|removeItem)\([^)]*operator/);
  }
  assert.doesNotMatch(sessionModule, /sessionStorage|localStorage/);
  assert.match(sessionModule, /let activeSession = null/);
  assert.match(sessionModule, /operatorFetch/);
  assert.match(sessionModule, /X-Blue-Swallow-Operator-Token/);
});

test('passcode issuance does not claim a Set-Cookie transport that SWA does not preserve', () => {
  assert.doesNotMatch(passcodeApi, /Set-Cookie/);
  assert.doesNotMatch(passcodeApi, /buildOperatorSessionCookie/);
});
