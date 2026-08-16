import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`Bootstrap command failed: ${command} ${args.join(' ')} (${result.error?.code || `exit ${result.status}`})`);
  }
}

const npmCli = process.env.npm_execpath;
if (npmCli) {
  run(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--prefix', 'api']);
} else {
  run('npm', ['ci', '--ignore-scripts', '--prefix', 'api']);
}
