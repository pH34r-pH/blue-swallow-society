import { createHash, randomBytes } from 'node:crypto';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const signerSha256 = sha256('synthetic development signer for tests');

export function releaseFixture(versionCode = 20, sourceCommit = 'a'.repeat(40)) {
  const prefix = `wardriver/development/vnext/releases/${versionCode}/${sourceCommit}/`;
  return {
    schemaVersion: 1,
    kind: 'wardriver-vnext-development-release',
    channel: 'private-vnext',
    packageId: 'co.blueswallow.wardriver.vnext',
    buildType: 'development',
    versionCode,
    versionName: `0.5-dev.${versionCode}`,
    sourceCommit,
    buildRunId: '123456789-1',
    publishedAt: '2026-11-03T12:00:00Z',
    signerSha256,
    apk: {
      blobName: `${prefix}wardriver-vnext-${versionCode}.apk`,
      fileName: `wardriver-vnext-${versionCode}.apk`,
      sizeBytes: 240000000,
      sha256: sha256('synthetic apk'),
    },
    extensions: [{
      id: 'wardriver_power',
      name: 'Wardriver Power',
      version: '0.2',
      fileName: 'wardriver_power.fap',
      blobName: `${prefix}wardriver_power.fap`,
      sizeBytes: 13280,
      sha256: sha256('synthetic fap'),
      md5: createHash('md5').update('synthetic fap').digest('hex'),
      firmwareVersion: '1.5.1',
      apiMajor: 88,
      apiMinor: 2,
      sourceCommit,
    }],
  };
}

export function readerFixture() {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    env: {
      BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_SHA256: sha256(token),
      BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256: signerSha256,
      BSS_WARDRIVER_DEVELOPMENT_CONTAINER: 'development-fixture',
      BSS_WARDRIVER_DEVELOPMENT_STORAGE_CONNECTION_STRING:
        `DefaultEndpointsProtocol=https;AccountName=fixtureaccount;AccountKey=${randomBytes(64).toString('base64')};EndpointSuffix=core.windows.net`,
    },
  };
}
