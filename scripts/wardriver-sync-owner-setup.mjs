import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readConfig } = require('../api/_lib/wardriver-sync-auth');
const { configurationUrl } = require('../api/_lib/wardriver-sync-store');

// Run in the protected provisioning environment, redirecting to an operator-only
// setup file. Never print environment variables, private keys, or errors here.
try {
  const config = readConfig();
  process.stdout.write(JSON.stringify({ version: 1, endpoint: config.endpoint,
    groupId: config.groupId, ownerDeviceId: config.owner.deviceId,
    rosterPublicKeySpki: config.signer.publicKeySpki,
    configurationUrl: configurationUrl(config) }, null, 2) + '\n');
} catch {
  process.stderr.write('Wardriver sync configuration is incomplete or invalid.\n');
  process.exitCode = 1;
}
