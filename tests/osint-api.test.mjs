import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/osint/index.js');

test('osint internals reject private, link-local, and reserved IP targets', () => {
  const internals = handler._internals;
  assert.ok(internals, 'osint handler should expose testable safety internals');

  [
    'localhost',
    'router.local',
    '127.0.0.1',
    '10.0.0.7',
    '172.16.4.9',
    '192.168.1.1',
    '169.254.10.20',
    '100.64.0.1',
    '0.0.0.0',
    '192.0.2.15',
    '198.51.100.23',
    '203.0.113.42',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd00::1',
    '2001:db8::1',
  ].forEach((target) => {
    assert.equal(internals.isUnsafeHostName(target), true, `${target} should be unsafe`);
  });

  assert.equal(internals.isUnsafeHostName('8.8.8.8'), false);
  assert.equal(internals.isUnsafeHostName('example.com'), false);
});

test('osint web probe rejects DNS resolutions to private addresses before fetch', async () => {
  const internals = handler._internals;
  assert.ok(internals?.setDnsLookupForTests, 'expected DNS injection test hook');
  assert.ok(internals?.probePublicUrl, 'expected probePublicUrl test hook');

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('<title>bad</title>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  internals.setDnsLookupForTests(async () => [{ address: '127.0.0.1', family: 4 }]);

  try {
    await assert.rejects(() => internals.probePublicUrl('https://example.test/'), /private|reserved|public/i);
    assert.equal(fetchCalled, false, 'fetch must not run after private DNS resolution');
  } finally {
    globalThis.fetch = originalFetch;
    internals.resetDnsLookupForTests?.();
  }
});

test('osint web probe manually revalidates redirect targets before following', async () => {
  const internals = handler._internals;
  const originalFetch = globalThis.fetch;
  const fetched = [];

  internals.setDnsLookupForTests(async (hostname) => {
    if (hostname === 'public.example') {
      return [{ address: '93.184.216.34', family: 4 }];
    }
    if (hostname === 'private.example') {
      return [{ address: '10.0.0.5', family: 4 }];
    }
    throw new Error(`unexpected host ${hostname}`);
  });

  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return new Response('', {
      status: 302,
      headers: { location: 'https://private.example/admin' },
    });
  };

  try {
    await assert.rejects(() => internals.probePublicUrl('https://public.example/start'), /private|reserved|public/i);
    assert.deepEqual(fetched, ['https://public.example/start']);
  } finally {
    globalThis.fetch = originalFetch;
    internals.resetDnsLookupForTests?.();
  }
});
