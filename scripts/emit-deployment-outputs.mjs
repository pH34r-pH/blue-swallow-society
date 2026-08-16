import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_DEPLOYMENT_OUTPUT_BYTES = 64 * 1024;
const STORAGE_ACCOUNT_NAME = /^[a-z0-9]{3,24}$/;
const CONTAINER_NAME = /^(?=.{3,63}$)(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TABLE_NAME = /^[A-Za-z][A-Za-z0-9]{2,62}$/;

const OUTPUT_CONTRACT = Object.freeze([
  ['backendCybermapBaseUrl', validateHttpsOrigin],
  ['wardriverReleaseStorageAccountName', validateStorageAccountName],
  ['wardriverReleaseContainerName', validateContainerName],
  ['passcodeRateLimitStorageAccountName', validateStorageAccountName],
  ['passcodeRateLimitTableName', validateTableName],
]);

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function outputValue(document, name) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('deployment output document is invalid');
  }
  const entry = document[name];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${name} is absent`);
  }
  return requireString(entry.value, name);
}

function validateHttpsOrigin(value) {
  const candidate = requireString(value, 'backendCybermapBaseUrl');
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('backendCybermapBaseUrl is invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.origin !== candidate) {
    throw new Error('backendCybermapBaseUrl is invalid');
  }
  return candidate;
}

function validateStorageAccountName(value) {
  const candidate = requireString(value, 'storage account name');
  if (!STORAGE_ACCOUNT_NAME.test(candidate)) throw new Error('storage account name is invalid');
  return candidate;
}

function validateContainerName(value) {
  const candidate = requireString(value, 'release container name');
  if (!CONTAINER_NAME.test(candidate)) throw new Error('release container name is invalid');
  return candidate;
}

function validateTableName(value) {
  const candidate = requireString(value, 'rate-limit table name');
  if (!TABLE_NAME.test(candidate)) throw new Error('rate-limit table name is invalid');
  return candidate;
}

export function validateDeploymentOutputs(document) {
  const values = {};
  for (const [name, validator] of OUTPUT_CONTRACT) {
    values[name] = validator(outputValue(document, name));
  }
  return values;
}

export function formatGitHubOutputs(values) {
  return OUTPUT_CONTRACT.map(([name]) => `${name}=${values[name]}\n`).join('');
}

export function writeDeploymentOutputs(inputPath, githubOutputPath) {
  const source = readFileSync(inputPath);
  if (source.byteLength > MAX_DEPLOYMENT_OUTPUT_BYTES) throw new Error('deployment output document is too large');
  let document;
  try {
    document = JSON.parse(source.toString('utf8'));
  } catch {
    throw new Error('deployment output document is invalid');
  }
  appendFileSync(githubOutputPath, formatGitHubOutputs(validateDeploymentOutputs(document)), { encoding: 'utf8' });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('expected input and output paths');
    writeDeploymentOutputs(process.argv[2], process.argv[3]);
  } catch {
    process.stderr.write('Deployment outputs are invalid.\n');
    process.exitCode = 1;
  }
}
