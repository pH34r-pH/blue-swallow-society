import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runBounded } from './bounded-command.mjs';
import { sanitizeAzureEnvironment } from './azure-command-environment.mjs';

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_AZURE_OUTPUT_BYTES = 64 * 1024;
const AZURE_COMMAND_TIMEOUT_MS = 30_000;
const MAX_RECEIPT_BYTES = 4 * 1024;
const RETRY_ATTEMPTS = 12;
const RETRY_DELAY_MS = 5_000;

const configuration = Object.freeze({
  resourceGroup: requiredEnv('BSS_RUNTIME_VERIFY_RESOURCE_GROUP'),
  staticWebAppName: requiredEnv('BSS_RUNTIME_VERIFY_SWA_NAME'),
  vmName: requiredEnv('BSS_RUNTIME_VERIFY_VM_NAME'),
  backendOrigin: normalizeHttpsOrigin(requiredEnv('BSS_RUNTIME_VERIFY_BACKEND_ORIGIN')),
  revision: requireRevision(requiredEnv('GITHUB_SHA')),
  releaseProbeSecret: requireBoundedSecret(requiredEnv('BSS_RUNTIME_VERIFY_RELEASE_PROBE_SECRET')),
  migrations: expectedMigrationVersions(),
});

await verifyRuntime(configuration);

async function verifyRuntime(config) {
  const vmRecord = await retry('VM provenance and service receipt', async () => {
    const output = await az([
      'vm', 'run-command', 'invoke',
      '--resource-group', config.resourceGroup,
      '--name', config.vmName,
      '--command-id', 'RunShellScript',
      '--scripts', remoteReceiptScript(),
      '--query', 'value[0].message',
      '--output', 'tsv',
      '--only-show-errors',
    ]);
    return extractRemoteReceipt(output);
  });
  assertVmRecord(vmRecord, config);

  const health = await retry('backend health', () => fetchJson(new URL('/healthz', config.backendOrigin)));
  require(health.status === 200 && health.body?.ok === true && health.body?.service === 'bss-cybermap-api',
    'Backend health contract was not satisfied.');

  const ready = await retry('backend readiness', () => fetchJson(new URL('/readyz', config.backendOrigin)));
  require(ready.status === 200 && ready.body?.ok === true, 'Backend readiness contract was not satisfied.');

  const defaultHostname = await az([
    'staticwebapp', 'show',
    '--name', config.staticWebAppName,
    '--resource-group', config.resourceGroup,
    '--query', 'defaultHostname',
    '--output', 'tsv',
    '--only-show-errors',
  ]);
  const staticWebAppOrigin = normalizeHttpsOrigin(`https://${defaultHostname.trim()}`);
  const protectedProbe = await retry('protected metadata probe', () => fetchJson(
    new URL('/api/wardriver-release/probe', staticWebAppOrigin),
    { headers: { 'x-blue-swallow-release-probe': config.releaseProbeSecret } },
  ));
  require(protectedProbe.status === 200 && protectedProbe.body?.ok === true,
    'Protected metadata probe was not accepted.');
  require(protectedProbe.body?.release && typeof protectedProbe.body.release === 'object',
    'Protected metadata probe did not return a release receipt.');
  require(!Object.hasOwn(protectedProbe.body.release, 'downloadUrl'),
    'Protected metadata probe returned a delivery capability.');

  writeRuntimeReceipt({ config, vmRecord, health, ready, protectedProbe });
  process.stdout.write('RUNTIME_VM_PROVENANCE=verified\n');
  process.stdout.write('RUNTIME_VM_MIGRATIONS=verified\n');
  process.stdout.write('RUNTIME_BACKEND_HEALTH=verified\n');
  process.stdout.write('RUNTIME_BACKEND_READY=verified\n');
  process.stdout.write('RUNTIME_PROTECTED_METADATA=verified\n');
}

function writeRuntimeReceipt({ config, vmRecord, health, ready, protectedProbe }) {
  const receipt = {
    schema_version: 'bss.deployment_runtime_receipt.v1',
    verified_at: new Date().toISOString(),
    revision: config.revision,
    vm: {
      archive_sha256: vmRecord.receipt.archive_sha256,
      migrations: vmRecord.receipt.migrations,
    },
    backend: {
      health_status: health.status,
      ready_status: ready.status,
    },
    protected_metadata: {
      status: protectedProbe.status,
      accepted: protectedProbe.body?.ok === true,
    },
  };
  writeFileSync('runtime-verification-receipt.json', `${JSON.stringify(receipt)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function remoteReceiptScript() {
  return String.raw`set -euo pipefail
receipt=/etc/bss/cybermap-api-release.json
test -f "$receipt"
test "$(stat -c %a "$receipt")" = 644
test "$(wc -c < "$receipt")" -le ${MAX_RECEIPT_BYTES}
set -a
. /etc/bss/cybermap-api.env
set +a
migration_versions_json="$(psql -v ON_ERROR_STOP=1 -Atqc "SELECT COALESCE(json_agg(version ORDER BY version), '[]'::json)::text FROM schema_migrations")"
RECEIPT_PATH="$receipt" MIGRATIONS_JSON="$migration_versions_json" node <<'NODE'
const fs = require('node:fs');
const receipt = JSON.parse(fs.readFileSync(process.env.RECEIPT_PATH, 'utf8'));
const migrations = JSON.parse(process.env.MIGRATIONS_JSON);
if (!Array.isArray(migrations)) process.exit(1);
process.stdout.write('BSS_RUNTIME_RECEIPT=' + Buffer.from(JSON.stringify({ receipt, migrations })).toString('base64') + '\n');
NODE
systemctl is-active --quiet bss-cybermap-api.service
systemctl is-active --quiet caddy.service`;
}

function extractRemoteReceipt(output) {
  const match = /BSS_RUNTIME_RECEIPT=([A-Za-z0-9+/=]+)/.exec(output);
  require(match, 'VM run command did not emit a bounded runtime receipt.');
  const decoded = Buffer.from(match[1], 'base64');
  require(decoded.length > 0 && decoded.length <= MAX_RECEIPT_BYTES,
    'VM runtime receipt exceeded its byte bound.');
  try {
    return JSON.parse(decoded.toString('utf8'));
  } catch {
    throw new Error('VM runtime receipt was not valid JSON.');
  }
}

function assertVmRecord(record, config) {
  const receipt = record?.receipt;
  require(receipt && typeof receipt === 'object', 'VM runtime receipt is missing.');
  require(receipt.revision === config.revision, 'VM receipt revision does not match GITHUB_SHA.');
  require(/^[a-f0-9]{64}$/.test(receipt.archive_sha256 || ''), 'VM receipt archive SHA-256 is invalid.');
  require(typeof receipt.installed_at === 'string' && !Number.isNaN(Date.parse(receipt.installed_at)),
    'VM receipt installation time is invalid.');
  assertExactMigrations(receipt.migrations, config.migrations, 'VM receipt migration list');
  assertExactMigrations(record.migrations, config.migrations, 'VM schema_migrations ledger');
}

function assertExactMigrations(actual, expected, label) {
  require(Array.isArray(actual), `${label} is not an array.`);
  require(JSON.stringify(actual) === JSON.stringify(expected), `${label} does not match the deployed source set.`);
}

async function fetchJson(url, { headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal, redirect: 'error' });
    const declared = response.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
      throw new Error('Runtime response Content-Length exceeded the byte bound.');
    }
    const reader = response.body?.getReader();
    require(reader, 'Runtime response did not provide a readable body.');
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkLength = Buffer.isBuffer(value)
          ? value.length
          : ArrayBuffer.isView(value)
            ? value.byteLength
            : Buffer.byteLength(String(value), 'utf8');
        if (size + chunkLength > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error('Runtime response exceeded the byte bound.');
        }
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        size += chunkLength;
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } finally {
    clearTimeout(timer);
  }
}

async function retry(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
  }
  throw new Error(`${label} verification failed after ${RETRY_ATTEMPTS} attempts.`, { cause: lastError });
}

function az(argumentsList) {
  return runBounded('az', argumentsList, {
    maxBytes: MAX_AZURE_OUTPUT_BYTES,
    timeoutMs: AZURE_COMMAND_TIMEOUT_MS,
    env: sanitizeAzureEnvironment(),
  }).then(({ stdout }) => stdout.trim());
}

function expectedMigrationVersions() {
  const directory = fileURLToPath(new URL('../vm/cybermap-api/db/migrations/', import.meta.url));
  return readdirSync(directory)
    .filter((file) => /^[0-9]{4}_[a-z0-9_]+\.sql$/i.test(file))
    .map((file) => file.slice(0, -'.sql'.length))
    .sort();
}

function normalizeHttpsOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Configured runtime origin is invalid.');
  }
  require(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
    'Configured runtime origin must be a credential-free HTTPS origin.');
  require(url.pathname === '/' || url.pathname === '', 'Configured runtime origin must not include a path.');
  return url.origin;
}

function requireRevision(value) {
  require(/^[a-f0-9]{40}$/i.test(value), 'GITHUB_SHA must be a full Git revision.');
  return value.toLowerCase();
}

function requireBoundedSecret(value) {
  require(value.length >= 32 && value.length <= 256, 'Protected probe secret length is invalid.');
  return value;
}

function requiredEnv(name) {
  const value = process.env[name];
  require(typeof value === 'string' && value.trim(), `${name} is required.`);
  return value.trim();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function require(value, message) {
  if (!value) throw new Error(message);
}
