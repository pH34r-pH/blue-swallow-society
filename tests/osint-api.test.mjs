import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
const handler = require('../api/osint/index.js');
const safety = require('../api/osint/safety.js');
const classifier = require('../api/osint/classifier.js');

function probeResponse({
  status = 200,
  url = 'https://public.example/',
  headers = { 'content-type': 'text/html' },
  body = '<title>safe</title>',
  peerAddress = '93.184.216.34',
} = {}) {
  return { status, url, headers: new Headers(headers), body, peerAddress };
}

function resetSafetyHooks() {
  safety.resetDnsLookupForTests?.();
  safety.resetHttpsRequestForTests?.();
  safety.resetPinnedRequesterForTests?.();
}

test('osint safety module rejects private, link-local, and reserved IP targets', () => {
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
    '::ffff:127.0.0.1',
    '::ffff:c0a8:0001',
    'fe80::1',
    'fc00::1',
    'fd00::1',
    '2001:db8::1',
  ].forEach((target) => {
    assert.equal(safety.isUnsafeHostName(target), true, `${target} should be unsafe`);
  });

  assert.equal(safety.isUnsafeHostName('8.8.8.8'), false);
  assert.equal(safety.isUnsafeHostName('example.com'), false);
});

test('osint target classifier module normalizes reusable scan modes', () => {
  assert.deepEqual(classifier.classifyTarget('HTTPS://Example.COM/Path?q=1', 'auto'), {
    kind: 'url',
    label: 'URL',
    normalized: 'https://example.com/Path?q=1',
    summary: 'URL + domain intelligence',
    headline: 'URL scan for example.com',
    signalQuery: 'example.com',
  });

  assert.deepEqual(classifier.classifyTarget('@BlueSwallow', 'auto'), {
    kind: 'handle',
    label: 'Handle',
    normalized: 'BlueSwallow',
    summary: 'Public username traces',
    headline: 'Handle scan for BlueSwallow',
    signalQuery: 'BlueSwallow',
  });
});

test('osint web probe rejects private DNS answers before opening a pinned request', async () => {
  assert.ok(safety.setDnsLookupForTests, 'expected DNS injection test hook');
  assert.ok(safety.setPinnedRequesterForTests, 'expected pinned requester test hook');
  let requestOpened = false;
  safety.setDnsLookupForTests(async () => [{ address: '127.0.0.1', family: 4 }]);
  safety.setPinnedRequesterForTests(async () => {
    requestOpened = true;
    return probeResponse();
  });

  try {
    await assert.rejects(() => safety.probePublicUrl('https://example.test/'), /private|reserved|public/i);
    assert.equal(requestOpened, false, 'no requester may open after a private DNS answer');
  } finally {
    resetSafetyHooks();
  }
});

test('osint web probe binds its HTTPS request to the validated public address', async () => {
  const requests = [];
  safety.setDnsLookupForTests(async (hostname) => {
    assert.equal(hostname, 'rebind.example');
    return [{ address: '93.184.216.34', family: 4 }];
  });
  safety.setPinnedRequesterForTests(async (request) => {
    requests.push(request);
    assert.deepEqual(request.addresses, [{ address: '93.184.216.34', family: 4 }]);
    assert.equal(request.url, 'https://rebind.example/probe');
    return probeResponse({ url: request.url, peerAddress: request.addresses[0].address });
  });

  try {
    const result = await safety.probePublicUrl('https://rebind.example/probe');
    assert.equal(result.status, 200);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].addresses[0].address, '93.184.216.34');
  } finally {
    resetSafetyHooks();
  }
});

test('default OSINT HTTPS transport pins Node lookup to the vetted DNS address while retaining hostname TLS', async () => {
  const requests = [];
  safety.setDnsLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }]);
  safety.setHttpsRequestForTests((options, onResponse) => {
    requests.push(options);
    let lookedUp;
    options.lookup(options.hostname, {}, (error, address, family) => {
      assert.equal(error, null);
      lookedUp = { address, family };
    });
    assert.deepEqual(lookedUp, { address: '93.184.216.34', family: 4 });
    assert.equal(options.hostname, 'rebind.example');
    assert.equal(options.servername, 'rebind.example');
    assert.equal(options.agent, false);

    const response = Readable.from([Buffer.from('<title>safe</title>')]);
    response.statusCode = 200;
    response.headers = { 'content-type': 'text/html' };
    response.socket = { remoteAddress: lookedUp.address };

    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.destroy = (error) => request.emit('error', error);
    request.end = () => queueMicrotask(() => onResponse(response));
    return request;
  });

  try {
    const result = await safety.probePublicUrl('https://rebind.example/probe');
    assert.equal(result.status, 200);
    assert.equal(requests.length, 1);
  } finally {
    resetSafetyHooks();
  }
});

test('OSINT HTTPS transport enforces an absolute deadline despite a slow trickle response', async () => {
  let activeRequest;
  let stopStream = () => {};
  let destroyCalls = 0;
  safety.setDnsLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }]);
  safety.setHttpsRequestForTests((_options, onResponse) => {
    const response = new Readable({ read() {} });
    response.statusCode = 200;
    response.headers = { 'content-type': 'text/html' };
    response.socket = { remoteAddress: '93.184.216.34' };
    const interval = setInterval(() => response.push(Buffer.from('x')), 5);
    stopStream = () => clearInterval(interval);
    const request = new EventEmitter();
    activeRequest = request;
    request.setTimeout = () => {};
    let destroyed = false;
    request.destroy = (error) => {
      if (destroyed) return;
      destroyed = true;
      destroyCalls += 1;
      clearInterval(interval);
      response.destroy(error);
      request.emit('error', error);
    };
    request.end = () => queueMicrotask(() => onResponse(response));
    return request;
  });

  try {
    const outcome = await Promise.race([
      safety.probePublicUrl('https://rebind.example/probe', 3, { timeoutMs: 25 })
        .then(() => 'resolved', () => 'rejected'),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 90)),
    ]);
    assert.equal(outcome, 'rejected');
    assert.equal(destroyCalls, 1);
  } finally {
    activeRequest?.destroy(new Error('test cleanup'));
    stopStream();
    resetSafetyHooks();
  }
});

test('osint web probe fails closed when the connected peer differs from the vetted DNS address', async () => {
  safety.setDnsLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }]);
  safety.setPinnedRequesterForTests(async () => probeResponse({ peerAddress: '169.254.169.254' }));

  try {
    await assert.rejects(() => safety.probePublicUrl('https://rebind.example/probe'), /peer|private|public/i);
  } finally {
    resetSafetyHooks();
  }
});

test('osint web probe manually revalidates and pins redirect targets before following', async () => {
  const requests = [];
  safety.setDnsLookupForTests(async (hostname) => {
    if (hostname === 'public.example') {
      return [{ address: '93.184.216.34', family: 4 }];
    }
    if (hostname === 'private.example') {
      return [{ address: '10.0.0.5', family: 4 }];
    }
    throw new Error(`unexpected host ${hostname}`);
  });
  safety.setPinnedRequesterForTests(async (request) => {
    requests.push(request);
    return probeResponse({
      status: 302,
      url: request.url,
      headers: { location: 'https://private.example/admin' },
      body: '',
      peerAddress: request.addresses[0].address,
    });
  });

  try {
    await assert.rejects(() => safety.probePublicUrl('https://public.example/start'), /private|reserved|public/i);
    assert.deepEqual(requests.map((request) => request.url), ['https://public.example/start']);
  } finally {
    resetSafetyHooks();
  }
});

test('osint handler remains an authenticated module boundary', () => {
  assert.equal(typeof handler, 'function');
});
