'use strict';

const {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');

const CHANNEL_PREFIX = 'wardriver/development/vnext/';
const LATEST_BLOB = `${CHANNEL_PREFIX}latest.json`;
const MAX_MANIFEST_BYTES = 128 * 1024;
const SAS_TTL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;

class DevelopmentReleaseUnavailableError extends Error {
  constructor() {
    super('Development updates are unavailable.');
    this.name = 'DevelopmentReleaseUnavailableError';
  }
}

function reject() { throw new DevelopmentReleaseUnavailableError(); }
function safeText(value, maxLength) {
  if (typeof value !== 'string' || !value || value !== value.trim()
    || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) reject();
  return value;
}
function match(value, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) reject();
  return value;
}
function integer(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) reject();
  return value;
}
function digest(value, length = 64) { return match(value, new RegExp(`^[a-f0-9]{${length}}$`)); }
function sourceCommit(value) { return match(value, /^[a-f0-9]{40}$/); }
function version(value) { return match(value, /^[0-9A-Za-z][0-9A-Za-z._+-]{0,79}$/); }

function releasePrefix(versionCode, commit) {
  integer(versionCode, 1, 2100000000);
  sourceCommit(commit);
  return `${CHANNEL_PREFIX}releases/${versionCode}/${commit}/`;
}

function artifact(value, prefix, fileName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
  if (value.fileName !== fileName || value.blobName !== `${prefix}${fileName}`) reject();
  return Object.freeze({
    blobName: value.blobName,
    fileName,
    sizeBytes: integer(value.sizeBytes, 1, 2147483647),
    sha256: digest(value.sha256),
  });
}

function validateManifest(value, expectedSigner) {
  digest(expectedSigner);
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
  if (value.schemaVersion !== 1 || value.kind !== 'wardriver-vnext-development-release'
    || value.channel !== 'private-vnext' || value.packageId !== 'co.blueswallow.wardriver.vnext'
    || value.buildType !== 'development' || value.signerSha256 !== expectedSigner) reject();
  const versionCode = integer(value.versionCode, 1, 2100000000);
  const commit = sourceCommit(value.sourceCommit);
  const prefix = releasePrefix(versionCode, commit);
  const publishedAt = match(value.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/);
  if (!Number.isFinite(Date.parse(publishedAt))
    || new Date(publishedAt).toISOString().slice(0, 19) !== publishedAt.slice(0, 19)) reject();
  const apk = artifact(value.apk, prefix, `wardriver-vnext-${versionCode}.apk`);
  if (!Array.isArray(value.extensions) || value.extensions.length < 1 || value.extensions.length > 16) reject();
  const ids = new Set();
  const extensions = value.extensions.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) reject();
    const id = match(entry.id, /^[a-z][a-z0-9_]{0,63}$/);
    if (ids.has(id)) reject();
    ids.add(id);
    return Object.freeze({
      ...artifact(entry, prefix, `${id}.fap`),
      id,
      name: safeText(entry.name, 120),
      version: version(entry.version),
      md5: digest(entry.md5, 32),
      firmwareVersion: version(entry.firmwareVersion),
      apiMajor: integer(entry.apiMajor, 0, 65535),
      apiMinor: integer(entry.apiMinor, 0, 65535),
      sourceCommit: sourceCommit(entry.sourceCommit),
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    kind: value.kind,
    channel: value.channel,
    packageId: value.packageId,
    buildType: value.buildType,
    versionCode,
    versionName: version(value.versionName),
    sourceCommit: commit,
    buildRunId: match(value.buildRunId, /^[1-9][0-9]{0,19}-[1-9][0-9]{0,8}$/),
    publishedAt,
    signerSha256: expectedSigner,
    apk,
    extensions: Object.freeze(extensions),
  });
}

function readConfig(env) {
  const signerSha256 = digest(env.BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256);
  const containerName = match(env.BSS_WARDRIVER_DEVELOPMENT_CONTAINER, /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/);
  if (containerName.includes('--')) reject();
  const connectionString = safeText(env.BSS_WARDRIVER_DEVELOPMENT_STORAGE_CONNECTION_STRING, 4096);
  const fields = new Map();
  for (const item of connectionString.split(';').filter(Boolean)) {
    const at = item.indexOf('=');
    if (at < 1) reject();
    const name = item.slice(0, at).toLowerCase();
    if (fields.has(name)) reject();
    fields.set(name, item.slice(at + 1));
  }
  const accountName = match(fields.get('accountname'), /^[a-z0-9]{3,24}$/);
  const accountKey = match(fields.get('accountkey'), /^[A-Za-z0-9+/]{86}==$/);
  if (Buffer.from(accountKey, 'base64').length !== 64) reject();
  const accountUrl = `https://${accountName}.blob.core.windows.net`;
  if ((fields.has('defaultendpointsprotocol') && fields.get('defaultendpointsprotocol') !== 'https')
    || (fields.has('endpointsuffix') && fields.get('endpointsuffix') !== 'core.windows.net')
    || (fields.has('blobendpoint') && fields.get('blobendpoint').replace(/\/$/, '') !== accountUrl)) reject();
  return { signerSha256, containerName, accountName, accountKey, accountUrl };
}

async function readManifestStream(stream) {
  if (!stream) reject();
  const parts = [];
  let size = 0;
  for await (const chunk of stream) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_MANIFEST_BYTES) reject();
    parts.push(part);
  }
  return Buffer.concat(parts, size).toString('utf8');
}

function createDevelopmentStore({ env = process.env, now = () => Date.now(), serviceClient } = {}) {
  const config = readConfig(env);
  const credential = new StorageSharedKeyCredential(config.accountName, config.accountKey);
  const service = serviceClient || new BlobServiceClient(config.accountUrl, credential);
  const container = service.getContainerClient(config.containerName);
  return {
    signerSha256: config.signerSha256,
    async getRelease(reference) {
      try {
        const blobName = reference
          ? `${releasePrefix(reference.versionCode, reference.sourceCommit)}release.json`
          : LATEST_BLOB;
        const response = await container.getBlockBlobClient(blobName).download(0, MAX_MANIFEST_BYTES + 1, {
          abortSignal: AbortSignal.timeout(10000),
        });
        if (response.contentLength > MAX_MANIFEST_BYTES) reject();
        const release = validateManifest(JSON.parse(await readManifestStream(response.readableStreamBody)), config.signerSha256);
        if (reference && (release.versionCode !== reference.versionCode || release.sourceCommit !== reference.sourceCommit)) reject();
        return release;
      } catch {
        reject();
      }
    },
    async createDownloadUrl(manifest, fileName) {
      const release = validateManifest(manifest, config.signerSha256);
      const selected = [release.apk, ...release.extensions].find((entry) => entry.fileName === fileName);
      if (!selected) reject();
      const issuedAt = now();
      const query = generateBlobSASQueryParameters({
        containerName: config.containerName,
        blobName: selected.blobName,
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        startsOn: new Date(issuedAt - CLOCK_SKEW_MS),
        expiresOn: new Date(issuedAt + SAS_TTL_MS),
      }, credential).toString();
      return `${config.accountUrl}/${config.containerName}/${selected.blobName}?${query}`;
    },
  };
}

module.exports = {
  CHANNEL_PREFIX,
  LATEST_BLOB,
  DevelopmentReleaseUnavailableError,
  createDevelopmentStore,
  releasePrefix,
  validateManifest,
};
