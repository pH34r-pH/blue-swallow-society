import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createOperatorToken } = require('../api/_lib/operator-auth');
const {
  boundedJsonStringify,
  readBoundedResponseBytes,
  requestBody,
  serializeJson,
} = require('../api/_lib/cybermap-bounds');

const MAX_BYTES = 1024 * 1024;
const DIGEST = '0'.repeat(64);
const SIGNING_KEY = 'cybermap-byte-bounds-test-signing-key-32bytes';
const READ_TOKEN = 'read-token-value-32-byte-minimum';
const PAPER_TOKEN = 'p'.repeat(64);

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function makeOperatorHeaders() {
  const previousDigest = process.env.BLUE_SWALLOW_PASSCODE_SHA256;
  const previousKey = process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = DIGEST;
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = SIGNING_KEY;
  try {
    return { Authorization: `Bearer ${createOperatorToken({ ttlMs: 60_000 }).token}` };
  } finally {
    restoreEnv('BLUE_SWALLOW_PASSCODE_SHA256', previousDigest);
    restoreEnv('BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY', previousKey);
  }
}

function env(overrides = {}) {
  return {
    BACKEND_CYBERMAP_BASE_URL: 'https://backend.local/root/',
    BSS_CYBERMAP_READ_TOKEN: READ_TOKEN,
    BLUE_SWALLOW_PASSCODE_SHA256: DIGEST,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: SIGNING_KEY,
    BSS_PAPER_STATE_TOKEN: PAPER_TOKEN,
    ...overrides,
  };
}

async function invoke(routePath, req, values, fetchImpl) {
  const route = require(routePath);
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    const context = { log: { error() {}, warn() {}, info() {} } };
    await route(context, req);
    return context.res;
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) restoreEnv(key, value);
  }
}

function readableBody(text, { onRead, onCancel } = {}) {
  let sent = false;
  return {
    getReader() {
      return {
        async read() {
          if (sent) return { done: true };
          sent = true;
          onRead?.();
          return { done: false, value: new TextEncoder().encode(text) };
        },
        async cancel() {
          onCancel?.();
        },
        releaseLock() {},
      };
    },
  };
}

function smallJsonResponse(payload = { ok: true }) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: readableBody(JSON.stringify(payload)),
  };
}

function oversizedJsonResponse() {
  let consumed = false;
  let cancelled = false;
  return {
    response: {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(MAX_BYTES + 1) : null },
      body: {
        async cancel() {
          cancelled = true;
        },
      },
      text: async () => {
        consumed = true;
        throw new Error('oversized body must not be consumed');
      },
    },
    wasCancelled: () => cancelled,
    wasConsumed: () => consumed,
  };
}

function oversizedStreamResponse() {
  let cancelled = false;
  return {
    response: {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_BYTES + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
    },
    wasCancelled: () => cancelled,
  };
}

function rejectedJsonResponse() {
  let reads = 0;
  return {
    response: {
      ok: false,
      status: 400,
      headers: { get: () => null },
      body: readableBody(JSON.stringify({ message: 'UPSTREAM_REJECTED_BODY_MUST_NOT_ESCAPE' }), {
        onRead: () => {
          reads += 1;
        },
      }),
    },
    reads: () => reads,
  };
}

function malformedSuccessResponse() {
  let reads = 0;
  return {
    response: {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: readableBody('UPSTREAM_INVALID_JSON_BODY', {
        onRead: () => {
          reads += 1;
        },
      }),
    },
    reads: () => reads,
  };
}

test('observation ingestion refuses an over-limit request before backend I/O', async () => {
  let fetchCalls = 0;
  const response = await invoke('../api/cybermap-observations-batch/index.js', {
    method: 'POST',
    rawBody: 'x'.repeat(MAX_BYTES + 1),
    headers: {
      'x-blue-swallow-ingest-token': 'ingest-token',
      'x-blue-swallow-device-id': 'device-a',
      'idempotency-key': 'bounds:batch:1',
    },
  }, env(), async () => {
    fetchCalls += 1;
    return smallJsonResponse({ ok: true });
  });

  assert.equal(response.status, 413);
  assert.equal(fetchCalls, 0);
  assert.equal(response.body.ok, false);
});

test('global viewport refuses an over-limit request before backend I/O', async () => {
  let fetchCalls = 0;
  const response = await invoke('../api/cybermap-global-viewport/index.js', {
    method: 'POST',
    headers: makeOperatorHeaders(),
    rawBody: 'x'.repeat(MAX_BYTES + 1),
  }, env(), async () => {
    fetchCalls += 1;
    return smallJsonResponse({ ok: true });
  });

  assert.equal(response.status, 413);
  assert.equal(fetchCalls, 0);
  assert.equal(response.body.ok, false);
});

test('viewport-derived routes reject an oversized declared request before backend I/O', async () => {
  const cases = [
    ['../api/cybermap-viewport/index.js', { lat: 47.6062, lon: -122.3321 }],
    ['../api/operator-signals/index.js', { lat: 47.6062, lon: -122.3321 }],
  ];

  for (const [route, body] of cases) {
    let fetchCalls = 0;
    const response = await invoke(route, {
      method: 'POST',
      headers: { ...makeOperatorHeaders(), 'content-length': String(MAX_BYTES + 1) },
      body,
    }, env(), async () => {
      fetchCalls += 1;
      return smallJsonResponse({ ok: true });
    });

    assert.equal(response.status, 413, route);
    assert.equal(fetchCalls, 0, route);
  }
});

test('viewport-derived routes reject an oversized parsed request before backend I/O', async () => {
  const cases = [
    ['../api/cybermap-viewport/index.js', { lat: 47.6062, lon: -122.3321, ignored: 'x'.repeat(MAX_BYTES + 1) }],
    ['../api/operator-signals/index.js', { lat: 47.6062, lon: -122.3321, ignored: 'x'.repeat(MAX_BYTES + 1) }],
  ];

  for (const [route, body] of cases) {
    let fetchCalls = 0;
    const response = await invoke(route, {
      method: 'POST',
      headers: makeOperatorHeaders(),
      body,
    }, env(), async () => {
      fetchCalls += 1;
      return smallJsonResponse({ ok: true });
    });

    assert.equal(response.status, 413, route);
    assert.equal(fetchCalls, 0, route);
  }
});

test('bounded serializer rejects oversized parsed JSON before forwarding', () => {
  const valid = { string: '"\\\n🜁', array: [true, null, 4.5] };
  assert.equal(boundedJsonStringify(valid), JSON.stringify(valid));
  const payload = { observations: ['x'.repeat(MAX_BYTES + 1)] };
  assert.throws(
    () => boundedJsonStringify(payload),
    (error) => error?.status === 413 && error?.code === 'cybermap_request_too_large',
  );
  assert.throws(
    () => requestBody({ body: payload }, { required: true, label: 'Cybermap request' }),
    (error) => error?.status === 413,
  );
  assert.throws(
    () => serializeJson(payload),
    (error) => error?.status === 413,
  );
});

test('paper-state aligns its VM-bound request cap with the 1 MiB Cybermap boundary', async () => {
  let fetchCalls = 0;
  const response = await invoke('../api/paper-state/index.js', {
    method: 'PUT',
    headers: {
      'x-blue-swallow-paper-state-token': PAPER_TOKEN,
      'idempotency-key': 'bounds:paper:1',
    },
    rawBody: 'x'.repeat(MAX_BYTES + 1),
  }, env(), async () => {
    fetchCalls += 1;
    return smallJsonResponse({ ok: true });
  });

  assert.equal(response.status, 413);
  assert.equal(fetchCalls, 0);
});

test('rejected upstream JSON is bounded, consumed, and never forwarded to callers', async () => {
  const cases = [
    ['../api/cybermap-viewport/index.js', { headers: makeOperatorHeaders(), body: { lat: 47.6062, lon: -122.3321 } }],
    ['../api/cybermap-global-viewport/index.js', { method: 'POST', headers: makeOperatorHeaders(), body: { schema_version: 'bss.global_viewport_request.v1' } }],
    ['../api/cybermap-tiles/index.js', { method: 'GET', headers: makeOperatorHeaders(), params: { z: '0', x: '0', y: '0' } }],
    ['../api/cybermap-observations-batch/index.js', {
      method: 'POST',
      body: { schema_version: 'bss.observation_batch.v1' },
      headers: {
        'x-blue-swallow-ingest-token': 'ingest-token',
        'x-blue-swallow-device-id': 'device-a',
        'idempotency-key': 'bounds:rejected:1',
      },
    }],
    ['../api/paper-state/index.js', {
      method: 'PUT',
      headers: {
        'x-blue-swallow-paper-state-token': PAPER_TOKEN,
        'idempotency-key': 'bounds:paper:rejected',
      },
      body: { schema_version: 'bss.paper_state.v4' },
    }],
  ];

  for (const [route, req] of cases) {
    const rejected = rejectedJsonResponse();
    const response = await invoke(route, req, env(), async () => rejected.response);
    assert.equal(response.status, 502, route);
    assert.equal(rejected.reads(), 1, `${route} must drain the bounded rejection`);
    assert.equal(JSON.stringify(response.body).includes('UPSTREAM_REJECTED_BODY_MUST_NOT_ESCAPE'), false, route);
  }
});

test('a malformed successful backend JSON response becomes a local 502 without reflected text', async () => {
  const malformed = malformedSuccessResponse();
  const response = await invoke('../api/cybermap-viewport/index.js', {
    headers: makeOperatorHeaders(),
    body: { lat: 47.6062, lon: -122.3321 },
  }, env(), async () => malformed.response);

  assert.equal(response.status, 502);
  assert.equal(malformed.reads(), 1);
  assert.equal(JSON.stringify(response.body).includes('UPSTREAM_INVALID_JSON_BODY'), false);
});

test('common Cybermap JSON proxy does not consume a declared oversized response', async () => {
  const oversized = oversizedJsonResponse();
  const response = await invoke('../api/cybermap-viewport/index.js', {
    headers: makeOperatorHeaders(),
    body: { lat: 47.6062, lon: -122.3321 },
  }, env(), async () => oversized.response);

  assert.equal(response.status, 502);
  assert.equal(oversized.wasConsumed(), false);
  assert.equal(response.body.ok, false);
});

test('global viewport does not consume a declared oversized backend JSON response', async () => {
  const oversized = oversizedJsonResponse();
  const response = await invoke('../api/cybermap-global-viewport/index.js', {
    method: 'POST',
    headers: makeOperatorHeaders(),
    body: { schema_version: 'bss.global_viewport_request.v1' },
  }, env(), async () => oversized.response);

  assert.equal(response.status, 502);
  assert.equal(oversized.wasConsumed(), false);
  assert.equal(response.body.ok, false);
});

test('observation ingestion does not consume a declared oversized backend JSON response', async () => {
  const oversized = oversizedJsonResponse();
  const response = await invoke('../api/cybermap-observations-batch/index.js', {
    method: 'POST',
    body: { schema_version: 'bss.observation_batch.v1' },
    headers: {
      'x-blue-swallow-ingest-token': 'ingest-token',
      'x-blue-swallow-device-id': 'device-a',
      'idempotency-key': 'bounds:batch:2',
    },
  }, env(), async () => oversized.response);

  assert.equal(response.status, 502);
  assert.equal(oversized.wasConsumed(), false);
  assert.equal(response.body.ok, false);
});

test('operator signals and paper state cancel declared oversized backend responses', async () => {
  const cases = [
    ['../api/operator-signals/index.js', {
      method: 'POST',
      headers: makeOperatorHeaders(),
      body: { lat: 47.6062, lon: -122.3321 },
    }],
    ['../api/paper-state/index.js', {
      method: 'PUT',
      headers: {
        'x-blue-swallow-paper-state-token': PAPER_TOKEN,
        'idempotency-key': 'bounds:paper:declared-response',
      },
      body: { schema_version: 'bss.paper_state.v4' },
    }],
  ];

  for (const [route, req] of cases) {
    const oversized = oversizedJsonResponse();
    const response = await invoke(route, req, env(), async () => oversized.response);
    assert.equal(response.status, 502, route);
    assert.equal(oversized.wasConsumed(), false, route);
    assert.equal(oversized.wasCancelled(), true, route);
  }
});

test('operator signals and paper state terminate unannounced oversized backend streams', async () => {
  const cases = [
    ['../api/operator-signals/index.js', {
      method: 'POST',
      headers: makeOperatorHeaders(),
      body: { lat: 47.6062, lon: -122.3321 },
    }],
    ['../api/paper-state/index.js', {
      method: 'PUT',
      headers: {
        'x-blue-swallow-paper-state-token': PAPER_TOKEN,
        'idempotency-key': 'bounds:paper:stream-response',
      },
      body: { schema_version: 'bss.paper_state.v4' },
    }],
  ];

  for (const [route, req] of cases) {
    const oversized = oversizedStreamResponse();
    const response = await invoke(route, req, env(), async () => oversized.response);
    assert.equal(response.status, 502, route);
    assert.equal(oversized.wasCancelled(), true, route);
  }
});

test('tile proxy does not consume or return a declared oversized MVT response', async () => {
  let consumed = false;
  const response = await invoke('../api/cybermap-tiles/index.js', {
    headers: makeOperatorHeaders(),
    params: { z: '8', x: '41', y: '92' },
  }, env(), async () => ({
    ok: true,
    status: 200,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(MAX_BYTES + 1) : null },
    arrayBuffer: async () => {
      consumed = true;
      throw new Error('oversized tile must not be consumed');
    },
  }));

  assert.equal(response.status, 502);
  assert.equal(consumed, false);
  assert.equal(response.body.ok, false);
});

test('shared response reader cancels a declared oversized body before failure', async () => {
  let cancelled = false;
  const response = {
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(MAX_BYTES + 1) : null },
    body: {
      async cancel() {
        cancelled = true;
      },
    },
  };

  await assert.rejects(
    () => readBoundedResponseBytes(response, { label: 'declared oversized response' }),
    (error) => error?.status === 502 && error?.code === 'cybermap_response_too_large',
  );
  assert.equal(cancelled, true);
});

test('shared response reader fails closed instead of buffering an unstreamed fallback body', async () => {
  let fallbackReads = 0;
  const response = {
    headers: { get: () => null },
    text: async () => {
      fallbackReads += 1;
      return 'x'.repeat(MAX_BYTES + 1);
    },
  };

  await assert.rejects(
    () => readBoundedResponseBytes(response, { label: 'unstreamed response' }),
    (error) => error?.status === 502,
  );
  assert.equal(fallbackReads, 0);
});

test('shared response reader terminates an unannounced oversized stream at the byte boundary', async () => {
  let cancelled = false;
  const response = {
    headers: { get: () => null },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      },
    }),
  };

  await assert.rejects(
    () => readBoundedResponseBytes(response, { label: 'streaming test response' }),
    (error) => error?.status === 502 && error?.code === 'cybermap_response_too_large',
  );
  assert.equal(cancelled, true);
});

test('shared response reader preserves its bounded error when stream cancellation fails', async () => {
  const response = {
    headers: { get: () => null },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true };
            sent = true;
            return { done: false, value: new Uint8Array(MAX_BYTES + 1) };
          },
          async cancel() {
            throw new Error('simulated cancellation failure');
          },
          releaseLock() {},
        };
      },
    },
  };

  await assert.rejects(
    () => readBoundedResponseBytes(response, { label: 'cancellation failure response' }),
    (error) => error?.status === 502 && error?.code === 'cybermap_response_too_large',
  );
});
