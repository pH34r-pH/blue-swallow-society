import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

// Synthetic UI-only adapter; production routing and authentication are deliberately not installed.
const fixture = {
  entity_id: '11111111-1111-4111-8111-111111111111', revision: 1, stable_key: 'synthetic-alpha',
  operator: { label: '<img src=x onerror=alert(1)>', labels: [], review_state: 'unreviewed', active: true, rejected_device_ids: [], merged_into: null },
  machine: { version: 'synthetic-v1', confidence: null }, device_ids: ['22222222-2222-4222-8222-222222222222'],
  evidence: { items: [{ id: 'synthetic-evidence', kind: 'wifi_ap', observed_at: '2026-01-01', relationship: 'observed_as' }], next_offset: null },
  history: { items: [], next_offset: null }, hypotheses: { items: [], next_offset: null },
};
test('isolated entity UI: keyboard/mobile, preview confirmation, safe text, retry and stale/error/empty states', async (t) => {
  const module = await readFile(new URL('../api/_private/operator/assets/entity-workbench.mjs', import.meta.url), 'utf8');
  const server = createServer((req, res) => {
    if (req.url === '/module.mjs') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(module); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main></main><script type="module">
      import { mountEntityWorkbench } from '/module.mjs';
      window.entity = ${JSON.stringify(fixture)}; window.calls = []; window.mode = 'normal';
      window.ui = mountEntityWorkbench(document.querySelector('main'), {request: async (op,input) => {
        window.calls.push({op,input});
        if (op === 'list') { if (window.mode === 'error') throw Error('Unavailable'); return {items: window.mode === 'empty' ? [] : [window.entity], next_offset:null}; }
        if (op === 'detail') return structuredClone(window.entity);
        if (op === 'preview') return {entities:[{...window.entity,operator:{...window.entity.operator,label:input.label}}]};
        if (op === 'mutate') {
          if (window.mode === 'lost') { window.mode='normal'; throw Error('Lost response'); }
          if (window.mode === 'stale') throw Object.assign(Error('Changed'),{code:'stale_revision'});
          window.entity.operator.label = input.label; window.entity.revision++; return {};
        }
      }});
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const entity = page.getByRole('button', { name: fixture.operator.label, exact: true });
  await entity.focus(); await page.keyboard.press('Enter');
  await page.getByText('Machine hypothesis: synthetic-v1; confidence: unknown', { exact: true }).waitFor();
  assert.equal(await page.locator('img').count(), 0);
  await page.getByLabel('Operator label', { exact: true }).fill('Renamed synthetic cluster');
  await page.getByLabel('Reason', { exact: true }).fill('Controlled synthetic review');
  const confirm = page.getByRole('button', { name: 'Confirm correction', exact: true });
  assert.equal(await confirm.isDisabled(), true);
  await page.getByRole('button', { name: 'Preview correction' }).click();
  await page.getByText('Review the preview, then confirm.', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.calls.filter((c) => c.op === 'mutate'))).length, 0);
  await page.evaluate(() => { window.mode = 'lost'; });
  await confirm.click(); await page.getByText('Entity request failed. Reload to try again.', { exact: true }).waitFor();
  assert.equal(await confirm.isEnabled(), true);
  await confirm.click(); await page.getByText('Correction recorded.', { exact: true }).waitFor();
  const writes = await page.evaluate(() => window.calls.filter((c) => c.op === 'mutate'));
  assert.equal(writes.length, 2); assert.deepEqual(writes[0].input, writes[1].input);
  await page.getByLabel('Reason', { exact: true }).fill('New stale review');
  await page.getByRole('button', { name: 'Preview correction' }).click();
  await page.getByText('Review the preview, then confirm.', { exact: true }).waitFor();
  await page.evaluate(() => { window.mode = 'stale'; }); await confirm.click();
  await page.getByText('This entity changed. Reload it and review a new preview before confirming.', { exact: true }).waitFor();
  assert.equal(await confirm.isDisabled(), true);
  await page.evaluate(() => { window.mode = 'empty'; window.ui.reload(); });
  await page.getByText('No entities match these filters.', { exact: true }).waitFor();
  await page.evaluate(() => { window.mode = 'error'; window.ui.reload(); });
  await page.getByText('Entity request failed. Reload to try again.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
});
