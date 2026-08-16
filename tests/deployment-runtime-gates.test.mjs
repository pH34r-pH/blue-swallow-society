import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const workflow = read('.github/workflows/deploy-static-web-app.yml').replace(/\r\n/g, '\n');
const installer = read('infra/scripts/install-cybermap-api.sh').replace(/\r\n/g, '\n');
const verifierPath = new URL('../scripts/verify-deployment-runtime.mjs', import.meta.url);
const boundedCommandPath = new URL('../scripts/bounded-command.mjs', import.meta.url);
const boundedAzurePath = new URL('../scripts/run-bounded-az.mjs', import.meta.url);
const deploymentOutputEmitterPath = new URL('../scripts/emit-deployment-outputs.mjs', import.meta.url);
const customDomainRunnerPath = new URL('../scripts/run-bounded-custom-domains.mjs', import.meta.url);
const customDomainScriptPath = new URL('../scripts/wireup-custom-domains.py', import.meta.url);

function jobBlock(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start) : workflow.length;
  assert.ok(start >= 0 && end > start, `workflow must include ${name}`);
  return workflow.slice(start, end);
}

test('canonical deployment gates all Azure mutation behind complete source validation', () => {
  assert.match(workflow, /^  validate-source:\n/m);
  assert.match(workflow, /npm ci --ignore-scripts --prefix api/);
  assert.match(workflow, /npm run bootstrap/);
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
  assert.match(workflow, /npm ci --ignore-scripts --prefix vm\/cybermap-api/);
  assert.match(workflow, /npm test --prefix vm\/cybermap-api/);
  assert.match(workflow, /bash -n infra\/scripts\/install-cybermap-api\.sh/);
  assert.match(workflow, /function\.json/);
  assert.match(workflow, /deploy-infra:\n    needs: validate-source/m);
  assert.match(workflow, /deploy-app:\n    needs: \[validate-source, deploy-infra\]/m);

  const validateOffset = workflow.indexOf('  validate-source:');
  const infraOffset = workflow.indexOf('  deploy-infra:');
  assert.ok(validateOffset >= 0 && validateOffset < infraOffset, 'validation must be declared before deployment');
});

test('source validation has no Azure OIDC capability and every lockfile install disables lifecycle scripts', () => {
  const header = workflow.slice(0, workflow.indexOf('jobs:'));
  const validation = jobBlock('validate-source', 'deploy-infra');
  const deployInfra = jobBlock('deploy-infra', 'deploy-app');
  const deployApp = jobBlock('deploy-app', 'verify-runtime');
  const verifier = jobBlock('verify-runtime');

  assert.doesNotMatch(header, /id-token:\s*write/);
  assert.match(validation, /permissions:\n      contents: read/);
  assert.doesNotMatch(validation, /id-token:\s*write/);
  assert.match(validation, /npm ci --ignore-scripts --prefix vm\/cybermap-api/);
  assert.match(deployInfra, /permissions:\n      id-token: write\n      contents: read/);
  assert.match(deployApp, /permissions:\n      id-token: write\n      contents: read/);
  assert.match(deployInfra, /uses: actions\/setup-node@[a-f0-9]{40}/i);
  assert.match(deployApp, /uses: actions\/setup-node@[a-f0-9]{40}/i);
  assert.match(deployInfra, /node-version: '24'/);
  assert.match(deployApp, /node-version: '24'/);
  assert.match(verifier, /permissions:\n      id-token: write\n      contents: read/);
});

test('all workflow action references are immutable commits', () => {
  const actionRefs = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(actionRefs.length > 0, 'workflow must declare actions');
  for (const actionRef of actionRefs) {
    assert.match(actionRef, /^[^@]+@[a-f0-9]{40}$/i, `workflow action must pin an immutable commit: ${actionRef}`);
  }
});

test('all workflow Azure CLI calls use a bounded redacting adapter', () => {
  assert.equal(existsSync(boundedAzurePath), true, 'bounded Azure adapter must exist');
  const adapter = readFileSync(boundedAzurePath, 'utf8');
  const directAzureLines = workflow.split('\n').filter((line) => /(?:^|[\s=(])az\s+/.test(line));

  assert.match(workflow, /node scripts\/run-bounded-az\.mjs/);
  assert.deepEqual(directAzureLines, [], 'workflow must not invoke az directly');
  assert.doesNotMatch(workflow, /az_stderr\.log|statusMessage|deployment operation group list/);
  assert.match(adapter, /runBounded\('az'/);
  assert.match(adapter, /MAX_AZURE_OUTPUT_BYTES/);
  assert.match(adapter, /AZURE_COMMAND_TIMEOUT_MS/);
  assert.doesNotMatch(adapter, /error\.message|error\.stack|stderr\.toString|process\.argv\.join/);
});

test('deployment secrets avoid Azure CLI arguments and lifecycle hooks', () => {
  const adapter = readFileSync(boundedAzurePath, 'utf8');

  assert.match(installer, /npm ci --ignore-scripts --omit=dev/);
  assert.match(workflow, /secure_parameters_file="\$\(mktemp\)"/);
  assert.match(workflow, /--parameters "@\$\{secure_parameters_file\}"/);
  assert.doesNotMatch(workflow, /--parameters\s+(?:sshPublicKey|postgresAdministratorLoginPassword|cybermapReadToken|paperStateToken|morningBriefToken|mtlsProxySecret|wardriverMtlsTrustCertificatePem)=/);
  assert.match(workflow, /staticwebapp appsettings list/);
  assert.match(workflow, /rest --method put/);
  assert.match(workflow, /--body "@\$\{settings_file\}"/);
  assert.doesNotMatch(workflow, /staticwebapp appsettings set/);
  assert.match(adapter, /SAFE_AZURE_ENVIRONMENT_NAMES/);
  assert.match(adapter, /sanitizeAzureEnvironment/);
  assert.match(adapter, /env: sanitizeAzureEnvironment\(\)/);
});

test('deployment output handoff validates fixed schemas before GitHub output and clears the dynamic SWA token', async () => {
  assert.equal(existsSync(deploymentOutputEmitterPath), true, 'deployment-output emitter must exist');
  const emitter = readFileSync(deploymentOutputEmitterPath, 'utf8');
  const { validateDeploymentOutputs, writeDeploymentOutputs } = await import(deploymentOutputEmitterPath);
  const valid = {
    backendCybermapBaseUrl: { value: 'https://cybermap.example.net' },
    wardriverReleaseStorageAccountName: { value: 'wardriverrelease01' },
    wardriverReleaseContainerName: { value: 'wardriver-releases' },
    passcodeRateLimitStorageAccountName: { value: 'passcodelimits01' },
    passcodeRateLimitTableName: { value: 'PasscodeLimits' },
  };
  const expected = {
    backendCybermapBaseUrl: 'https://cybermap.example.net',
    wardriverReleaseStorageAccountName: 'wardriverrelease01',
    wardriverReleaseContainerName: 'wardriver-releases',
    passcodeRateLimitStorageAccountName: 'passcodelimits01',
    passcodeRateLimitTableName: 'PasscodeLimits',
  };
  const directory = mkdtempSync(join(tmpdir(), 'bss-deployment-output-'));
  try {
    const inputPath = join(directory, 'outputs.json');
    const githubOutputPath = join(directory, 'github-output');
    writeFileSync(inputPath, JSON.stringify(valid), { encoding: 'utf8', mode: 0o600 });
    writeFileSync(githubOutputPath, '', { encoding: 'utf8', mode: 0o600 });

    assert.deepEqual(validateDeploymentOutputs(valid), expected);
    writeDeploymentOutputs(inputPath, githubOutputPath);
    assert.equal(
      readFileSync(githubOutputPath, 'utf8'),
      'backendCybermapBaseUrl=https://cybermap.example.net\n'
        + 'wardriverReleaseStorageAccountName=wardriverrelease01\n'
        + 'wardriverReleaseContainerName=wardriver-releases\n'
        + 'passcodeRateLimitStorageAccountName=passcodelimits01\n'
        + 'passcodeRateLimitTableName=PasscodeLimits\n',
    );
    assert.throws(() => validateDeploymentOutputs({ ...valid, backendCybermapBaseUrl: { value: 'https://cybermap.example.net\ninjected=value' } }));
    assert.throws(() => validateDeploymentOutputs({ ...valid, wardriverReleaseStorageAccountName: { value: 'wardriver\ninjected' } }));
    assert.throws(() => validateDeploymentOutputs({ ...valid, wardriverReleaseContainerName: { value: 'wardriver--releases' } }));
    assert.throws(() => validateDeploymentOutputs({ ...valid, passcodeRateLimitTableName: { value: '1NotATable' } }));
    assert.throws(() => validateDeploymentOutputs({ ...valid, backendCybermapBaseUrl: { value: 'http://cybermap.example.net' } }));

    assert.match(emitter, /Deployment outputs are invalid\./);
    assert.match(workflow, /env -i PATH="\$PATH" HOME="\$HOME" node scripts\/emit-deployment-outputs\.mjs "\$deployment_output_file" "\$GITHUB_OUTPUT"/);
    assert.doesNotMatch(workflow, /echo ".*" >> "\$GITHUB_OUTPUT"/);
    const deployActionOffset = workflow.indexOf('      - name: Deploy SWA');
    const clearTokenOffset = workflow.indexOf('      - name: Clear SWA deployment token');
    const customDomainOffset = workflow.indexOf('      - name: Configure custom domains');
    assert.ok(deployActionOffset >= 0 && clearTokenOffset > deployActionOffset && customDomainOffset > clearTokenOffset, 'token cleanup must run between SWA deploy and custom-domain configuration');
    const tokenCleanup = workflow.slice(clearTokenOffset, customDomainOffset);
    assert.match(tokenCleanup, /if: always\(\)/);
    assert.match(tokenCleanup, /echo "SWA_DEPLOYMENT_TOKEN=" >> "\$GITHUB_ENV"/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('Azure adapter writes result bytes privately, rejects sensitive arguments, and allowlists its child environment', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bss-bounded-az-'));
  const adapterPath = fileURLToPath(boundedAzurePath);
  const outputPath = join(directory, 'azure-output.txt');
  const fakeName = process.platform === 'win32' ? 'az.exe' : 'az';
  const fakePath = join(directory, fakeName);
  const fakeProgram = "require('node:fs').writeFileSync('observed-env.json', JSON.stringify(process.env)); process.stdout.write('azure-secret-output')";

  try {
    copyFileSync(process.execPath, fakePath);
    if (process.platform !== 'win32') chmodSync(fakePath, 0o700);
    writeFileSync(join(directory, 'version'), fakeProgram, 'utf8');
    writeFileSync(outputPath, '', { encoding: 'utf8', mode: 0o600 });

    const environment = {
      PATH: `${directory}${delimiter}${process.env.PATH || ''}`,
      HOME: process.env.HOME || directory,
      USERPROFILE: process.env.USERPROFILE || directory,
      SYSTEMROOT: process.env.SYSTEMROOT,
      SystemRoot: process.env.SystemRoot,
      COMSPEC: process.env.COMSPEC,
      ComSpec: process.env.ComSpec,
      PATHEXT: process.env.PATHEXT,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      AZURE_STORAGE_KEY: 'forbidden-storage-key',
      API_KEY: 'forbidden-api-key',
    };
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete environment[name];
    }

    const result = spawnSync(process.execPath, [adapterPath, '--output-file', outputPath, 'version'], {
      cwd: directory,
      encoding: 'utf8',
      env: environment,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '', 'adapter stdout must not carry Azure output');
    assert.equal(readFileSync(outputPath, 'utf8'), 'azure-secret-output');
    if (process.platform !== 'win32') assert.equal(statSync(outputPath).mode & 0o777, 0o600);

    const observed = JSON.parse(readFileSync(join(directory, 'observed-env.json'), 'utf8'));
    assert.equal(Object.hasOwn(observed, 'AZURE_STORAGE_KEY'), false);
    assert.equal(Object.hasOwn(observed, 'API_KEY'), false);

    const sensitiveArgument = spawnSync(process.execPath, [adapterPath, '--output-file', join(directory, 'rejected.txt'), 'storage', '--api-key', 'forbidden-api-key'], {
      cwd: directory,
      encoding: 'utf8',
      env: environment,
    });
    assert.notEqual(sensitiveArgument.status, 0);
    assert.equal(sensitiveArgument.stdout, '');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('custom-domain OIDC/ARM wiring is bounded and cannot surface raw remote diagnostics', () => {
  const adapter = readFileSync(boundedAzurePath, 'utf8');
  const customDomainRunner = readFileSync(customDomainRunnerPath, 'utf8');
  const customDomainScript = readFileSync(customDomainScriptPath, 'utf8');

  assert.match(adapter, /argument === '--capture-output'\) throw new Error\('Azure stdout capture is not permitted\.'/);
  assert.doesNotMatch(adapter, /process\.stdout\.write\(stdout\)/);
  assert.match(adapter, /OUTPUT_FILE_FLAG/);
  assert.match(adapter, /assertSafeAzureArguments/);
  assert.match(workflow, /--output-file/);
  assert.doesNotMatch(workflow, /--capture-output/);
  assert.doesNotMatch(workflow, /token=\$token.*GITHUB_OUTPUT/);
  assert.match(workflow, /SWA_DEPLOYMENT_TOKEN=.*GITHUB_ENV/);
  assert.match(workflow, /SWA deployment token must not contain control characters\./);
  assert.match(workflow, /node scripts\/run-bounded-custom-domains\.mjs/);
  assert.doesNotMatch(workflow, /python3 scripts\/wireup-custom-domains\.py/);
  assert.match(customDomainRunner, /runBounded\('python3'/);
  assert.match(customDomainRunner, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(customDomainRunner, /CUSTOM_DOMAIN_CONFIGURATION=completed/);
  assert.match(customDomainScript, /MAX_RESPONSE_BYTES/);
  assert.match(customDomainScript, /response\.read\(MAX_RESPONSE_BYTES \+ 1\)/);
  assert.doesNotMatch(customDomainScript, /errors="replace"/);
  assert.doesNotMatch(customDomainScript, /body\.strip\(\)/);
});

test('installer writes its public migration receipt only after every ordered migration succeeds', () => {
  const lastMigration = installer.lastIndexOf('run_migration 0006_best_effort_observation_progress');
  const receipt = installer.indexOf('cybermap-api-release.json');
  assert.ok(lastMigration >= 0 && receipt > lastMigration, 'receipt must follow the final migration');
  assert.match(installer, /json_agg\(version ORDER BY version\)/);
  assert.match(installer, /"migrations"/);
  assert.match(installer, /"archive_sha256"/);
  const receiptLine = installer.split('\n').find((line) => line.includes('cybermap-api-release.json'));
  assert.ok(receiptLine, 'installer must write a release receipt');
  assert.doesNotMatch(receiptLine, /POSTGRES_PASSWORD|CYBERMAP_READ_TOKEN|PAPER_STATE_TOKEN|MORNING_BRIEF_TOKEN|BSS_MTLS_PROXY_SECRET/);
});

test('post-deployment verification is bounded, provenance-aware, and read-only', () => {
  assert.equal(existsSync(verifierPath), true, 'runtime verifier must exist');
  const verifier = readFileSync(verifierPath, 'utf8');
  assert.match(workflow, /^  verify-runtime:\n/m);
  assert.match(workflow, /verify-runtime:\n    needs: \[deploy-infra, deploy-app\]/m);
  assert.match(workflow, /node scripts\/verify-deployment-runtime\.mjs/);
  assert.match(workflow, /BSS_RUNTIME_VERIFY_RELEASE_PROBE_SECRET/);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/i);
  assert.match(workflow, /runtime-verification-receipt\.json/);

  assert.match(verifier, /MAX_RESPONSE_BYTES/);
  assert.match(verifier, /MAX_AZURE_OUTPUT_BYTES/);
  assert.match(verifier, /AZURE_COMMAND_TIMEOUT_MS/);
  assert.match(verifier, /bounded-command\.mjs/);
  assert.match(verifier, /sanitizeAzureEnvironment/);
  assert.match(verifier, /env: sanitizeAzureEnvironment\(\)/);
  assert.match(verifier, /\/healthz/);
  assert.match(verifier, /\/readyz/);
  assert.match(verifier, /\/api\/wardriver-release\/probe/);
  assert.match(verifier, /az[\s\S]*vm[\s\S]*run-command[\s\S]*invoke/);
  assert.match(verifier, /GITHUB_SHA/);
  assert.match(verifier, /schema_migrations/);
  assert.match(verifier, /retry/);
  assert.match(verifier, /downloadUrl/);
  assert.match(verifier, /BSS_RUNTIME_RECEIPT=/);
  assert.match(verifier, /writeFileSync\('runtime-verification-receipt\.json'/);
  assert.doesNotMatch(verifier, /console\.log\([^)]*RELEASE_PROBE_SECRET/);
});

test('runtime verifier command runner rejects a hung process within its deadline', async () => {
  const { runBounded } = await import(boundedCommandPath);
  const startedAt = Date.now();

  await assert.rejects(
    () => runBounded(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      maxBytes: 64,
      timeoutMs: 100,
    }),
    /exceeded its 100ms deadline/,
  );

  assert.ok(Date.now() - startedAt < 2_000, 'hung command must not retain the verifier beyond its deadline');
});

test('runtime verifier command runner rejects a close observed at the monotonic deadline', async () => {
  const { runBounded } = await import(boundedCommandPath);
  const samples = [0, 0, 1_000];

  await assert.rejects(
    () => runBounded(process.execPath, ['-e', ''], {
      maxBytes: 64,
      timeoutMs: 1_000,
      now: () => samples.shift() ?? 1_000,
    }),
    /exceeded its 1000ms deadline/,
  );
});
