import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const appRoot = join(repoRoot, 'app');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

test('Obscura keeps successful root login in the sealed handoff state until operator navigation', async () => {
  let validationRequestCount = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname === '/api/validate-passcode') {
      validationRequestCount += 1;
      setTimeout(() => sendJson(res, {
        ok: true,
        operatorSession: {
          token: 'browser-token',
          expiresAt: '2099-07-26T20:00:00Z',
          ttlSeconds: 28800,
        },
      }), 75);
      return;
    }

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = normalize(join(appRoot, pathname));
    if (!filePath.startsWith(appRoot)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    try {
      let body = readFileSync(filePath, 'utf8');
      if (pathname === '/main.js') {
        const navigation = "window.location.assign('/operator');";
        if (!body.includes(navigation)) {
          throw new Error('root login navigation hook is missing');
        }
        body = body.replace(navigation, "window.__bssTestNavigate('/operator');");
      }
      res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
      if (pathname === '/index.html') {
        res.end(body.replace('</body>', `${browserBootScript()}</body>`));
        return;
      }
      res.end(body);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(error.message);
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const { stdout } = await execFileAsync('obscura', [
      'fetch',
      `http://127.0.0.1:${port}/`,
      '--allow-private-network',
      '--wait', '4',
      '--timeout', '30',
      '--dump', 'text',
    ], { encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });

    const rendered = parseObscuraJson(stdout);
    assert.equal(rendered.evalError, undefined, JSON.stringify(rendered));
    assert.deepEqual(rendered.errors, [], JSON.stringify(rendered));
    assert.equal(validationRequestCount, 1, 'rapid Enter submissions must produce one validation request');
    assert.equal(rendered.navigation, '/operator');
    assert.equal(rendered.loginControlsHidden, true);
    assert.equal(rendered.handoffHidden, false);
    assert.equal(rendered.mode, 'operator-handoff');
    assert.equal(rendered.passcodeValue, '');
    assert.match(rendered.handoffText, /Authenticating operator session/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function sendJson(res, body) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function browserBootScript() {
  return String.raw`
    <script>
      window.__bssTestErrors = [];
      window.__bssTestNavigate = (url) => { window.__bssTestNavigation = url; };
      window.addEventListener('error', (event) => window.__bssTestErrors.push(event.message));
      window.addEventListener('unhandledrejection', (event) => window.__bssTestErrors.push(event.reason?.message || String(event.reason)));

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (predicate, label) => {
        const deadline = Date.now() + 8000;
        let lastError = null;
        while (Date.now() < deadline) {
          try {
            if (predicate()) return;
          } catch (error) {
            lastError = error;
          }
          await sleep(50);
        }
        throw new Error('Timed out waiting for ' + label + (lastError ? ': ' + lastError.message : ''));
      };

      const capture = () => {
        const loginControls = document.getElementById('loginControls');
        const handoff = document.getElementById('operatorHandoff');
        return {
          navigation: window.__bssTestNavigation || null,
          loginControlsHidden: loginControls?.hidden,
          handoffHidden: handoff?.hidden,
          handoffText: handoff?.textContent?.replace(/\s+/g, ' ').trim(),
          passcodeValue: document.getElementById('passcodeInput')?.value,
          mode: document.body.dataset.mode,
          errors: window.__bssTestErrors || [],
        };
      };

      window.addEventListener('load', async () => {
        try {
          await waitFor(() => document.getElementById('loginBtn'), 'root login button');
          const input = document.getElementById('passcodeInput');
          input.value = 'browser-only-passcode';
          const submit = () => input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
          }));
          submit();
          submit();
          await waitFor(() => document.getElementById('operatorHandoff')?.hidden === false, 'sealed operator handoff');
          await waitFor(() => window.__bssTestNavigation === '/operator', 'operator navigation');
          document.body.textContent = JSON.stringify(capture());
        } catch (error) {
          document.body.textContent = JSON.stringify({
            evalError: error?.message || String(error),
            stack: error?.stack || '',
            errors: window.__bssTestErrors || [],
            snapshot: capture(),
          });
        }
      });
    </script>
  `;
}

function parseObscuraJson(output) {
  const lines = output.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith('{') && lines[index].endsWith('}')) {
      return JSON.parse(lines[index]);
    }
  }
  throw new Error(`No JSON payload found in Obscura output:\n${output}`);
}
