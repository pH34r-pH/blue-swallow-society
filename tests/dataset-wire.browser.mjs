import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { publisher, revoke, rosterFixture } from './fixtures/dataset-reader.mjs';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const { build } = require('esbuild');

async function runWorker(contents, fixture) {
  const resolveDir = fileURLToPath(new URL('../api/_private/companion/data/', import.meta.url));
  const bundle = await build({ stdin: { resolveDir, contents }, bundle: true, platform: 'browser',
    format: 'iife', write: false, minify: true });
  const server = createServer((req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; worker-src 'self'");
    res.setHeader('Content-Type', req.url === '/worker.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/worker.js' ? bundle.outputFiles[0].contents : '<!doctype html><title>Dataset worker test</title>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    return await page.evaluate((f) => new Promise((resolve, reject) => {
      const worker = new Worker('/worker.js'); const timer = setTimeout(() => { worker.terminate(); reject(new Error('worker timeout')); }, 10000);
      worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('worker failed')); };
      worker.onmessage = ({ data }) => {
        clearTimeout(timer);
        worker.terminate();
        if (data.error) reject(new Error(data.error));
        else resolve(data);
      };
      worker.postMessage(f);
    }), fixture);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}

test('Chromium worker verifies actual producer bytes with WebCrypto and no unsafe-eval', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/dataset-wire/producer-golden.json', import.meta.url)));
  const result = await runWorker(`
    import {publisherKey} from './signatures.mjs';
    import {decodeCommit,decodeDelta} from './dataset-wire.mjs';
    const bytes = (value) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
    self.onmessage = async ({data:f}) => {
      try {
        const key=await publisherKey(f.publicKeySpki,f.deviceId);
        const commit=await decodeCommit(f,key,bytes(f.live.commit));
        const delta=await decodeDelta(commit,bytes(f.live.delta));
        self.postMessage({ok:true,sequence:commit.sequence.toString(),count:delta.observations.length,
          clock:delta.observations[0].wire.timing.captureElapsedNs.toString(),unknown:[...delta.observations[0].bytes.slice(-3)]});
      } catch { self.postMessage({ok:false}); }
    };`, fixture);
  assert.deepEqual(result, { ok: true, sequence: '1', count: 2, clock: fixture.captureElapsedNs, unknown: [0x98, 6, 7] });
});

test('Chromium matches Android before post-Stop Undo, after withdrawal and after replay', async () => {
  const input = await readFile(new URL('./fixtures/dataset-wire/sighting-withdrawal-v1.json', import.meta.url));
  assert.equal(createHash('sha256').update(input).digest('hex'), '9599ed8a568c4cb6741ec40dc4e9cf7ef2f57dd45fb0e2107f9600b149ac2018');
  const fixture = JSON.parse(input);
  const authority = await rosterFixture(await publisher(), [fixture]);
  const roster = await authority.envelope();
  const cutoff = await authority.envelope(2, (payload) => revoke(payload, fixture,
    { sequence: 1n, commitHash: fixture.original.commitSha256 }));
  const result = await runWorker(`
    import { inspectWithdrawal } from '../../../../tests/fixtures/sighting-withdrawal-reader.mjs';
    self.onmessage = async ({ data }) => {
      try { self.postMessage(await inspectWithdrawal(data)); }
      catch (e) { self.postMessage({ error: e.message }); }
    };`, { fixture, roster, cutoff });
  assert.deepEqual(result, fixture.android);
  assert.deepEqual(Object.values(result).map(({ visibleSupport, applied }) => [visibleSupport, applied]), [[1, 1], [0, 1], [0, 0]]);
});
