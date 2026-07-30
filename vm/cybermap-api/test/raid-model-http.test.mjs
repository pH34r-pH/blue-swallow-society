import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createCybermapApiServer } from '../src/server.mjs';
import { MemoryObservationStore } from '../src/memory-store.mjs';
import { MemoryRaIDModelStore } from '../src/raid-model-store.mjs';
import { catalogRequest, release } from './raid-model-fixtures.mjs';
import { DEVICE_ID, withServer } from './helpers.mjs';

const CLIENT_FINGERPRINT = 'a'.repeat(64);
const PROXY_SECRET = 'test-loopback-proxy-secret';

function makeServer({ scopes = ['models:read', 'models:feedback:write'], releases = [release()] } = {}) {
  const store = new MemoryObservationStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      mtls_certificate_fingerprint: CLIENT_FINGERPRINT,
      scopes,
      enabled: true,
    }],
    now: () => new Date('2026-07-29T18:43:00.000Z'),
  });
  return createCybermapApiServer({
    store,
    modelStore: new MemoryRaIDModelStore({
      releases,
      releaseVerifier: () => true,
      now: () => new Date('2026-07-29T18:43:00.000Z'),
      randomUuid: () => '00000000-0000-4000-8000-000000000018',
    }),
    now: () => Date.parse('2026-07-29T18:43:00.000Z'),
    mtlsProxySecret: PROXY_SECRET,
  });
}

function mtlsHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    'x-blue-swallow-mtls-proxy-secret': PROXY_SECRET,
    'x-blue-swallow-mtls-client-fingerprint': CLIENT_FINGERPRINT,
    'x-blue-swallow-device-id': DEVICE_ID,
    ...extra,
  };
}

function mtlsModelReadHeaders(extra = {}) {
  const compatibility = catalogRequest();
  return {
    'x-blue-swallow-mtls-proxy-secret': PROXY_SECRET,
    'x-blue-swallow-mtls-client-fingerprint': CLIENT_FINGERPRINT,
    'x-blue-swallow-device-id': DEVICE_ID,
    'x-blue-swallow-raid-app-version': compatibility.app_version,
    'x-blue-swallow-raid-runtime-id': compatibility.runtime_id,
    'x-blue-swallow-raid-runtime-version': compatibility.runtime_version,
    'x-blue-swallow-raid-decoder-profile': compatibility.decoder_profiles[0],
    ...extra,
  };
}

test('mTLS catalog returns compatible signed release metadata without model bytes', async () => {
  await withServer(makeServer(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/raid/models/catalog?channel=field`, {
      method: 'GET',
      headers: mtlsModelReadHeaders(),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.schema_version, 'bss.raid.model_catalog.v1');
    assert.equal(body.channel, 'field');
    assert.match(body.generated_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(body.revoked_release_ids, []);
    assert.equal(body.releases.length, 1);
    assert.equal(body.releases[0].release_id, 'raid-general-20260729-0001');
    assert.equal('artifact_bytes' in body.releases[0], false);
  });
});

test('mTLS artifact route returns only eligible immutable model bytes with a digest', async () => {
  await withServer(makeServer(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/raid/models/releases/raid-general-20260729-0001/artifact`, {
      method: 'GET',
      headers: mtlsModelReadHeaders(),
    });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.toString('utf8'), 'raid-model-artifact-v1');
    assert.equal(response.headers.get('x-blue-swallow-artifact-sha256'), crypto.createHash('sha256').update(bytes).digest('hex'));
    const encodedManifest = response.headers.get('x-blue-swallow-model-manifest-base64');
    assert.ok(encodedManifest, 'artifact response must carry the exact signed manifest');
    const manifest = JSON.parse(Buffer.from(encodedManifest, 'base64url').toString('utf8'));
    assert.equal(manifest.release_id, 'raid-general-20260729-0001');
    assert.equal(manifest.artifact.sha256, response.headers.get('x-blue-swallow-artifact-sha256'));
    assert.equal(manifest.manifest.sha256, response.headers.get('x-blue-swallow-manifest-sha256'));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  });
});

test('mTLS model reads accept only GET with the exact channel and compatibility headers', async () => {
  await withServer(makeServer(), async (baseUrl) => {
    const endpoint = `${baseUrl}/api/v1/raid/models/catalog`;
    const absentChannel = await fetch(endpoint, { method: 'GET', headers: mtlsModelReadHeaders() });
    assert.equal(absentChannel.status, 400);

    const extraChannel = await fetch(`${endpoint}?channel=field&debug=1`, {
      method: 'GET', headers: mtlsModelReadHeaders(),
    });
    assert.equal(extraChannel.status, 400);

    const missingCompatibility = await fetch(`${endpoint}?channel=field`, {
      method: 'GET', headers: mtlsModelReadHeaders({ 'x-blue-swallow-raid-runtime-version': '' }),
    });
    assert.equal(missingCompatibility.status, 400);

    const oldPost = await fetch(`${endpoint}?channel=field`, {
      method: 'POST', headers: mtlsHeaders(), body: JSON.stringify(catalogRequest()),
    });
    assert.equal(oldPost.status, 404);
  });
});

test('mTLS model feedback binds a release digest and replays only exact event content', async () => {
  const feedback = {
    schema_version: 'bss.raid.model_feedback.v1',
    feedback_id: 'feedback-20260729-0001',
    release_id: 'raid-general-20260729-0001',
    artifact_sha256: crypto.createHash('sha256').update('raid-model-artifact-v1').digest('hex'),
    verdict: 'bad',
    reason_codes: ['missed_target'],
    note: 'The model missed a fixed camera.',
    app_version: '2.109.0',
    runtime_id: 'litert',
    runtime_version: '2.1.0',
    capture_reference: null,
    submitted_at: '2026-07-29T18:45:00.000Z',
  };
  await withServer(makeServer(), async (baseUrl) => {
    const endpoint = `${baseUrl}/api/v1/raid/models/releases/raid-general-20260729-0001/feedback`;
    const first = await fetch(endpoint, { method: 'POST', headers: mtlsHeaders(), body: JSON.stringify(feedback) });
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('idempotent-replayed'), 'false');

    const replay = await fetch(endpoint, { method: 'POST', headers: mtlsHeaders(), body: JSON.stringify(feedback) });
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotent-replayed'), 'true');
  });
});

test('model routes fail closed for absent proxy assertions and missing model scope', async () => {
  await withServer(makeServer({ scopes: ['models:read'] }), async (baseUrl) => {
    const noAssertion = await fetch(`${baseUrl}/api/v1/raid/models/catalog?channel=field`, {
      method: 'GET',
      headers: {
        'x-blue-swallow-mtls-client-fingerprint': CLIENT_FINGERPRINT,
        'x-blue-swallow-device-id': DEVICE_ID,
        'x-blue-swallow-raid-app-version': '2.109.0',
        'x-blue-swallow-raid-runtime-id': 'litert',
        'x-blue-swallow-raid-runtime-version': '2.1.0',
        'x-blue-swallow-raid-decoder-profile': 'ssd_postprocess_v1',
      },
    });
    assert.equal(noAssertion.status, 403);
    assert.deepEqual(await noAssertion.json(), { ok: false, error: 'forbidden' });

    const noFeedbackScope = await fetch(`${baseUrl}/api/v1/raid/models/releases/raid-general-20260729-0001/feedback`, {
      method: 'POST',
      headers: mtlsHeaders(),
      body: JSON.stringify({
        schema_version: 'bss.raid.model_feedback.v1', feedback_id: 'feedback-20260729-0001',
        release_id: 'raid-general-20260729-0001', artifact_sha256: crypto.createHash('sha256').update('raid-model-artifact-v1').digest('hex'),
        verdict: 'good', reason_codes: ['generally_good'], note: '', app_version: '2.109.0',
        runtime_id: 'litert', runtime_version: '2.1.0', capture_reference: null, submitted_at: '2026-07-29T18:45:00.000Z',
      }),
    });
    assert.equal(noFeedbackScope.status, 403);
    assert.deepEqual(await noFeedbackScope.json(), { ok: false, error: 'forbidden' });
  });
});
