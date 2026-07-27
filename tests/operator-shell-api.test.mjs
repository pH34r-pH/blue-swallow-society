import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const handler = require('../api/operator-shell/index.js');
const { createOperatorAssetGrant, createOperatorToken } = require('../api/_lib/operator-auth');

const TEST_SIGNING_KEY = 'c'.repeat(64);
const TEST_DIGEST = 'd'.repeat(64);

async function withAuthEnv(fn) {
  const previous = {
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY,
    BLUE_SWALLOW_PASSCODE_SHA256: process.env.BLUE_SWALLOW_PASSCODE_SHA256,
  };
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = TEST_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = TEST_DIGEST;
  try {
    return await fn();
  } finally {
    if (previous.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY === undefined) {
      delete process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
    } else {
      process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = previous.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
    }
    if (previous.BLUE_SWALLOW_PASSCODE_SHA256 === undefined) {
      delete process.env.BLUE_SWALLOW_PASSCODE_SHA256;
    } else {
      process.env.BLUE_SWALLOW_PASSCODE_SHA256 = previous.BLUE_SWALLOW_PASSCODE_SHA256;
    }
  }
}

async function invoke(headers = {}, query = {}, method = 'GET') {
  const context = { res: null };
  await handler(context, { headers, query, method });
  return context.res;
}

async function invokeAsset(assetHandler, { headers = {}, params = {}, query = {}, method = 'GET' } = {}) {
  const context = { res: null };
  await assetHandler(context, { headers, params, query, method });
  return context.res;
}

test('operator shell rejects anonymous requests', async () => {
  await withAuthEnv(async () => {
    const response = await invoke();
    assert.equal(response.status, 403);
  });
});

test('operator shell rejects anonymous and authenticated POST requests before token validation or asset-grant issue', async () => {
  await withAuthEnv(async () => {
    const anonymousResponse = await invoke({}, {}, 'POST');
    assert.equal(anonymousResponse.status, 405);
    assert.equal(anonymousResponse.headers.Allow, 'GET');
    assert.equal(anonymousResponse.headers['Set-Cookie'], undefined);

    const session = createOperatorToken({ ttlMs: 60_000 });
    const authenticatedResponse = await invoke({ 'x-blue-swallow-operator-token': session.token }, {}, 'POST');
    assert.equal(authenticatedResponse.status, 405);
    assert.equal(authenticatedResponse.headers.Allow, 'GET');
    assert.equal(authenticatedResponse.headers['Set-Cookie'], undefined);
  });
});

test('operator shell fails closed for malformed and expired GET tokens without issuing an asset grant', async () => {
  await withAuthEnv(async () => {
    const invalidHeaders = [
      { 'x-blue-swallow-operator-token': 'malformed' },
      { 'x-blue-swallow-operator-token': createOperatorToken({ now: 0, ttlMs: 1 }).token },
    ];

    for (const headers of invalidHeaders) {
      const response = await invoke(headers);
      assert.equal(response.status, 403);
      assert.equal(response.headers['Set-Cookie'], undefined);
      assert.equal(response.headers['Cache-Control'], 'no-store');
    }
  });
});

test('operator shell serves composed private identity only with custom operator token header', async () => {
  await withAuthEnv(async () => {
    const session = createOperatorToken({ ttlMs: 60_000 });
    const headers = { 'x-blue-swallow-operator-token': session.token };
    const response = await invoke(headers);
    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
    const assetCookie = response.cookies?.[0];
    assert.equal(response.headers['Set-Cookie'], undefined);
    assert.deepEqual(assetCookie && {
      name: assetCookie.name,
      path: assetCookie.path,
      httpOnly: assetCookie.httpOnly,
      secure: assetCookie.secure,
      sameSite: assetCookie.sameSite,
    }, {
      name: 'bss_operator_asset_grant',
      path: '/api/operator-assets',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    });
    assert.ok(assetCookie.value);
    assert.ok(Number(assetCookie.maxAge) > 0 && Number(assetCookie.maxAge) <= 300);
    assert.doesNotMatch(response.body, /id="nacre-moire-operator-style"/);
    assert.match(response.body, /src="\/api\/operator-assets\/nacre-moire-mark\.svg"/);
    assert.match(response.body, /id="mainInterface"/);
    assert.match(response.body, /<h1 class="console-heading">Nacre-Moiré<\/h1>/);
    assert.match(response.body, /data-operator-download="apk"/);
    assert.doesNotMatch(response.body, /\{\{NACRE_MOIRE_MARK\}\}/);
  });
});

test('operator shell rejects all private view selectors after authentication without retaining a retired agent branch', async () => {
  await withAuthEnv(async () => {
    const session = createOperatorToken({ ttlMs: 60_000 });
    const headers = { 'x-blue-swallow-operator-token': session.token };
    const response = await invoke(headers, { view: 'agent' });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Unsupported private operator view.');
  });
});

test('operator shell rejects unknown private view selectors after authentication', async () => {
  await withAuthEnv(async () => {
    const session = createOperatorToken({ ttlMs: 60_000 });
    const response = await invoke({ 'x-blue-swallow-operator-token': session.token }, { view: 'unknown' });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Unsupported private operator view.');
  });
});

test('operator asset delivery rejects non-GET methods before grant validation or private-file reads', async () => {
  assert.equal(existsSync(new URL('../api/operator-assets/index.js', import.meta.url)), true,
    'the token-gated operator asset Function must exist');

  await withAuthEnv(async () => {
    const { createOperatorAssetHandler } = require('../api/operator-assets/index.js');
    let readCount = 0;
    const assetHandler = createOperatorAssetHandler({
      readFileSync() {
        readCount += 1;
        return 'private asset';
      },
    });

    const response = await invokeAsset(assetHandler, {
      method: 'POST',
      params: { asset: 'main.js' },
    });

    assert.equal(response.status, 405);
    assert.equal(response.headers.Allow, 'GET, HEAD');
    assert.equal(readCount, 0);
  });
});

test('operator asset delivery denies invalid grants and request-shaped asset names before private-file reads', async () => {
  assert.equal(existsSync(new URL('../api/operator-assets/index.js', import.meta.url)), true,
    'the token-gated operator asset Function must exist');

  await withAuthEnv(async () => {
    const { createOperatorAssetHandler } = require('../api/operator-assets/index.js');
    let readCount = 0;
    const assetHandler = createOperatorAssetHandler({
      readFileSync() {
        readCount += 1;
        return 'private asset';
      },
    });
    const validGrant = () => encodeURIComponent(createOperatorAssetGrant({ ttlMs: 60_000 }).token);
    const deniedRequests = [
      {},
      { headers: { cookie: 'bss_operator_asset_grant=malformed' } },
      { headers: { cookie: `bss_operator_asset_grant=${encodeURIComponent(createOperatorAssetGrant({ now: 0, ttlMs: 1 }).token)}` } },
      { headers: { cookie: `bss_operator_asset_grant=${validGrant()}` }, params: { asset: 'unknown.mjs' } },
      { headers: { cookie: `bss_operator_asset_grant=${validGrant()}` }, params: { asset: '../shell.html' } },
      { headers: { cookie: `bss_operator_asset_grant=${validGrant()}` }, params: { asset: '%2e%2e%2fshell.html' } },
      { headers: { cookie: `bss_operator_asset_grant=${validGrant()}` }, params: { asset: 'main.js' }, query: { asset: 'main.js' } },
    ];

    for (const request of deniedRequests) {
      const response = await invokeAsset(assetHandler, request);
      assert.equal(response.status, 403);
    }
    assert.equal(readCount, 0);
  });
});

test('operator asset delivery serves only a manifest allowlist with private no-store caching after a valid grant', async () => {
  assert.equal(existsSync(new URL('../api/operator-assets/index.js', import.meta.url)), true,
    'the token-gated operator asset Function must exist');

  await withAuthEnv(async () => {
    const { createOperatorAssetHandler } = require('../api/operator-assets/index.js');
    const reads = [];
    const assetHandler = createOperatorAssetHandler({
      readFileSync(filePath, encoding) {
        reads.push({ filePath, encoding });
        return 'private module';
      },
    });
    const grant = createOperatorAssetGrant({ ttlMs: 60_000 });
    const response = await invokeAsset(assetHandler, {
      headers: { cookie: `bss_operator_asset_grant=${encodeURIComponent(grant.token)}` },
      params: { asset: 'main.js' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'application/javascript; charset=utf-8');
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(response.body, 'private module');
    assert.equal(reads.length, 1);
    assert.match(reads[0].filePath, /_private[\\/]operator[\\/]assets[\\/]main\.js$/);
    assert.equal(reads[0].encoding, 'utf8');
  });
});
