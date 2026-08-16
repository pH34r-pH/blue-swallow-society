import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  activateOperatorSession,
  clearOperatorSession,
  getActiveOperatorSession,
  operatorFetch,
} from '../app/operator/operator-session.mjs';

const loaderUrl = new URL('../app/operator/loader.js', import.meta.url);
const publicMain = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');

function activateTestSession() {
  assert.equal(activateOperatorSession({
    token: 'operator-session-test-token',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }), true);
}

function assetSource(assetName, { failPrivateMain }) {
  if (assetName === 'operator-session.mjs') {
    return `export function activateOperatorSession(){return true;} export function clearOperatorSession(){globalThis.__privateSessionClearCount=(globalThis.__privateSessionClearCount||0)+1;}`;
  }
  if (assetName === 'maplibre-gl.mjs') return 'function fi(){let e=import.meta.url; return e;} export {};';
  if (assetName === 'main.js' && failPrivateMain) throw new Error('private main failed');
  if (assetName === 'operator-mark.svg') return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  return assetName.endsWith('.css') ? ':root{}' : 'export {};';
}

async function withLoaderEnvironment({ failAsset = null, failPrivateMain = false }, callback) {
  const previous = {
    Blob: globalThis.Blob,
    URL: globalThis.URL,
    document: globalThis.document,
    fetch: globalThis.fetch,
    window: globalThis.window,
    privateSessionClearCount: globalThis.__privateSessionClearCount,
  };
  const created = [];
  const revoked = [];
  const styles = new Map();
  const navigations = [];

  class TestBlob {
    constructor(parts) {
      this.source = parts.join('');
    }
  }

  globalThis.Blob = TestBlob;
  globalThis.URL = {
    createObjectURL(blob) {
      const url = `data:text/javascript;base64,${Buffer.from(blob.source).toString('base64')}`;
      created.push(url);
      return url;
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
  };
  globalThis.document = {
    body: { dataset: {}, innerHTML: '' },
    head: {
      appendChild(element) {
        styles.set(element.id, element);
      },
    },
    getElementById(id) {
      return styles.get(id) || null;
    },
    createElement() {
      return {
        id: '',
        textContent: '',
        remove() {
          styles.delete(this.id);
        },
      };
    },
  };
  globalThis.window = {
    addEventListener() {},
    location: {
      pathname: '/',
      replace(path) {
        navigations.push(path);
      },
    },
  };
  globalThis.fetch = async (input) => {
    const pathname = new previous.URL(String(input), 'http://bss.test').pathname;
    if (pathname === '/api/operator-shell') return new Response('<main>private shell</main>');
    if (pathname.startsWith('/api/operator-assets/')) {
      const assetName = pathname.slice('/api/operator-assets/'.length);
      if (assetName === failAsset) return new Response('unavailable', { status: 500 });
      try {
        return new Response(assetSource(assetName, { failPrivateMain }));
      } catch (error) {
        return new Response(`throw new Error(${JSON.stringify(error.message)});`);
      }
    }
    throw new Error(`Unexpected fetch: ${pathname}`);
  };
  globalThis.__privateSessionClearCount = 0;

  try {
    await callback({ created, revoked, styles, navigations });
  } finally {
    clearOperatorSession();
    globalThis.Blob = previous.Blob;
    globalThis.URL = previous.URL;
    globalThis.document = previous.document;
    globalThis.fetch = previous.fetch;
    globalThis.window = previous.window;
    if (previous.privateSessionClearCount === undefined) delete globalThis.__privateSessionClearCount;
    else globalThis.__privateSessionClearCount = previous.privateSessionClearCount;
  }
}

async function importFreshLoader() {
  return import(`${loaderUrl.href}?operator-bootstrap-cleanup=${Date.now()}-${Math.random()}`);
}

test('an unavailable private asset clears the public operator session before fallback', async () => {
  await withLoaderEnvironment({ failAsset: 'theme.css' }, async ({ navigations }) => {
    activateTestSession();
    const { bootOperatorSurface } = await importFreshLoader();

    const booted = await bootOperatorSurface();

    assert.equal(booted, false);
    assert.equal(getActiveOperatorSession(), null);

    let protectedFetches = 0;
    const privateAssetFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      protectedFetches += 1;
      throw new Error('A cleared session must not issue a protected request.');
    };
    try {
      await assert.rejects(
        () => operatorFetch('/api/operator-signals'),
        /Operator session is unavailable or expired/,
      );
    } finally {
      globalThis.fetch = privateAssetFetch;
    }
    assert.equal(protectedFetches, 0);
    assert.deepEqual(navigations, ['/']);
  });
});

test('a private main import failure clears both session modules and every staged object URL', async () => {
  await withLoaderEnvironment({ failPrivateMain: true }, async ({ created, revoked, styles, navigations }) => {
    activateTestSession();
    const { bootOperatorSurface } = await importFreshLoader();

    const booted = await bootOperatorSurface();

    assert.equal(booted, false);
    assert.equal(getActiveOperatorSession(), null);
    assert.equal(globalThis.__privateSessionClearCount, 1);
    assert.deepEqual(revoked.sort(), created.sort());
    assert.equal(styles.size, 0);
    assert.deepEqual(navigations, ['/']);
  });
});

test('the public login fallback clears its session before it renders the standard site', () => {
  assert.match(publicMain, /activateOperatorSession,\s*clearOperatorSession/);
  assert.match(publicMain, /const booted = await bootOperatorSurface\(\);/);
  assert.match(publicMain, /if \(!booted\) \{\s*clearOperatorSession\(\);\s*showStandardSite\(\);\s*\}/);
  assert.match(publicMain, /catch \(error\) \{[\s\S]*clearOperatorSession\(\);[\s\S]*showStandardSite\(\);/);
});
