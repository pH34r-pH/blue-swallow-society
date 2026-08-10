import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import https from 'node:https';

import { parseAzureMtlsSmokeOrigin } from './azure-mtls-smoke-origin.mjs';
import { readPasswordlessProtectedDesktopP12 } from './protected-desktop-credential.mjs';
import { assertAppliedReceiptV1, assertExactReceiptReplayV1 } from './receipt-contract.mjs';

const DEVICE_ID = 'wardriver-desktop-dev-2026';
const REPLAY_HEADER = 'Idempotent-Replayed';
const MAX_AZURE_JSON_RESPONSE_BYTES = 64 * 1024;
const LOCAL_APP_DATA = requireEnv('LOCALAPPDATA');
const origin = parseAzureMtlsSmokeOrigin(requireEnv('BSS_AZURE_MTLS_SMOKE_ORIGIN'));
const p12 = await readPasswordlessProtectedDesktopP12({
  localAppData: LOCAL_APP_DATA,
  configuredPath: requireEnv('BSS_AZURE_MTLS_CLIENT_P12'),
});

await runSmoke();

async function runSmoke() {
  const viewportBody = { lat: 0, lon: 0, radiusMeters: 250, limit: 1 };
  await expectNoClientCertificateRejection(viewportBody);

  const viewport = await requestJson({
    path: '/api/v1/cybermap/viewport',
    body: viewportBody,
    withClientCertificate: true,
  });
  require(viewport.statusCode === 200 && viewport.body?.ok === true,
    'mTLS viewport was not accepted by the Azure service');

  const batch = makeSyntheticBatch();
  const first = await requestJson({
    path: '/api/v1/observations/batch',
    body: batch,
    withClientCertificate: true,
  });
  require(first.statusCode === 201, 'Azure smoke batch was not created');
  require(first.headers[REPLAY_HEADER.toLowerCase()] === 'false',
    'Azure smoke batch was unexpectedly replayed');
  assertAppliedReceiptV1(first.body, { idempotencyKey: batch.idempotency_key, acceptedCount: 1 });

  const replay = await requestJson({
    path: '/api/v1/observations/batch',
    body: batch,
    withClientCertificate: true,
  });
  require(replay.statusCode === 200, 'Azure replay did not return the durable receipt');
  require(replay.headers[REPLAY_HEADER.toLowerCase()] === 'true',
    'Azure replay marker was absent');
  assertAppliedReceiptV1(replay.body, { idempotencyKey: batch.idempotency_key, acceptedCount: 1 });
  assertExactReceiptReplayV1(first.body, replay.body);

  process.stdout.write('AZURE_SMOKE_NO_CLIENT_CERT=rejected\n');
  process.stdout.write('AZURE_SMOKE_MTLS_VIEWPORT=accepted\n');
  process.stdout.write('AZURE_SMOKE_DURABLE_RECEIPT=accepted\n');
  process.stdout.write('AZURE_SMOKE_IDEMPOTENT_REPLAY=accepted\n');
}

async function expectNoClientCertificateRejection(body) {
  const result = await runCurl([
    '--silent', '--show-error', '--noproxy', '*', '--connect-timeout', '5', '--max-time', '10',
    '--request', 'POST',
    '--header', 'content-type: application/json',
    '--data', JSON.stringify(body),
    new URL('/api/v1/cybermap/viewport', origin).toString(),
  ]);
  require(result.exitCode !== 0, 'Azure Caddy accepted a request without a client certificate');
  require(/CERTIFICATE_REQUIRED|TLSV1\.[23]_ALERT|TLSV13_ALERT|SEC_E_ILLEGAL_MESSAGE|fatal SSL\/TLS alert/i.test(result.stderr),
    'no-client Azure request failed for an unexpected reason');
}

function runCurl(argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', argumentsList, { windowsHide: true });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal, stderr }));
  });
}

function makeSyntheticBatch() {
  const runId = randomUUID();
  const now = new Date().toISOString();
  return {
    schema_version: 'bss.observation_batch.v1',
    idempotency_key: `azure-smoke-${runId}`,
    device_id: DEVICE_ID,
    session_id: null,
    client_clock: now,
    redaction_class: 'hashed',
    retention_class: 'hash_only',
    observations: [{
      external_observation_key: `azure-mtls-smoke:${runId}:wifi:1`,
      kind: 'wifi_ap',
      observed_at: now,
      location: { latitude: 0, longitude: 0, accuracy_m: 100000 },
      confidence: 0.01,
      payload: {
        bssid_hmac: `hmac-sha256:${'0'.repeat(64)}`,
        ssid_hmac: `hmac-sha256:${'1'.repeat(64)}`,
        rssi_dbm: -127,
        frequency_mhz: 2412,
        passive_only: true,
      },
      provenance: {
        collector: 'blue-swallow.azure-mtls-smoke',
        synthetic_integration_marker: true,
        app_version: 'azure-smoke',
      },
    }],
  };
}

function requestJson({ path, body, withClientCertificate }) {
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
      hostname: origin.hostname,
      port: Number(origin.port),
      path,
      method: 'POST',
      servername: origin.hostname,
      rejectUnauthorized: true,
      ...(withClientCertificate ? { pfx: p12, passphrase: '' } : {}),
      headers: {
        host: origin.host,
        'content-type': 'application/json',
        'content-length': encoded.length,
        ...(withClientCertificate ? { 'x-blue-swallow-device-id': DEVICE_ID } : {}),
      },
    }, (response) => {
      const chunks = [];
      let responseBytes = 0;
      response.on('data', (chunk) => {
        responseBytes += chunk.length;
        if (responseBytes > MAX_AZURE_JSON_RESPONSE_BYTES) {
          response.destroy();
          rejectOnce(new Error('Azure mTLS JSON response exceeded the bounded smoke limit'));
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
    request.setTimeout(15_000, () => request.destroy(new Error('Azure mTLS request timed out')));
    request.once('error', rejectOnce);
    request.end(encoded);
  });
}

function require(value, message) {
  if (!value) throw new Error(message);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
