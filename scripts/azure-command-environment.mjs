const SAFE_AZURE_ENVIRONMENT_NAMES = Object.freeze([
  'PATH',
  'Path',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'SystemRoot',
  'WINDIR',
  'windir',
  'COMSPEC',
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'AZURE_CONFIG_DIR',
  'AZURE_EXTENSION_DIR',
  'AZURE_HTTP_USER_AGENT',
  'SSL_CERT_FILE',
  'REQUESTS_CA_BUNDLE',
  'NO_PROXY',
  'no_proxy',
]);

const EXPLICIT_SENSITIVE_ENVIRONMENT_NAMES = new Set([
  'SSH_KEY',
  'BSS_CYBERMAP_READ_TOKEN',
  'BSS_PAPER_STATE_TOKEN',
  'BSS_MORNING_BRIEF_TOKEN',
  'BSS_MTLS_PROXY_SECRET',
  'BSS_WARDRIVER_MTLS_TRUST_PEM',
  'BLUE_SWALLOW_PASSCODE_SHA256',
  'BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY',
  'BSS_WARDRIVER_RELEASE_PROBE_SECRET',
  'BSS_WARDRIVER_RELEASE_STORAGE_CONNECTION_STRING',
  'BLUE_SWALLOW_PASSCODE_RATE_LIMIT_STORAGE_CONNECTION_STRING',
  'BSS_RUNTIME_VERIFY_RELEASE_PROBE_SECRET',
]);

const SENSITIVE_ENVIRONMENT_NAME = /(?:^|_)(?:API_?KEY|ACCESS_?KEY|STORAGE_?KEY|SAS_?TOKEN|SECRET|TOKEN|PASSWORD|CONNECTION_?STRING|PRIVATE_?KEY|CREDENTIAL)(?:_|$)/i;

export { SAFE_AZURE_ENVIRONMENT_NAMES };

export function isSensitiveEnvironmentName(name) {
  return EXPLICIT_SENSITIVE_ENVIRONMENT_NAMES.has(name) || SENSITIVE_ENVIRONMENT_NAME.test(name);
}

export function sanitizeAzureEnvironment(source = process.env) {
  if (!source || typeof source !== 'object') throw new TypeError('source environment must be an object.');

  const environment = Object.create(null);
  for (const name of SAFE_AZURE_ENVIRONMENT_NAMES) {
    const value = source[name];
    if (typeof value === 'string' && value.length > 0) environment[name] = value;
  }
  return environment;
}

export function sensitiveEnvironmentValues(source = process.env) {
  if (!source || typeof source !== 'object') throw new TypeError('source environment must be an object.');

  const values = new Set();
  for (const [name, value] of Object.entries(source)) {
    if (isSensitiveEnvironmentName(name) && typeof value === 'string' && value.length > 0) values.add(value);
  }
  return values;
}
