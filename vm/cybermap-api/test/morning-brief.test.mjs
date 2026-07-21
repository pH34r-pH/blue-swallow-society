import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { MemoryObservationStore } from '../src/memory-store.mjs';
import { createCybermapApiServer } from '../src/server.mjs';

const TOKEN = 'morning-brief-test-token-32-byte-minimum';
const NOW = Date.parse('2026-07-21T13:00:00.000Z');
const hash = (value) => createHash('sha256').update(value).digest('hex');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function packageHash(packet) {
  return hash(stableJson({
    schema_version: packet.schema_version,
    run_id: packet.run_id,
    generated_at: packet.generated_at,
    canonical_state_hash: packet.canonical_state_hash,
    summary: packet.summary,
    artifacts: packet.artifacts.map(({ artifact_id, media_type, sha256 }) => ({ artifact_id, media_type, sha256 })),
  }));
}

function validPackage({ runId = 'morning-brief-2026-07-21', content = '<h1>Brief</h1>' } = {}) {
  const body = Buffer.from(content, 'utf8');
  const packet = {
    schema_version: 'bss.morning_brief.package.v1',
    run_id: runId,
    generated_at: '2026-07-21T13:00:00Z',
    canonical_state_hash: 'a'.repeat(64),
    package_sha256: '',
    summary: 'Validated operator packet.',
    artifacts: [{
      artifact_id: 'brief-html',
      media_type: 'text/html; charset=utf-8',
      sha256: hash(body),
      content_base64: body.toString('base64'),
    }],
  };
  packet.package_sha256 = packageHash(packet);
  return packet;
}

async function withServer(fn) {
  const previous = process.env.BSS_MORNING_BRIEF_TOKEN;
  process.env.BSS_MORNING_BRIEF_TOKEN = TOKEN;
  const server = createCybermapApiServer({ store: new MemoryObservationStore(), now: () => NOW });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.BSS_MORNING_BRIEF_TOKEN;
    else process.env.BSS_MORNING_BRIEF_TOKEN = previous;
  }
}

function headers(extra = {}) {
  return {
    'content-type': 'application/json',
    'x-blue-swallow-morning-brief-token': TOKEN,
    'idempotency-key': 'morning-brief-2026-07-21:publish',
    ...extra,
  };
}

test('private morning-brief endpoint is append-only, replay-safe, and serves verified artifacts', async () => {
  await withServer(async (base) => {
    const packet = validPackage();
    const first = await fetch(`${base}/api/v1/morning-briefs`, { method: 'POST', headers: headers(), body: JSON.stringify(packet) });
    assert.equal(first.status, 201);
    assert.equal((await first.json()).replayed, false);

    const replay = await fetch(`${base}/api/v1/morning-briefs`, { method: 'POST', headers: headers(), body: JSON.stringify(packet) });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);

    const listing = await fetch(`${base}/api/v1/morning-briefs`, { headers: headers() });
    assert.equal(listing.status, 200);
    assert.deepEqual((await listing.json()).runs.map((item) => item.run_id), [packet.run_id]);

    const artifact = await fetch(`${base}/api/v1/morning-briefs/${packet.run_id}/artifacts/brief-html`, { headers: headers() });
    assert.equal(artifact.status, 200);
    assert.equal(artifact.headers.get('cache-control'), 'private, no-store');
    assert.equal(await artifact.text(), '<h1>Brief</h1>');

    const head = await fetch(`${base}/api/v1/morning-briefs/${packet.run_id}/artifacts/brief-html`, { method: 'HEAD', headers: headers() });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength('<h1>Brief</h1>')));
    assert.equal(head.headers.get('x-blue-swallow-artifact-sha256'), packet.artifacts[0].sha256);
    assert.equal(await head.text(), '');

    const changed = validPackage({ content: '<h1>Changed</h1>' });
    const conflict = await fetch(`${base}/api/v1/morning-briefs`, { method: 'POST', headers: headers({ 'idempotency-key': 'morning-brief-2026-07-21:retry' }), body: JSON.stringify(changed) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, 'morning_brief_conflict');
  });
});

test('morning-brief private endpoint rejects missing token and corrupted artifact hash', async () => {
  await withServer(async (base) => {
    const forbidden = await fetch(`${base}/api/v1/morning-briefs`);
    assert.equal(forbidden.status, 403);

    const packet = validPackage();
    packet.artifacts[0].sha256 = 'b'.repeat(64);
    const rejected = await fetch(`${base}/api/v1/morning-briefs`, { method: 'POST', headers: headers(), body: JSON.stringify(packet) });
    assert.equal(rejected.status, 422);
    assert.equal((await rejected.json()).error, 'invalid_morning_brief');
  });
});

test('morning-brief private endpoint rejects a package hash that no longer binds its metadata', async () => {
  await withServer(async (base) => {
    const packet = validPackage();
    packet.summary = 'Mutated after the package was sealed.';
    const rejected = await fetch(`${base}/api/v1/morning-briefs`, { method: 'POST', headers: headers(), body: JSON.stringify(packet) });
    assert.equal(rejected.status, 422);
    assert.equal((await rejected.json()).error, 'invalid_morning_brief');
  });
});
