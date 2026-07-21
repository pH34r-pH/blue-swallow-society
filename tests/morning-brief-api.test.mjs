import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/morning-brief/index.js');
const { createOperatorToken } = require('../api/_lib/operator-auth.js');

const OPERATOR_SIGNING_KEY = 'morning-brief-operator-token-signing-key-minimum-32';
const BACKEND_TOKEN = 'morning-brief-backend-token-minimum-32-bytes';

function makeContext() {
  return { log: { error: () => {} } };
}

async function invoke({ path = '', method = 'GET', headers = {} } = {}) {
  const context = makeContext();
  await handler(context, { method, params: { path }, headers });
  return context.res;
}

async function withEnvironment(fn) {
  const keys = [
    'BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY',
    'BLUE_SWALLOW_PASSCODE_SHA256',
    'BSS_MORNING_BRIEF_TOKEN',
    'BACKEND_MORNING_BRIEF_BASE_URL',
    'BACKEND_CYBERMAP_BASE_URL',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = OPERATOR_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = '0'.repeat(64);
  process.env.BSS_MORNING_BRIEF_TOKEN = BACKEND_TOKEN;
  process.env.BACKEND_MORNING_BRIEF_BASE_URL = 'https://brief-api.example.test/';
  delete process.env.BACKEND_CYBERMAP_BASE_URL;
  const originalFetch = global.fetch;
  try {
    await fn();
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function operatorHeaders() {
  const session = createOperatorToken();
  return { authorization: `Bearer ${session.token}` };
}

test('morning brief API requires an operator session before it contacts the backend', async () => {
  await withEnvironment(async () => {
    let contacted = false;
    global.fetch = async () => { contacted = true; throw new Error('should not be reached'); };
    const response = await invoke();
    assert.equal(response.status, 403);
    assert.equal(contacted, false);
  });
});

test('morning brief API forwards operator-authenticated list and artifact reads to its private backend', async () => {
  await withEnvironment(async () => {
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).endsWith('/artifacts/page-01')) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': '4',
            'x-blue-swallow-artifact-sha256': 'a'.repeat(64),
          },
        });
      }
      return Response.json({ ok: true, runs: [{ run_id: 'morning-brief-2026-07-21' }] });
    };

    const list = await invoke({ headers: operatorHeaders() });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.runs, [{ run_id: 'morning-brief-2026-07-21' }]);
    assert.equal(requests[0].url, 'https://brief-api.example.test/api/v1/morning-briefs');
    assert.equal(requests[0].options.headers['x-blue-swallow-morning-brief-token'], BACKEND_TOKEN);

    const artifact = await invoke({
      path: 'morning-brief-2026-07-21/artifacts/page-01',
      headers: operatorHeaders(),
    });
    assert.equal(artifact.status, 200);
    assert.equal(artifact.isRaw, true);
    assert.deepEqual([...artifact.body], [137, 80, 78, 71]);
    assert.equal(artifact.headers['X-Blue-Swallow-Artifact-SHA256'], 'a'.repeat(64));
    assert.equal(requests[1].url, 'https://brief-api.example.test/api/v1/morning-briefs/morning-brief-2026-07-21/artifacts/page-01');
  });
});

test('morning brief API preserves authenticated HEAD metadata and does not consume a body', async () => {
  await withEnvironment(async () => {
    global.fetch = async (_url, options) => {
      assert.equal(options.method, 'HEAD');
      return new Response(null, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '4242',
          'x-blue-swallow-artifact-sha256': 'b'.repeat(64),
        },
      });
    };
    const response = await invoke({
      path: 'morning-brief-2026-07-21/artifacts/page-01',
      method: 'HEAD',
      headers: operatorHeaders(),
    });
    assert.equal(response.status, 200);
    assert.equal(response.body, undefined);
    assert.equal(response.headers['Content-Length'], '4242');
    assert.equal(response.headers['X-Blue-Swallow-Artifact-SHA256'], 'b'.repeat(64));
  });
});
