import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { assertAppliedReceiptV1, assertExactReceiptReplayV1 } from './receipt-contract.mjs';
import { assertProofDatabaseCounts, parseProofDatabaseCounts } from './proof-count-contract.mjs';
import {
  assertDesktopP12MatchesPublicCertificate,
  assertProtectedDirectory,
  readProtectedRegularFile,
} from './protected-desktop-credential.mjs';

const execFileAsync = promisify(execFile);
const HOST = 'bss.localhost';
const CONNECT_HOST = '127.0.0.1';
const PORT = 18080;
const DEVICE_ID = 'wardriver-desktop-dev-2026';
const REPLAY_HEADER = 'Idempotent-Replayed';
const MAX_LOCAL_JSON_RESPONSE_BYTES = 64 * 1024;
const MAX_LOCAL_ENVIRONMENT_FILE_BYTES = 8 * 1024;
const MAX_LOCAL_CLIENT_P12_BYTES = 256 * 1024;
const MAX_LOCAL_CA_CERT_BYTES = 64 * 1024;
const MAX_LOCAL_DATABASE_COUNT_OUTPUT_BYTES = 1024;
const LOCAL_PROOF_ENVIRONMENT_KEYS = new Set(['BSS_LOCAL_CLIENT_P12', 'BSS_LOCAL_CA_CERT']);
const LOCAL_PROOF_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(LOCAL_PROOF_DIRECTORY, '..');
const LOCAL_COMPOSE_FILE = path.join(LOCAL_PROOF_DIRECTORY, 'compose.yaml');
const LOCAL_APP_DATA = requireWindowsLocalAppData();
const EXPECTED_CREDENTIAL_ROOT = path.join(LOCAL_APP_DATA, 'BlueSwallow', 'credentials');
const EXPECTED_LOCAL_PROOF_DIRECTORY = path.join(EXPECTED_CREDENTIAL_ROOT, 'local-mtls-lab');
const EXPECTED_LOCAL_PROOF_ENV_FILE = path.join(EXPECTED_LOCAL_PROOF_DIRECTORY, 'local-proof.env');
const EXPECTED_LOCAL_CLIENT_P12 = path.join(EXPECTED_CREDENTIAL_ROOT, 'wardriver-mtls-desktop-dev-2026.pfx');
const EXPECTED_DESKTOP_PUBLIC_CERTIFICATE = path.join(EXPECTED_CREDENTIAL_ROOT, 'wardriver-mtls-desktop-dev-2026-public.pem');
const EXPECTED_LOCAL_CA_CERT = path.join(EXPECTED_LOCAL_PROOF_DIRECTORY, 'ca.pem');

const credentials = await loadProtectedEnvironmentFile();
const [p12, ca] = await Promise.all([
  readProtectedRegularFile({
    file: credentials.p12Path,
    expected: EXPECTED_LOCAL_CLIENT_P12,
    root: EXPECTED_CREDENTIAL_ROOT,
    maxBytes: MAX_LOCAL_CLIENT_P12_BYTES,
    label: 'Desktop PKCS#12',
    requireDirectAcl: true,
  }),
  readProtectedRegularFile({
    file: credentials.caPath,
    expected: EXPECTED_LOCAL_CA_CERT,
    root: EXPECTED_LOCAL_PROOF_DIRECTORY,
    maxBytes: MAX_LOCAL_CA_CERT_BYTES,
    label: 'Local CA certificate',
    requireDirectAcl: false,
  }),
]);
await assertDesktopP12MatchesPublicCertificate({
  p12Path: EXPECTED_LOCAL_CLIENT_P12,
  publicCertificatePath: EXPECTED_DESKTOP_PUBLIC_CERTIFICATE,
  credentialRoot: EXPECTED_CREDENTIAL_ROOT,
});
await runProof();

async function runProof() {
  const preflightCounts = await readProofDatabaseCounts(credentials.environmentFile);
  assertProofDatabaseCounts(preflightCounts, {
    desktopSourceCount: 1,
    credentialCount: 1,
    syncBatchCount: 0,
    observationCount: 0,
    phase: 'preflight',
  });

  const viewportBody = { lat: 47.61, lon: -122.33, radiusMeters: 250, limit: 20 };
  await expectNoClientCertificateRejection(viewportBody);

  const viewport = await requestJson({
    path: '/api/v1/cybermap/viewport',
    body: viewportBody,
    withClientCertificate: true,
  });
  require(viewport.statusCode === 200 && viewport.body?.ok === true, 'mTLS viewport was not accepted');

  const batch = makeBatch();
  const first = await requestJson({
    path: '/api/v1/observations/batch',
    body: batch,
    withClientCertificate: true,
  });
  require(first.statusCode === 201, 'first batch was not created');
  require(first.headers[REPLAY_HEADER.toLowerCase()] === 'false', 'first batch was unexpectedly replayed');
  assertAppliedReceiptV1(first.body, { idempotencyKey: batch.idempotency_key, acceptedCount: 1 });

  const replay = await requestJson({
    path: '/api/v1/observations/batch',
    body: batch,
    withClientCertificate: true,
  });
  require(replay.statusCode === 200, 'replay did not return the durable receipt');
  require(replay.headers[REPLAY_HEADER.toLowerCase()] === 'true', 'replay marker was absent');
  assertAppliedReceiptV1(replay.body, { idempotencyKey: batch.idempotency_key, acceptedCount: 1 });
  assertExactReceiptReplayV1(first.body, replay.body);
  const postReplayCounts = await readProofDatabaseCounts(credentials.environmentFile);
  assertProofDatabaseCounts(postReplayCounts, {
    desktopSourceCount: 1,
    credentialCount: 1,
    syncBatchCount: 1,
    observationCount: 1,
    phase: 'post-replay',
  });

  process.stdout.write('LOCAL_PROOF_NO_CLIENT_CERT=rejected\n');
  process.stdout.write('LOCAL_PROOF_MTLS_VIEWPORT=accepted\n');
  process.stdout.write('LOCAL_PROOF_DURABLE_RECEIPT=accepted\n');
  process.stdout.write('LOCAL_PROOF_DATABASE_COUNTS=accepted\n');
  process.stdout.write('LOCAL_PROOF_IDEMPOTENT_REPLAY=accepted\n');
}

async function expectNoClientCertificateRejection(body) {
  try {
    await requestJson({ path: '/api/v1/cybermap/viewport', body, withClientCertificate: false });
  } catch (error) {
    require(/CERTIFICATE_REQUIRED|TLSV13_ALERT_CERTIFICATE_REQUIRED/.test(String(error?.code || error?.message)), 'no-client request failed for an unexpected reason');
    return;
  }
  throw new Error('Caddy accepted a request without a client certificate');
}

function makeBatch() {
  const runId = randomUUID();
  const now = new Date().toISOString();
  return {
    schema_version: 'bss.observation_batch.v1',
    idempotency_key: `local-proof-${runId}`,
    device_id: DEVICE_ID,
    session_id: null,
    client_clock: now,
    redaction_class: 'hashed',
    retention_class: 'hash_only',
    observations: [{
      external_observation_key: `local-proof:${runId}:wifi:1`,
      kind: 'wifi_ap',
      observed_at: now,
      location: { latitude: 47.61, longitude: -122.33, accuracy_m: 8.4 },
      confidence: 0.82,
      payload: {
        bssid_hmac: `hmac-sha256:${'0'.repeat(64)}`,
        ssid_hmac: `hmac-sha256:${'1'.repeat(64)}`,
        rssi_dbm: -67,
        frequency_mhz: 2412,
        passive_only: true,
      },
      provenance: { collector: 'co.blueswallow.wardriver.local-proof', app_version: 'local-proof' },
    }],
  };
}

async function readProofDatabaseCounts(environmentFile) {
  require(exactPath(environmentFile, EXPECTED_LOCAL_PROOF_ENV_FILE),
    'Local proof database count query requires the approved protected environment');
  try {
    const { stdout } = await execFileAsync('docker', [
      'compose',
      '--project-directory', API_ROOT,
      '--env-file', EXPECTED_LOCAL_PROOF_ENV_FILE,
      '-f', LOCAL_COMPOSE_FILE,
      'exec', '-T', 'api', 'node', 'local-proof/read-proof-counts.mjs',
    ], {
      cwd: API_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: MAX_LOCAL_DATABASE_COUNT_OUTPUT_BYTES,
    });
    return parseProofDatabaseCounts(stdout);
  } catch {
    throw new Error('Local proof could not read bounded PostGIS counts');
  }
}

function requestJson({ path: requestPath, body, withClientCertificate }) {
  const encoded = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const rejectOnce = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const request = https.request({
      hostname: CONNECT_HOST,
      port: PORT,
      path: requestPath,
      method: 'POST',
      servername: HOST,
      checkServerIdentity: (_hostname, certificate) => tls.checkServerIdentity(HOST, certificate),
      ca,
      ...(withClientCertificate ? { pfx: p12, passphrase: '' } : {}),
      rejectUnauthorized: true,
      headers: {
        host: HOST,
        'content-type': 'application/json',
        'content-length': encoded.length,
        ...(withClientCertificate ? { 'x-blue-swallow-device-id': DEVICE_ID } : {}),
      },
    }, (response) => {
      const chunks = [];
      let responseBytes = 0;
      response.on('data', (chunk) => {
        responseBytes += chunk.length;
        if (responseBytes > MAX_LOCAL_JSON_RESPONSE_BYTES) {
          response.destroy();
          rejectOnce(new Error('Local mTLS JSON response exceeded the bounded proof limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', rejectOnce);
      response.once('end', () => {
        if (settled) return;
        try {
          resolveOnce({
            statusCode: response.statusCode,
            headers: response.headers,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        } catch (error) {
          rejectOnce(error);
        }
      });
    });
    request.setTimeout(15_000, () => request.destroy(new Error('Local mTLS request timed out')));
    request.once('error', rejectOnce);
    request.end(encoded);
  });
}

async function loadProtectedEnvironmentFile() {
  if (process.env.BSS_LOCAL_CLIENT_P12 !== undefined || process.env.BSS_LOCAL_CA_CERT !== undefined) {
    throw new Error('BSS_LOCAL_CLIENT_P12 and BSS_LOCAL_CA_CERT must be loaded only from BSS_LOCAL_PROOF_ENV_FILE');
  }
  const environmentFile = requireEnv('BSS_LOCAL_PROOF_ENV_FILE');
  await assertProtectedDirectory(EXPECTED_LOCAL_PROOF_DIRECTORY, EXPECTED_CREDENTIAL_ROOT, 'Protected local-proof directory');
  const source = await readProtectedRegularFile({
    file: environmentFile,
    expected: EXPECTED_LOCAL_PROOF_ENV_FILE,
    root: EXPECTED_LOCAL_PROOF_DIRECTORY,
    maxBytes: MAX_LOCAL_ENVIRONMENT_FILE_BYTES,
    label: 'Protected local-proof environment',
    requireDirectAcl: true,
  });

  const values = new Map();
  for (const line of source.toString('utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match) throw new Error('BSS_LOCAL_PROOF_ENV_FILE contains an invalid assignment');
    const [, key, rawValue] = match;
    if (!LOCAL_PROOF_ENVIRONMENT_KEYS.has(key)) continue;
    if (values.has(key)) throw new Error(`BSS_LOCAL_PROOF_ENV_FILE repeats ${key}`);
    values.set(key, unquoteEnvironmentValue(rawValue.trim()));
  }

  const p12Path = values.get('BSS_LOCAL_CLIENT_P12');
  const caPath = values.get('BSS_LOCAL_CA_CERT');
  require(exactPath(p12Path, EXPECTED_LOCAL_CLIENT_P12), 'Protected environment contains an unexpected client PKCS#12 path');
  require(exactPath(caPath, EXPECTED_LOCAL_CA_CERT), 'Protected environment contains an unexpected local CA path');
  return { p12Path, caPath, environmentFile: EXPECTED_LOCAL_PROOF_ENV_FILE };
}

function requireWindowsLocalAppData() {
  require(process.platform === 'win32', 'The local mTLS proof verifier is supported only on Windows');
  return requireEnv('LOCALAPPDATA');
}

function exactPath(value, expected) {
  return typeof value === 'string'
    && path.resolve(value).toLocaleLowerCase() === path.resolve(expected).toLocaleLowerCase();
}

function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function unquoteEnvironmentValue(value) {
  if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function require(value, message) {
  if (!value) throw new Error(message);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
