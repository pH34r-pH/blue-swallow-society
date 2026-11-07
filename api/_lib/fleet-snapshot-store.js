'use strict';

const { BlobClient } = require('@azure/storage-blob');
const { ManagedIdentityCredential } = require('@azure/identity');
const { FleetSnapshotUnavailableError, MAX_SNAPSHOT_BYTES, normalizeFleetSnapshot } = require('./fleet-snapshot');
const TIMEOUT_MS = 5_000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function reject() { throw new FleetSnapshotUnavailableError(); }
function validateBlobPath(pathname) {
  const parts = pathname.slice(1).split('/');
  if (parts.length < 2 || !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(parts[0]) || parts[0].includes('--')
    || parts.slice(1).some((part) => !/^[A-Za-z0-9._-]+$/.test(part) || ['.', '..'].includes(part))) reject();
}
function snapshotConfig(env) {
  const raw = env.BSS_FLEET_SNAPSHOT_BLOB_URL;
  if (typeof raw !== 'string' || raw.length > 2048) reject();
  let url;
  try { url = new URL(raw); } catch { reject(); }
  if (url.href !== raw || url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash
    || !/^[a-z0-9]{3,24}\.blob\.core\.windows\.net$/.test(url.hostname)) reject();
  validateBlobPath(url.pathname);
  const clientId = env.BSS_FLEET_MANAGED_IDENTITY_CLIENT_ID;
  if (clientId !== undefined && !GUID.test(clientId)) reject();
  return { url: url.href, clientId };
}

async function readSnapshot(stream, signal) {
  if (!stream) reject();
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    if (signal.aborted) reject();
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_SNAPSHOT_BYTES) reject();
    chunks.push(bytes);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
  return normalizeFleetSnapshot(JSON.parse(text));
}

async function downloadSnapshot(client, timeoutMs) {
  const controller = new AbortController();
  let stream;
  let timer;
  const deadline = new Promise((_, fail) => {
    timer = setTimeout(() => {
      controller.abort();
      stream?.destroy();
      fail(new FleetSnapshotUnavailableError());
    }, timeoutMs);
  });
  const download = (async () => {
    const response = await client.download(0, MAX_SNAPSHOT_BYTES + 1, { abortSignal: controller.signal });
    stream = response.readableStreamBody;
    if (controller.signal.aborted) { stream?.destroy(); reject(); }
    if (response.contentLength > MAX_SNAPSHOT_BYTES) reject();
    return readSnapshot(stream, controller.signal);
  })();
  try { return await Promise.race([download, deadline]); }
  catch { reject(); }
  finally {
    clearTimeout(timer);
    controller.abort();
    stream?.destroy();
  }
}

function createFleetSnapshotStore({ env = process.env, blobClient, timeoutMs = TIMEOUT_MS } = {}) {
  const config = snapshotConfig(env);
  const client = blobClient || new BlobClient(config.url,
    new ManagedIdentityCredential(config.clientId ? { clientId: config.clientId } : {}),
    { retryOptions: { maxTries: 1, tryTimeoutInMs: TIMEOUT_MS } });
  return Object.freeze({ getSnapshot: () => downloadSnapshot(client, timeoutMs) });
}

module.exports = { createFleetSnapshotStore, snapshotConfig };
