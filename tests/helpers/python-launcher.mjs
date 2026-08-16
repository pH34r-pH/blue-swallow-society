import { spawnSync } from 'node:child_process';

function defaultProbe(command, args) {
  const result = spawnSync(command, [...args, '--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  return {
    ok: !result.error && result.status === 0 && /Python 3(?:\.\d+)?/i.test(output),
    detail: result.error?.code || output.trim() || `exit ${result.status}`,
  };
}

export function resolvePythonLauncher({
  env = process.env,
  platform = process.platform,
  probe = defaultProbe,
} = {}) {
  const override = typeof env.BSS_PYTHON === 'string' ? env.BSS_PYTHON.trim() : '';
  const candidates = override
    ? [{ command: override, args: [] }]
    : platform === 'win32'
      ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }]
      : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];

  const failures = [];
  for (const candidate of candidates) {
    const result = probe(candidate.command, candidate.args);
    if (result === true || result?.ok) return candidate;
    failures.push(`${candidate.command}${candidate.args.length ? ` ${candidate.args.join(' ')}` : ''}: ${result?.detail || 'unavailable'}`);
  }

  throw new Error(`Python 3 is required for this contract test. Set BSS_PYTHON to an executable path. Attempts: ${failures.join('; ')}`);
}
