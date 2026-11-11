import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createBirdSnapshotStore, config } = require('../api/_lib/bird-snapshot-store');
const { previewBirdExport } = require('../api/_lib/bird-export-preview');
const fixture = () => previewBirdExport(Buffer.from('Submission ID,Common Name,Scientific Name,Count,Date,Location\nS1,Test,Test avis,X,2026-01-01,Private\n')).candidates[0];
function setup() {
  let bytes = null, etag = null, counter = 0; const calls = []; let beforeUpload;
  const blob = {
    async download(_offset, _length, options) {
      calls.push({ method: 'download', options }); if (!bytes) throw { statusCode: 404, code: 'BlobNotFound' };
      return { etag, contentLength: bytes.length, readableStreamBody: Readable.from([bytes]) };
    },
    async uploadData(value, options) {
      calls.push({ method: 'upload', options }); await beforeUpload?.();
      const condition = options.conditions;
      if ((condition.ifNoneMatch && etag) || (condition.ifMatch && condition.ifMatch !== etag)) throw { statusCode: 412 };
      bytes = Buffer.from(value); etag = `"${++counter}"`; return { etag };
    },
  };
  const serviceClient = { getContainerClient: () => ({ getBlockBlobClient: () => blob }) };
  const store = createBirdSnapshotStore({ settings: { account: 'synthetic', container: 'private' }, serviceClient });
  return { store, blob, calls, setBeforeUpload: (fn) => { beforeUpload = fn; }, corrupt: (value) => { bytes = value; etag = '"bad"'; } };
}
test('snapshot storage uses create-only then conditional writes with revision and ETag checks', async () => {
  const f = setup(); const initial = await f.store.read(); assert.equal(initial.etag, null); assert.equal(initial.snapshot.revision, 0);
  const first = { version: 1, revision: 1, records: [fixture()] };
  const saved = await f.store.write(first, { etag: null, revision: 0 }); assert.equal(saved.revision, 1);
  assert.equal(f.calls.find((call) => call.method === 'upload').options.conditions.ifNoneMatch, '*');
  const read = await f.store.read(); assert.deepEqual(read.snapshot, first);
  await assert.rejects(f.store.write({ version: 1, revision: 2, records: [] }, { etag: read.etag, revision: 1 }), /bird_storage_unavailable/);
  const stripped = { ...first.records[0], privateFields: {} };
  await assert.rejects(f.store.write({ version: 1, revision: 2, records: [stripped] }, { etag: read.etag, revision: 1 }), /bird_storage_unavailable/);
  const next = { ...first, revision: 2 }; await f.store.write(next, { etag: read.etag, revision: 1 });
  assert.equal(f.calls.filter((call) => call.method === 'upload').at(-1).options.conditions.ifMatch, read.etag);
  await assert.rejects(f.store.write(next, { etag: read.etag, revision: 1 }), /bird_snapshot_conflict/);
});
test('a competing writer between read and upload cannot be overwritten', async () => {
  const f = setup(); const first = { version: 1, revision: 1, records: [fixture()] };
  f.setBeforeUpload(() => { f.corrupt(Buffer.from('other writer')); f.setBeforeUpload(null); });
  await assert.rejects(f.store.write(first, { revision: 0, etag: null }), /bird_snapshot_conflict/);
  await assert.rejects(f.store.read(), /bird_storage_unavailable/);
});
test('malformed snapshots, truncated streams and storage exceptions fail closed and redact details', async () => {
  const f = setup(); const record = fixture();
  await assert.rejects(f.store.write({ version: 1, revision: 1, records: [{ ...record, provisionalKey: 'f'.repeat(64) }] }, { revision: 0, etag: null }), /bird_storage_unavailable/);
  f.corrupt(Buffer.from('{"version":1}')); await assert.rejects(f.store.read(), /bird_storage_unavailable/);
  f.blob.download = async () => ({ etag: '"tag"', contentLength: 8, readableStreamBody: Readable.from([Buffer.from('short')]) });
  await assert.rejects(f.store.read(), /bird_storage_unavailable/);
  f.blob.download = async () => { throw new Error('PRIVATE credentials'); };
  await assert.rejects(f.store.read(), (error) => error.message === 'bird_storage_unavailable');
  f.blob.download = async () => { throw { statusCode: 404, code: 'ContainerNotFound' }; };
  await assert.rejects(f.store.read(), /bird_storage_unavailable/);
});
test('storage configuration requires explicit enablement and valid isolated resource names', () => {
  assert.throws(() => config({}), /bird_storage_unavailable/);
  assert.throws(() => config({ BSS_BIRD_HISTORY_ENABLED: 'true', BSS_BIRD_HISTORY_ACCOUNT: 'INVALID!', BSS_BIRD_HISTORY_CONTAINER: 'private' }), /bird_storage_unavailable/);
  assert.deepEqual(config({ BSS_BIRD_HISTORY_ENABLED: 'true', BSS_BIRD_HISTORY_ACCOUNT: 'abc123', BSS_BIRD_HISTORY_CONTAINER: 'bird-private' }),
    { account: 'abc123', container: 'bird-private', clientId: '' });
});
