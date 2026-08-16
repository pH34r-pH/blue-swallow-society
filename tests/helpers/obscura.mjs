import { spawnSync } from 'node:child_process';

function defaultProbe(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  return {
    ok: !result.error && result.status === 0,
    detail: result.error?.code || result.stderr || result.stdout || `exit ${result.status}`,
  };
}

export function resolveObscura({ env = process.env, probe = defaultProbe } = {}) {
  const command = typeof env.OBSCURA_BIN === 'string' && env.OBSCURA_BIN.trim() ? env.OBSCURA_BIN.trim() : 'obscura';
  const result = probe(command, ['--version']);
  return {
    available: result === true || Boolean(result?.ok),
    command,
    detail: result?.detail || 'unavailable',
  };
}

export function requireObscura(t, options = {}) {
  const resolved = resolveObscura(options);
  if (resolved.available) return resolved.command;

  const message = `Obscura browser capability is not provisioned (${resolved.command}: ${resolved.detail}). Set OBSCURA_BIN or run on the bss-obscura runner.`;
  if (options.env?.BSS_REQUIRE_OBSCURA === '1' || (options.env === undefined && process.env.BSS_REQUIRE_OBSCURA === '1')) {
    throw new Error(message);
  }
  t.skip(message);
  return null;
}
