import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

function requirePositiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
}

function terminateProcessTree(child) {
  if (!child?.pid) return;

  if (process.platform === 'win32') {
    try {
      child.kill('SIGKILL');
    } catch {
      // The direct child can already have exited while the tree cleanup starts.
    }
    try {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.unref();
    } catch {
      // The direct-child kill above is still the bounded fallback on Windows.
    }
    return;
  }

  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // The child can already have exited while the process-group cleanup starts.
    }
  }
}

export function runBounded(command, argumentsList, { maxBytes, timeoutMs, now = () => performance.now(), env = process.env } = {}) {
  requirePositiveSafeInteger(maxBytes, 'maxBytes');
  requirePositiveSafeInteger(timeoutMs, 'timeoutMs');
  if (typeof now !== 'function') throw new TypeError('now must be a function.');
  if (!env || typeof env !== 'object') throw new TypeError('env must be an object.');

  const deadlineAt = now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let child;
    let timer;
    let settled = false;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);

    const settle = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };

    const fail = (error) => {
      terminateProcessTree(child);
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      settle(error);
    };

    try {
      child = spawn(command, argumentsList, {
        detached: process.platform !== 'win32',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      settle(new Error(`${command} could not be started.`));
      return;
    }

    const remainingMs = Math.max(0, deadlineAt - now());
    timer = setTimeout(() => {
      fail(new Error(`${command} exceeded its ${timeoutMs}ms deadline.`));
    }, remainingMs);

    const append = (current, chunk) => {
      const buffer = Buffer.from(chunk);
      const remaining = maxBytes - current.length;
      if (buffer.length > remaining) {
        fail(new Error(`${command} output exceeded the byte bound.`));
        return current;
      }
      return Buffer.concat([current, buffer]);
    };

    child.stdout?.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', () => {
      fail(new Error(`${command} could not be started.`));
    });
    child.once('close', (code) => {
      if (settled) return;
      if (now() >= deadlineAt) {
        fail(new Error(`${command} exceeded its ${timeoutMs}ms deadline.`));
        return;
      }
      terminateProcessTree(child);
      if (code !== 0) {
        settle(new Error(`${command} command failed without emitting diagnostics.`));
        return;
      }
      settle(null, { stdout, stderr });
    });
  });
}
