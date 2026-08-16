import { runBounded } from './bounded-command.mjs';
import { sanitizeAzureEnvironment, sensitiveEnvironmentValues } from './azure-command-environment.mjs';

const MAX_CUSTOM_DOMAIN_OUTPUT_BYTES = 64 * 1024;
const CUSTOM_DOMAIN_TIMEOUT_MS = 15 * 60 * 1_000;
const REQUIRED_OIDC_ENVIRONMENT_NAMES = Object.freeze([
  'AZURE_SUBSCRIPTION_ID',
  'AZURE_CLIENT_ID',
  'AZURE_TENANT_ID',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
]);

function customDomainEnvironment(source = process.env) {
  const environment = sanitizeAzureEnvironment(source);
  for (const name of REQUIRED_OIDC_ENVIRONMENT_NAMES) {
    const value = source[name];
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Required custom-domain OIDC environment ${name} is absent.`);
    environment[name] = value;
  }
  return environment;
}

function assertSafeCustomDomainArguments(argumentsList, source = process.env) {
  const sensitiveValues = sensitiveEnvironmentValues(source);
  if (argumentsList.length === 0 || argumentsList.some((argument) => typeof argument !== 'string' || argument.length === 0 || sensitiveValues.has(argument))) {
    throw new Error('Custom-domain arguments are invalid.');
  }
}

try {
  const argumentsList = process.argv.slice(2);
  assertSafeCustomDomainArguments(argumentsList);
  await runBounded('python3', ['scripts/wireup-custom-domains.py', ...argumentsList], {
    maxBytes: MAX_CUSTOM_DOMAIN_OUTPUT_BYTES,
    timeoutMs: CUSTOM_DOMAIN_TIMEOUT_MS,
    env: customDomainEnvironment(),
  });
  process.stdout.write('CUSTOM_DOMAIN_CONFIGURATION=completed\n');
} catch {
  process.stderr.write('::error::Bounded custom-domain configuration failed.\n');
  process.exitCode = 1;
}
