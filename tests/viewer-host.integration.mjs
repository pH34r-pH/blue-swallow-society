import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, open, rmdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { encodePassword, COOKIE } = require('./_lib/viewer-session.js');
const origin = 'https://society-disposable.test';

async function docker(args, env = {}) {
  const { stdout } = await exec('docker', args, { env: { ...process.env, ...env }, timeout: 90_000 });
  return stdout.trim();
}

async function buildImage(archive, tag) {
  await exec('git', ['archive', '--output', archive, 'HEAD', 'api', 'vm/cybermap-api/src/api-access-token.cjs'], { cwd: root });
  const source = await open(archive);
  try {
    const build = spawn('docker', ['build', '-f', 'api/Dockerfile', '-t', tag, '-'], {
      stdio: [source.fd, 'inherit', 'inherit'], signal: AbortSignal.timeout(420_000),
    });
    const [status] = await once(build, 'close');
    assert.equal(status, 0, 'build the exact checked-out Functions source');
  } finally {
    await source.close();
  }
}

async function ready(label, check) {
  for (let attempt = 0; attempt < 35; attempt++) {
    try { if (await check()) return; } catch { /* Retry disposable service startup. */ }
    await delay(1_000);
  }
  throw new Error(`${label} did not become ready`);
}

async function localPort(container, port) {
  const address = await docker(['port', container, `${port}/tcp`]);
  const match = /^127\.0\.0\.1:(\d+)$/.exec(address);
  assert.ok(match, 'publish the test service only on loopback');
  return match[1];
}

function expectCookie(response, { cleared = false } = {}) {
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 1, 'expected one viewer cookie');
  const [pair, ...attributes] = cookies[0].split(';').map((part) => part.trim());
  assert.ok(pair.startsWith(`${COOKIE}=`), 'expected the viewer cookie name');
  assert.equal(pair === `${COOKIE}=`, cleared, 'expected cookie value state');
  const flags = new Set(attributes.map((attribute) => attribute.toLowerCase()));
  for (const flag of ['path=/', 'secure', 'httponly', 'samesite=strict']) assert.ok(flags.has(flag), `expected ${flag}`);
  if (cleared) assert.ok(flags.has('max-age=0'), 'expire the cookie on logout');
  return pair;
}

test('Functions and Azurite enforce viewer session and shared dataset boundaries', { timeout: 600_000 }, async (t) => {
  const id = randomUUID().slice(0, 12);
  const image = `society-viewer-fixture:${id}`;
  const storage = `society-viewer-${id}-storage`;
  const functions = `society-viewer-${id}-functions`;
  const scratch = await mkdtemp(join(tmpdir(), 'society-viewer-'));
  const archive = join(scratch, 'source.tar');
  const cleanups = [];
  t.after(async () => {
    const errors = [];
    for (const args of cleanups.reverse()) {
      try { await docker(args); } catch (error) { errors.push(error); }
    }
    await rm(archive, { force: true });
    await rmdir(scratch);
    if (errors.length) throw new AggregateError(errors, 'clean up disposable Docker resources');
  });
  await buildImage(archive, image);
  cleanups.push(['image', 'rm', image]);
  const runtime = await docker(['run', '--rm', '--entrypoint', 'node', image, '--version']);
  assert.match(runtime, /^v24\./);
  t.diagnostic(`Functions ${runtime}, image ${await docker(['image', 'inspect', '--format', '{{.Id}}', image])}, Azurite 3.37.0`);

  // Share the emulator's namespace so the SDK's development-storage endpoints
  // resolve to the fixture's own loopback. Publish only the Functions HTTP port.
  await docker(['run', '-d', '--name', storage, '-p', '127.0.0.1::80',
    'mcr.microsoft.com/azure-storage/azurite:3.37.0']);
  cleanups.push(['rm', '-f', storage]);
  const settings = 'UseDevelopmentStorage=true';
  const password = randomBytes(18).toString('base64url');
  const config = {
    AzureWebJobsStorage: settings,
    'AzureWebJobs.viewer-session-cleanup.Disabled': 'true',
    BLUE_SWALLOW_AUTH_MODE: 'password', BLUE_SWALLOW_PUBLIC_ORIGIN: origin,
    BLUE_SWALLOW_VIEWER_PASSWORD_SCRYPT: await encodePassword(password),
    BLUE_SWALLOW_VIEWER_SESSION_KEY: randomBytes(32).toString('base64url'), BLUE_SWALLOW_VIEWER_SESSION_EPOCH: id,
    BLUE_SWALLOW_VIEWER_SESSION_STORAGE_CONNECTION_STRING: settings,
    BLUE_SWALLOW_PASSCODE_RATE_LIMIT_STORAGE_CONNECTION_STRING: settings,
    BLUE_SWALLOW_ENTRA_TENANT_ID: randomUUID(), BLUE_SWALLOW_ENTRA_CLIENT_ID: randomUUID(),
    BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: randomUUID(), BLUE_SWALLOW_OWNER_SESSION_KEY: randomBytes(32).toString('base64url'),
  };
  await docker(['run', '-d', '--name', functions, '--network', `container:${storage}`,
    ...Object.keys(config).flatMap((name) => ['-e', name]), image], config);
  cleanups.push(['rm', '-f', functions]);
  const fixturePath = '/tmp/viewer-host-tables.cjs';
  await docker(['cp', fileURLToPath(new URL('./helpers/viewer-host-tables.cjs', import.meta.url)), `${functions}:${fixturePath}`]);
  const tables = (action) => docker(['exec', functions, 'node', fixturePath, action]);
  await ready('Azurite tables', async () => { await tables('prepare'); return true; });
  const base = `http://127.0.0.1:${await localPort(storage, 80)}/api/`;
  const get = (path, headers = {}) => fetch(base + path, {
    headers, redirect: 'manual', signal: AbortSignal.timeout(5_000),
  });
  const post = (action, body, headers = {}) => fetch(base + `companion-auth/${action}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(5_000),
  });
  await ready('Functions viewer binding', async () => (await get('companion-auth/session')).status === 401);
  const shell = 'companion-ui/shell.html';
  assert.equal((await get(shell)).status, 401);
  assert.equal((await post('login', { password }, { origin: 'https://different-origin.test' })).status, 403);
  assert.equal((await post('login', { password: randomBytes(18).toString('base64url') })).status, 401);
  assert.equal(await tables('count'), '0');

  const first = await post('login', { password });
  assert.equal(first.status, 200, 'the password is accepted by the actual Functions host');
  const firstCookie = expectCookie(first);
  const { operatorSession } = await first.json();
  assert.equal(operatorSession.role, 'viewer');
  const admitted = await get(shell, { cookie: firstCookie });
  assert.equal(admitted.status, 200);
  assert.match(admitted.headers.get('cache-control'), /no-store/i);
  assert.ok((await admitted.text()).includes('companion-header'));
  assert.equal((await get('operator-shell', { 'x-blue-swallow-operator-token': operatorSession.token })).status, 403);
  const renewed = await post('renew', {}, { cookie: firstCookie });
  assert.equal(renewed.status, 200);
  const renewedCookie = expectCookie(renewed);
  const renewedSession = (await renewed.json()).operatorSession;
  assert.equal(renewedSession.absoluteExpiresAt, operatorSession.absoluteExpiresAt);

  const second = await post('login', { password });
  assert.equal(second.status, 200);
  const secondCookie = expectCookie(second);
  assert.equal(await tables('count'), '2');
  assert.equal((await post('logout', {}, { cookie: firstCookie, origin: 'https://different-origin.test' })).status, 403);
  assert.equal((await get('companion-auth/session', { cookie: firstCookie })).status, 200);
  const logout = await post('logout', {}, { cookie: renewedCookie });
  assert.equal(logout.status, 200);
  expectCookie(logout, { cleared: true });
  assert.equal((await get(shell, { cookie: firstCookie })).status, 401);
  assert.equal((await get(shell, { cookie: renewedCookie })).status, 401);
  assert.equal((await get(shell, { cookie: secondCookie })).status, 200);

  assert.equal(await tables('count'), '1', 'only the still-active session remains in Table storage');
  await tables('expire');
  assert.equal((await get('companion-auth/session', { cookie: secondCookie })).status, 401);
  assert.equal((await get(shell, { cookie: secondCookie })).status, 401);
  assert.equal(await tables('count'), '1', 'session reads enforce expiry before physical deletion');

  const datasetsPath = '/tmp/viewer-host-datasets.cjs';
  await docker(['cp', fileURLToPath(new URL('./helpers/viewer-host-datasets.cjs', import.meta.url)), `${functions}:${datasetsPath}`]);
  t.diagnostic(await docker(['exec', functions, 'node', datasetsPath]));
});
