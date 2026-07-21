'use strict';

const {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');

const DEFAULT_CONTAINER = 'wardriver-releases';
const DEFAULT_MANIFEST_BLOB = 'wardriver/releases/latest.json';
const SAS_TTL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;

class ReleaseUnavailableError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ReleaseUnavailableError';
  }
}

function createReleaseStore({ env = process.env, now = () => Date.now() } = {}) {
  const config = readConfig(env);
  const connection = parseConnectionString(config.connectionString);
  const credential = new StorageSharedKeyCredential(connection.accountName, connection.accountKey);
  const service = BlobServiceClient.fromConnectionString(config.connectionString);
  const container = service.getContainerClient(config.containerName);

  return {
    async getRelease() {
      try {
        const response = await container.getBlockBlobClient(config.manifestBlob).download(0);
        const payload = await readStream(response.readableStreamBody);
        return validateManifest(JSON.parse(payload.toString('utf8')));
      } catch (error) {
        if (error instanceof ReleaseUnavailableError) {
          throw error;
        }
        throw new ReleaseUnavailableError('Wardriver release manifest is unavailable.', { cause: error });
      }
    },

    async createDownloadUrl(manifest) {
      const validated = validateManifest(manifest);
      const startsOn = new Date(now() - CLOCK_SKEW_MS);
      const expiresOn = new Date(now() + SAS_TTL_MS);
      const query = generateBlobSASQueryParameters({
        containerName: config.containerName,
        blobName: validated.blobName,
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        startsOn,
        expiresOn,
      }, credential).toString();
      return `${container.getBlockBlobClient(validated.blobName).url}?${query}`;
    },
  };
}

function readConfig(env) {
  const connectionString = required(env.BSS_WARDRIVER_RELEASE_STORAGE_CONNECTION_STRING, 'release storage connection string');
  const containerName = String(env.BSS_WARDRIVER_RELEASE_CONTAINER || DEFAULT_CONTAINER).trim();
  const manifestBlob = String(env.BSS_WARDRIVER_RELEASE_MANIFEST_BLOB || DEFAULT_MANIFEST_BLOB).trim();

  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(containerName)) {
    throw new ReleaseUnavailableError('Wardriver release storage container is invalid.');
  }
  if (manifestBlob !== DEFAULT_MANIFEST_BLOB) {
    throw new ReleaseUnavailableError('Wardriver release manifest path is invalid.');
  }

  return { connectionString, containerName, manifestBlob };
}

function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new ReleaseUnavailableError(`Wardriver ${label} is not configured.`);
  }
  return normalized;
}

function parseConnectionString(connectionString) {
  const fields = new Map();
  for (const segment of connectionString.split(';')) {
    const index = segment.indexOf('=');
    if (index <= 0) continue;
    fields.set(segment.slice(0, index).trim().toLowerCase(), segment.slice(index + 1).trim());
  }
  const accountName = fields.get('accountname') || '';
  const accountKey = fields.get('accountkey') || '';
  if (!/^[a-z0-9]{3,24}$/.test(accountName) || !accountKey) {
    throw new ReleaseUnavailableError('Wardriver release storage credentials are invalid.');
  }
  return { accountName, accountKey };
}

function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReleaseUnavailableError('Wardriver release manifest is invalid.');
  }

  const manifest = {
    schemaVersion: value.schemaVersion,
    name: string(value.name, 'name', 120),
    packageId: string(value.packageId, 'packageId', 200),
    versionName: string(value.versionName, 'versionName', 80),
    versionCode: positiveInt(value.versionCode, 'versionCode'),
    buildType: string(value.buildType, 'buildType', 32),
    fileName: string(value.fileName, 'fileName', 180),
    sizeBytes: positiveInt(value.sizeBytes, 'sizeBytes'),
    sha256: sha256(value.sha256, 'sha256'),
    signerSha256: sha256(value.signerSha256, 'signerSha256'),
    sourceCommit: commit(value.sourceCommit),
    sourceTag: string(value.sourceTag, 'sourceTag', 160),
    buildRunId: buildRunId(value.buildRunId),
    publishedAt: isoTimestamp(value.publishedAt),
    notes: notes(value.notes),
    blobName: string(value.blobName, 'blobName', 400),
  };

  if (manifest.schemaVersion !== 1) {
    throw new ReleaseUnavailableError('Wardriver release manifest schema is unsupported.');
  }
  if (manifest.buildType !== 'release') {
    throw new ReleaseUnavailableError('Wardriver release manifest build type is invalid.');
  }
  if (!/^co\.blueswallow\.wardriver$/.test(manifest.packageId)) {
    throw new ReleaseUnavailableError('Wardriver release manifest package is invalid.');
  }
  if (!/^wardriver-v[0-9A-Za-z._-]+$/.test(manifest.sourceTag)) {
    throw new ReleaseUnavailableError('Wardriver release manifest tag is invalid.');
  }

  const expectedBlob = `wardriver/releases/${manifest.versionName}/${manifest.sourceCommit}/${manifest.fileName}`;
  if (manifest.blobName !== expectedBlob || !/\.apk$/i.test(manifest.fileName)) {
    throw new ReleaseUnavailableError('Wardriver release manifest blob path is invalid.');
  }
  return Object.freeze(manifest);
}

function toOperatorMetadata(manifest) {
  const release = validateManifest(manifest);
  return {
    schemaVersion: release.schemaVersion,
    name: release.name,
    packageId: release.packageId,
    versionName: release.versionName,
    versionCode: release.versionCode,
    buildType: release.buildType,
    fileName: release.fileName,
    sizeBytes: release.sizeBytes,
    sha256: release.sha256,
    signerSha256: release.signerSha256,
    sourceCommit: release.sourceCommit,
    sourceTag: release.sourceTag,
    buildRunId: release.buildRunId,
    publishedAt: release.publishedAt,
    notes: release.notes,
    downloadPath: '/api/operator-downloads/wardriver/apk',
    metadataPath: '/api/operator-downloads/wardriver/metadata',
  };
}

function toCurrentReleaseMetadata(manifest) {
  const release = validateManifest(manifest);
  return {
    versionName: release.versionName,
    versionCode: release.versionCode,
    publishedAt: release.publishedAt,
    notes: release.notes,
  };
}

function string(value, field, maxLength) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f]/.test(normalized)) {
    throw new ReleaseUnavailableError(`Wardriver release manifest ${field} is invalid.`);
  }
  return normalized;
}

function positiveInt(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) {
    throw new ReleaseUnavailableError(`Wardriver release manifest ${field} is invalid.`);
  }
  return value;
}

function sha256(value, field) {
  const normalized = string(value, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new ReleaseUnavailableError(`Wardriver release manifest ${field} is invalid.`);
  }
  return normalized;
}

function commit(value) {
  const normalized = string(value, 'sourceCommit', 64).toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(normalized)) {
    throw new ReleaseUnavailableError('Wardriver release manifest sourceCommit is invalid.');
  }
  return normalized;
}

function buildRunId(value) {
  const normalized = string(value, 'buildRunId', 120);
  if (!/^[0-9]+-[0-9]+$/.test(normalized)) {
    throw new ReleaseUnavailableError('Wardriver release manifest buildRunId is invalid.');
  }
  return normalized;
}

function isoTimestamp(value) {
  const normalized = string(value, 'publishedAt', 64);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new ReleaseUnavailableError('Wardriver release manifest publishedAt is invalid.');
  }
  return normalized;
}

function notes(value) {
  if (!Array.isArray(value) || value.length > 8 || value.some((note) => typeof note !== 'string' || !note.trim() || note.length > 500)) {
    throw new ReleaseUnavailableError('Wardriver release manifest notes are invalid.');
  }
  return Object.freeze(value.map((note) => note.trim()));
}

async function readStream(stream) {
  if (!stream) {
    throw new ReleaseUnavailableError('Wardriver release manifest body is missing.');
  }
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = {
  DEFAULT_CONTAINER,
  DEFAULT_MANIFEST_BLOB,
  ReleaseUnavailableError,
  createReleaseStore,
  toCurrentReleaseMetadata,
  toOperatorMetadata,
  validateManifest,
};
