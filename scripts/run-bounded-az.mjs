import { chmodSync, writeFileSync } from 'node:fs';
import { runBounded } from './bounded-command.mjs';
import {
  SAFE_AZURE_ENVIRONMENT_NAMES,
  sanitizeAzureEnvironment,
  sensitiveEnvironmentValues,
} from './azure-command-environment.mjs';

const MAX_AZURE_OUTPUT_BYTES = 64 * 1024;
const AZURE_COMMAND_TIMEOUT_MS = 45 * 60 * 1_000;
const OUTPUT_FILE_FLAG = '--output-file';
const FORBIDDEN_AZURE_OPTIONS = new Set([
  '--api-key',
  '--password',
  '--connection-string',
  '--client-secret',
  '--certificate',
  '--certificate-password',
  '--admin-password',
  '--storage-account-key',
  '--sas-token',
  '--ssh-key-value',
  '--private-key',
  '--secret',
  '--token',
]);
const FILE_REFERENCE_ONLY_OPTIONS = new Set(['--body']);

export { SAFE_AZURE_ENVIRONMENT_NAMES };

export function assertSafeAzureArguments(argumentsList, source = process.env) {
  const sensitiveValues = sensitiveEnvironmentValues(source);

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (typeof argument !== 'string' || argument.length === 0) throw new Error('Azure arguments must be non-empty strings.');
    if (sensitiveValues.has(argument)) throw new Error('Azure arguments must not contain inherited sensitive values.');

    const equalsIndex = argument.indexOf('=');
    const option = (equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument).toLowerCase();
    const inlineValue = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;
    const nextValue = inlineValue === undefined ? argumentsList[index + 1] : inlineValue;

    if (FORBIDDEN_AZURE_OPTIONS.has(option)) throw new Error(`Azure option ${option} is not permitted.`);
    if (FILE_REFERENCE_ONLY_OPTIONS.has(option) && (typeof nextValue !== 'string' || !nextValue.startsWith('@'))) {
      throw new Error(`Azure option ${option} must use a file reference.`);
    }
    if (typeof nextValue === 'string' && sensitiveValues.has(nextValue)) {
      throw new Error('Azure arguments must not contain inherited sensitive values.');
    }
  }
}

function parseAzureArguments(rawArguments) {
  const azureArguments = [];
  let outputFile;

  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index];
    if (argument === '--capture-output') throw new Error('Azure stdout capture is not permitted.');
    if (argument !== OUTPUT_FILE_FLAG) {
      azureArguments.push(argument);
      continue;
    }

    const candidate = rawArguments[index + 1];
    if (outputFile !== undefined || typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0')) {
      throw new Error('Azure output file argument is invalid.');
    }
    outputFile = candidate;
    index += 1;
  }

  if (azureArguments.length === 0) throw new Error('Azure command arguments are required.');
  return { azureArguments, outputFile };
}

function writePrivateOutput(outputFile, stdout) {
  if (outputFile === undefined) return;
  chmodSync(outputFile, 0o600);
  writeFileSync(outputFile, stdout, { mode: 0o600, flag: 'w' });
  chmodSync(outputFile, 0o600);
}

try {
  const { azureArguments, outputFile } = parseAzureArguments(process.argv.slice(2));
  assertSafeAzureArguments(azureArguments);
  const { stdout } = await runBounded('az', azureArguments, {
    maxBytes: MAX_AZURE_OUTPUT_BYTES,
    timeoutMs: AZURE_COMMAND_TIMEOUT_MS,
    env: sanitizeAzureEnvironment(),
  });
  writePrivateOutput(outputFile, stdout);
} catch {
  fail();
}

function fail() {
  process.stderr.write('::error::Bounded Azure CLI command failed.\n');
  process.exitCode = 1;
}
