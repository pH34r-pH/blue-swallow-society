import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/owner/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '');
const settle = () => new Promise((resolve) => setImmediate(resolve));

function entry(search = '') {
  const requests = [], timeouts = [], listeners = {};
  const status = { textContent: 'Checking your session…' };
  const button = { disabled: false, addEventListener(name, handler) { listeners[name] = handler; } };
  const body = { dataset: {} };
  const window = { location: { origin: 'https://owner.example.test', search, assign() {}, replace() {} },
    addEventListener() {}, setTimeout() {}, clearTimeout() {} };
  const context = vm.createContext({ URL, URLSearchParams, window, history: { replaceState() {} },
    document: { body, getElementById: (id) => id === 'authStatus' ? status : button },
    activateOperatorSession: () => true, bootOperatorSurface: async () => {},
    AbortSignal: { timeout(milliseconds) {
      const controller = new AbortController();
      timeouts.push({ milliseconds, controller });
      return controller.signal;
    } },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        requests.push({ url, respond(status, data) { resolve({ status, ok: status === 200, json: async () => data }); } });
      });
    },
  });
  vm.runInContext(source, context);
  return { status, button, body, requests, click: () => listeners.click(),
    expire(milliseconds) {
      const timeout = timeouts.find((item) => item.milliseconds === milliseconds);
      assert.ok(timeout, `expected a ${milliseconds}ms request bound`);
      timeout.controller.abort(new Error('synthetic timeout'));
    } };
}

test('owner session restoration recovers from a held request after ten seconds', async () => {
  const page = entry();
  assert.equal(page.requests[0].url, '/api/owner-auth/session');
  page.expire(10000);
  await settle();
  assert.equal(page.body.dataset.authState, 'unavailable');
  assert.equal(page.button.disabled, false);
});

test('owner login recovers from a held request after fifteen seconds', async () => {
  const page = entry('?auth=signed-out');
  const pending = page.click();
  assert.match(page.requests[0].url, /^\/api\/owner-auth\/login\?/);
  assert.equal(page.status.textContent, 'Opening Microsoft sign-in…');
  assert.equal(page.button.disabled, true);
  page.expire(15000);
  await pending;
  assert.equal(page.body.dataset.authState, 'unavailable');
  assert.equal(page.button.disabled, false);
});

test('a late session response or timeout cannot overwrite a newer owner login', async () => {
  for (const outcome of ['response', 'timeout']) {
    const page = entry();
    const pending = page.click();
    if (outcome === 'response') page.requests[0].respond(401, { ok: false, error: 'signed_out' });
    else page.expire(10000);
    await settle();
    assert.equal(page.status.textContent, 'Opening Microsoft sign-in…');
    assert.equal(page.button.disabled, true);
    page.requests[1].respond(503, { ok: false, error: 'owner_auth_unavailable' });
    await pending;
    assert.equal(page.body.dataset.authState, 'unavailable');
    assert.equal(page.button.disabled, false);
  }
});
