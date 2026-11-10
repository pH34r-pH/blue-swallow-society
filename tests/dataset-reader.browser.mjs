import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { startCompanionServer } from './helpers/companion-server.mjs';
import { publisher, rosterFixture, golden, groupId, revoke } from './fixtures/dataset-reader.mjs';
import { commitSlot } from '../api/_private/companion/data/dataset-wire.mjs';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const hosting = JSON.parse(await readFile(new URL('../app/staticwebapp.config.json', import.meta.url)));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
async function setup(t) {
  const server = await startCompanionServer({ groupId }); server.state.csp = hosting.globalHeaders['Content-Security-Policy'];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(async () => { await browser.close(); await server.close(); assert.deepEqual(errors, []); });
  const owner = await publisher(); const authority = await rosterFixture(owner, [golden]); let current = await authority.envelope();
  const blobs = new Map(); const reads = []; const hooks = {};
  server.state.datasetStore = {
    roster: async () => current,
    object: async (ref) => {
      reads.push(ref); await hooks.read?.(ref);
      if (ref.revision !== current.revision || ref.rosterSha256 !== current.rosterSha256) throw { status: 409 };
      const bytes = blobs.get(`${ref.deviceId}/${ref.object}`); if (!bytes) throw { status: 404 }; return bytes;
    },
  };
  async function publish(name, sequence) {
    const packet = golden[name]; const slot = await commitSlot(golden, BigInt(sequence));
    const delta = Buffer.from(packet.delta, 'base64'); const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(delta).digest('hex');
    blobs.set(`${golden.deviceId}/head`, Buffer.from(packet.head, 'base64'));
    blobs.set(`${golden.deviceId}/${slot}`, Buffer.from(packet.commit, 'base64'));
    blobs.set(`${golden.deviceId}/${hash}`, delta); return hash;
  }
  async function login() {
    await page.goto(server.origin);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByLabel('Password', { exact: true }).fill(server.password);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Map', exact: true }).waitFor();
  }
  return { ...server, page, authority, reads, hooks, publish, login, setRoster: (value) => { current = value; } };
}
test('private shell reads actual Kotlin producer history in a CSP worker, resumes, applies roster cutoffs and clears', async (t) => {
  const f = await setup(t); await f.publish('live', 1); await f.login();
  const tileRequests = []; f.page.on('request', (request) => { if (request.url().startsWith('https://tile.openstreetmap.org/')) tileRequests.push(request.url()); });
  await f.page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  assert.equal(f.state.reads.some((path) => path.startsWith('/api/companion-datasets/')), false);
  assert.equal(f.state.reads.includes('/api/companion-ui/dataset-worker.js'), false);
  await f.page.getByRole('button', { name: 'Read shared data', exact: true }).click();
  await f.page.getByText('Observation chains checked', { exact: true }).first().waitFor();
  assert.match(await f.page.locator('#datasetSummary').textContent(), /Batches accepted: 1 · Records retained: 2/);
  assert.match(await f.page.locator('#datasetCoverage').textContent(), /Receiver fixes only/);
  await f.page.getByText(/Receiver capture locations · 1 shown/).waitFor();
  await f.page.getByRole('button', { name: 'Show OpenStreetMap basemap' }).waitFor();
  assert.equal(tileRequests.length, 0);
  await f.page.getByLabel('Inspect a receiver fix').selectOption(golden.gnssId);
  assert.equal(await f.page.locator('#viewContent .receiver-details').getByText('Receiver fix').count(), 1);
  assert.match(await f.page.locator('#viewContent .receiver-details').textContent(), /Contributor.*Session.*Boot epoch/);
  const basemap = f.page.getByRole('button', { name: 'Show OpenStreetMap basemap' });
  await f.page.waitForFunction(() => !document.querySelector('.receiver-map + p + button')?.disabled);
  const tile = f.page.waitForRequest((request) => request.url().startsWith('https://tile.openstreetmap.org/'));
  await basemap.click(); await tile; assert.ok(tileRequests.length > 0);
  assert.ok(f.page.workers().length >= 1);
  const worker = f.page.workers()[0];
  const firstProjection = await worker.evaluate(() => {
    const send = self.postMessage.bind(self); self.__testMessages = [];
    self.postMessage = (message, ...rest) => { self.__testMessages.push(message); send(message, ...rest); };
    self.onmessage({ data: { type: 'status' } });
    const status = self.__testMessages.at(-1).status;
    self.onmessage({ data: { type: 'receiver-fixes', id: 1, epoch: status.epoch, generation: status.generation, limit: 10 } });
    return { status, projection: self.__testMessages.at(-1) };
  });
  assert.equal(firstProjection.projection.result.points.length, 1);
  assert.equal(firstProjection.projection.result.points[0].id, golden.gnssId);
  f.reads.length = 0;
  await f.page.getByRole('button', { name: 'Refresh shared data', exact: true }).click();
  await f.page.getByText('Observation chains checked', { exact: true }).first().waitFor();
  assert.ok(f.reads.length > 0 && f.reads.every((ref) => ref.object === 'head'));
  const delta = await f.publish('closed', 2); const entered = deferred(), release = deferred();
  f.hooks.read = async (ref) => { if (ref.object === delta) { entered.resolve(); await release.promise; } };
  await f.page.getByRole('button', { name: 'Refresh shared data', exact: true }).click(); await entered.promise;
  await f.page.getByRole('button', { name: 'Cancel refresh', exact: true }).click();
  await f.page.getByText('Refresh cancelled; accepted batches are retained.', { exact: true }).waitFor();
  release.resolve(); f.hooks.read = null;
  await f.page.getByRole('button', { name: 'Refresh shared data', exact: true }).click();
  await f.page.getByText('Observation chains checked', { exact: true }).first().waitFor();
  assert.match(await f.page.locator('#datasetSummary').textContent(), /Batches accepted: 2 · Records retained: 6/);
  f.setRoster(await f.authority.envelope(2, (p) => revoke(p, golden, { sequence: 0n, commitHash: '' })));
  f.reads.length = 0; await f.page.getByRole('button', { name: 'Refresh shared data', exact: true }).click();
  await f.page.getByText('Observation chains checked', { exact: true }).first().waitFor();
  assert.ok(f.reads.every((ref) => ref.deviceId !== golden.deviceId));
  assert.match(await f.page.locator('#datasetPeers').textContent(), /Revoked · no accepted batches · batch 2 · accepted through 0/);
  await f.page.getByRole('heading', { name: 'No receiver fixes available' }).waitFor();
  assert.equal(await f.page.locator('.receiver-map').count(), 0);
  assert.equal(await f.page.locator('.receiver-details').count(), 0);
  assert.equal(await f.page.locator('.inspector-empty').getByText('Nothing selected').count(), 1);
  await f.page.getByRole('button', { name: 'Clear local data', exact: true }).click();
  await f.page.getByText('No shared dataset loaded', { exact: true }).first().waitFor();
  const stale = await worker.evaluate(({ epoch, generation }) => {
    self.onmessage({ data: { type: 'receiver-fixes', id: 2, epoch, generation, limit: 10 } });
    return self.__testMessages.at(-1);
  }, firstProjection.status);
  assert.equal(stale.error, 'stale_projection'); assert.equal(stale.result, undefined);
  assert.equal(await f.page.locator('#datasetPeers li').count(), 0);
  await f.page.getByRole('button', { name: 'Lock', exact: false }).click(); await f.page.waitForURL('**/?auth=locked');
  assert.equal(f.page.workers().length, 0); assert.equal(await f.page.locator('#datasetSummary').count(), 0);
  assert.equal((await f.page.request.get(f.origin + '/api/companion-ui/dataset-worker.js')).status(), 401);
});
test('dataset outage retries; Lock terminates a worker and aborts a pending private read', async (t) => {
  const f = await setup(t); const store = f.state.datasetStore; f.state.datasetStore = null; await f.login();
  await f.page.getByRole('button', { name: 'Read shared data', exact: true }).click();
  await f.page.getByText('Shared data is unavailable. The owner may need to enable access.', { exact: true }).waitFor();
  f.state.datasetStore = store; await f.publish('live', 1);
  const entered = deferred(), release = deferred();
  f.hooks.read = async () => { entered.resolve(); await release.promise; };
  await f.page.getByRole('button', { name: 'Refresh shared data', exact: true }).click(); await entered.promise;
  await f.page.getByRole('button', { name: 'Lock', exact: false }).click(); await f.page.waitForURL('**/?auth=locked');
  release.resolve(); assert.equal(f.page.workers().length, 0);
  assert.equal(await f.page.locator('#datasetPeers').count(), 0);
});
