import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PostgresEntityStore } from '../vm/cybermap-api/src/entity-postgres-store.mjs';
import { createCybermapApiServer } from '../vm/cybermap-api/src/server.mjs';
import common from '../vm/cybermap-api/src/api-access-token.cjs';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const pgRequire = createRequire(new URL('../vm/cybermap-api/package.json', import.meta.url));
const { Pool } = pgRequire('pg');
const { chromium } = require('@playwright/test');
const { SignJWT, createLocalJWKSet, exportJWK } = await import(require.resolve('jose'));
const { createApiGuard } = require('./_lib/api-access-token');
const { createEntityOwnerGuard } = require('./_lib/entity-owner-auth');
const { createEntityProxy } = require('./cybermap-entities');
const { createOwnerSession, ownerConfig } = require('./shared/owner-session.cjs');
const cache = require('./_lib/owner-api-token-cache');
const shell = require('./operator-shell'), assets = require('./operator-assets');
const databaseUrl = process.env.BSS_ENTITY_TEST_DATABASE_URL;

test('private shell → scoped Functions → VM → synthetic PostGIS: label, split/merge/undo, stale tab', { skip: !databaseUrl }, async (t) => {
  const url = new URL(databaseUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/entity_test');
  Object.assign(process.env, { BLUE_SWALLOW_AUTH_MODE: 'entra', BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-4111-8111-111111111111',
    BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-4222-8222-222222222222', BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-4333-8333-333333333333',
    BLUE_SWALLOW_ENTRA_API_CLIENT_ID: '44444444-4444-4444-8444-444444444444', BLUE_SWALLOW_OWNER_SESSION_KEY: 'synthetic-entity-session-key-at-least-32-bytes' });
  const config = ownerConfig(), now = Math.floor(Date.now() / 1000);
  const claims = { iss: config.issuer, aud: config.audience, tid: config.tenant, oid: config.owner, iat: now, exp: now + 3600 };
  const session = createOwnerSession(claims, config);
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), jwk = await exportJWK(pair.publicKey); jwk.kid = 'synthetic';
  const apiConfig = { tenantId: config.tenant, objectId: config.owner, clientId: process.env.BLUE_SWALLOW_ENTRA_API_CLIENT_ID, issuer: config.issuer };
  const verify = common.createApiTokenValidator({ getConfig: () => apiConfig, keySet: createLocalJWKSet({ keys: [jwk] }) });
  const apiToken = await new SignJWT({ ...claims, aud: apiConfig.clientId, ver: '2.0', nbf: now, scp: 'Owner.Read Entities.Write' }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(pair.privateKey);
  cache.store(session, { async acquireTokenSilent() { return { accessToken: apiToken }; } }, { homeAccountId: 'synthetic' }, ['api://synthetic/Owner.Read', 'api://synthetic/Entities.Write']);
  t.after(() => cache.forget(session.token));
  const schema = `entity_browser_${crypto.randomUUID().replaceAll('-', '')}`, admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  const migrations = new URL('../vm/cybermap-api/db/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) await pool.query(await readFile(new URL(name, migrations), 'utf8'));
  const source = crypto.randomUUID(), ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()], evidence = ids.map(() => crypto.randomUUID());
  await pool.query("INSERT INTO source_catalog(id,source_class,source_key,name) VALUES($1,'owned_device','synthetic-browser','Synthetic')", [source]);
  for (let i = 0; i < ids.length; i++) {
    await pool.query("INSERT INTO observations(id,source_id,source_class,kind,observed_at,payload) VALUES($1,$2,'owned_device','wifi_ap','2026-01-01','{\"synthetic\":true,\"rssi\":null}')", [evidence[i], source]);
    await pool.query("INSERT INTO cyber_entities(id,entity_kind,stable_key,display_name,source_class,first_seen_at,last_seen_at) VALUES($1,'device',$2,'Synthetic','owned_device','2026-01-01','2026-01-01')", [ids[i], `synthetic-${i}`]);
    await pool.query("INSERT INTO entity_observations(entity_id,observation_id,relationship,source_class) VALUES($1,$2,'observed_as','owned_device')", [ids[i], evidence[i]]);
  }
  const original = (await pool.query('SELECT id,payload FROM observations ORDER BY id')).rows;
  const store = new PostgresEntityStore({ pool }), id = crypto.randomUUID(), actor = `${config.tenant}:${config.owner}`;
  await store.publishHypothesis({ entity_id: id, expected_revision: 0, version: 'synthetic-v1', algorithm: 'fixture', device_ids: ids, evidence_ids: evidence, confidence: null });
  const vm = createCybermapApiServer({ store: { async ready() { return { ok: true }; } }, entityStore: store, verifyEntityApiToken: verify });
  await new Promise((resolve) => vm.listen(0, '127.0.0.1', resolve)); t.after(() => vm.close());
  const vmOrigin = `http://127.0.0.1:${vm.address().port}`;
  const proxy = createEntityProxy({ authorize: createEntityOwnerGuard({ apiGuard: createApiGuard(verify) }), post: async (path, input, auth) => {
    const response = await fetch(vmOrigin + path, { method: 'POST', headers: { authorization: `Bearer ${auth.apiAccessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const body = await response.json(); if (!response.ok) throw Object.assign(new Error(), { status: response.status, body }); return body;
  } });
  const server = createServer((req, res) => serve(req, res).catch(() => { res.writeHead(500); res.end('{}'); }));
  async function serve(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname, context = {};
    const request = { method: req.method, headers: req.headers, params: { asset: path.split('/').at(-1), operation: path.split('/').at(-1) }, query: {} };
    if (path === '/api/owner-auth/edit') context.res = { status: 200, body: { ok: true, configured: true, editing: true } };
    else if (path.startsWith('/api/cybermap/entities/')) { const chunks = []; for await (const chunk of req) chunks.push(chunk); request.body = JSON.parse(Buffer.concat(chunks)); await proxy(context, request); }
    else if (path === '/api/operator-shell') await shell(context, request);
    else if (path.startsWith('/api/operator-assets/')) await assets(context, request);
    else if (path.startsWith('/api/')) context.res = { status: 503, body: { ok: false } };
    else if (path.startsWith('/operator/') && path.endsWith('.js') || path.endsWith('/operator-session.mjs')) context.res = { status: 200, headers: { 'Content-Type': 'text/javascript' }, body: await readFile(new URL('../app' + path, import.meta.url), 'utf8') };
    else context.res = { status: 200, headers: { 'Content-Type': 'text/html' }, body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import {activateOperatorSession} from '/operator/operator-session.mjs';import {bootOperatorSurface} from '/operator/loader.js';activateOperatorSession(${JSON.stringify(session)});await bootOperatorSurface();</script>` };
    res.writeHead(context.res.status, context.res.headers || { 'Content-Type': 'application/json' }); res.end(typeof context.res.body === 'string' ? context.res.body : JSON.stringify(context.res.body));
  }
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByRole('link', { name: 'Entities', exact: true }).click();
  const root = page.locator('[data-entity-workbench]'), status = root.getByRole('status');
  await root.getByRole('button', { name: `anonymous:${id}`, exact: true }).click();
  await root.getByLabel('Operator label', { exact: true }).fill('Synthetic reviewed cluster');
  async function correct(action, reason) {
    await root.getByLabel('Correction', { exact: true }).selectOption(action);
    await root.getByLabel('Reason', { exact: true }).fill(reason);
    await root.getByRole('button', { name: 'Preview correction' }).click(); await assertEventually('Review the preview, then confirm.');
    await root.getByRole('button', { name: 'Confirm correction' }).click(); await assertEventually('Correction recorded.');
  }
  async function assertEventually(text) { await status.filter({ hasText: text }).waitFor(); }
  await correct('label', 'Synthetic label review');
  await root.getByLabel('Device IDs (comma separated)', { exact: true }).fill(ids[2]); await correct('split', 'Synthetic split');
  const splitId = (await store.list()).items.find((item) => item.entity_id !== id).entity_id;
  await root.getByLabel('Merge source entity ID', { exact: true }).fill(splitId); await correct('merge', 'Synthetic merge');
  const merged = (await store.detail({ entity_id: id })).history.items.find((event) => event.action === 'merge');
  await root.getByLabel('Assertion ID to undo', { exact: true }).fill(merged.id); await correct('undo', 'Synthetic undo');
  assert.equal((await store.detail({ entity_id: splitId })).operator.active, true);
  assert.equal((await store.detail({ entity_id: id })).device_ids.length, 2);
  await root.getByLabel('Correction', { exact: true }).selectOption('label'); await root.getByLabel('Reason', { exact: true }).fill('Stale browser review');
  await root.getByRole('button', { name: 'Preview correction' }).click(); await assertEventually('Review the preview, then confirm.');
  const current = await store.detail({ entity_id: id });
  await store.mutate({ actor_id: actor, command: { action: 'label', entity_id: id, expected_revisions: { [id]: current.revision }, idempotency_key: crypto.randomUUID(), reason: 'Intervening synthetic tab', evidence_ids: [], label: 'Other synthetic tab', labels: [] } });
  await root.getByRole('button', { name: 'Confirm correction' }).click(); await assertEventually('This entity changed.');
  assert.equal(await root.getByRole('button', { name: 'Confirm correction' }).isDisabled(), true);
  assert.equal((await store.detail({ entity_id: id })).operator.label, 'Other synthetic tab');
  assert.ok((await store.detail({ entity_id: id })).history.items.every((event) => event.actor_id === actor));
  assert.deepEqual((await pool.query('SELECT id,payload FROM observations ORDER BY id')).rows, original);
  assert.deepEqual(errors, []);
  const anonymous = await fetch(`http://127.0.0.1:${server.address().port}/api/cybermap/entities/list`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.notEqual(anonymous.status, 200);
});
