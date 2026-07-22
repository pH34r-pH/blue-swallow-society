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
const operatorShell = readFileSync(join(repoRoot, 'api/_private/operator/shell.html'), 'utf8');
const nacreCss = readFileSync(join(repoRoot, 'api/_private/operator/nacre-moire.css'), 'utf8');
const fixturePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4W7sAAAAASUVORK5CYII=', 'base64');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const runId = 'brief-2026-07-21T070000Z';
const pageHash = 'fixture-page-sha256-0000000000000000000000000000000000000000000000000000';
const packetHash = 'fixture-packet-sha256-000000000000000000000000000000000000000000000000000';
const brief = {
  run_id: runId,
  generated_at: '2026-07-21T14:00:00.000Z',
  archived_at: '2026-07-21T14:01:00.000Z',
  artifact_count: 3,
  canonical_state_hash: 'fixture-canonical-state-hash-000000000000000000000000000000000000000000000000',
  package_sha256: 'fixture-package-hash-0000000000000000000000000000000000000000000000000000000',
  summary: 'Fixture-only visual verification packet. The protected console owns the dossier frame; images remain verified archive artifacts.',
  artifacts: [
    { artifact_id: 'page-01', media_type: 'image/png', sha256: pageHash },
    { artifact_id: 'page-02', media_type: 'image/png', sha256: pageHash },
    { artifact_id: 'packet', media_type: 'application/json', sha256: packetHash },
  ],
};

test('Obscura renders the Morning dossier inside the protected operator console and returns to landing', async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/operator-shell') {
      if (request.headers['x-blue-swallow-operator-token'] !== 'browser-token') {
        response.writeHead(403).end('forbidden');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<style>${nacreCss}</style>${operatorShell}`);
      return;
    }
    if (url.pathname === '/api/morning-brief') {
      sendJson(response, { ok: true, runs: [brief] });
      return;
    }
    if (url.pathname === `/api/morning-brief/${runId}`) {
      sendJson(response, { ok: true, brief });
      return;
    }
    if (url.pathname.startsWith(`/api/morning-brief/${runId}/artifacts/`)) {
      const artifactId = url.pathname.split('/').at(-1);
      if (artifactId === 'page-01' || artifactId === 'page-02') {
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'X-Blue-Swallow-Artifact-SHA256': pageHash,
          'Cache-Control': 'no-store',
        });
        response.end(fixturePng);
        return;
      }
      if (artifactId === 'packet') {
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Blue-Swallow-Artifact-SHA256': packetHash,
          'Cache-Control': 'no-store',
        });
        response.end(JSON.stringify({ fixture: true }));
        return;
      }
      response.writeHead(404).end('missing');
      return;
    }

    const pathname = url.pathname === '/operator' ? '/operator/index.html' : (url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = normalize(join(appRoot, pathname));
    if (!filePath.startsWith(appRoot)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    try {
      const body = readFileSync(filePath);
      response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
      if (pathname === '/operator/morning-brief.html') {
        const html = body.toString('utf8').replace(
          '<script src="/operator/loader.js" type="module"></script>',
          `${operatorSessionSeedScript()}${browserBootScript()}<script src="/operator/loader.js" type="module"></script>`,
        );
        response.end(html);
        return;
      }
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const { stdout } = await execFileAsync('obscura', [
      'fetch',
      `http://127.0.0.1:${port}/operator/morning-brief.html`,
      '--allow-private-network',
      '--wait', '10',
      '--timeout', '30',
      '--dump', 'text',
    ], { encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });

    const rendered = parseObscuraJson(stdout);
    assert.equal(rendered.evalError, undefined, JSON.stringify(rendered));
    assert.deepEqual(rendered.errors, [], JSON.stringify(rendered));
    assert.deepEqual(rendered.tabLabels, ['Landing', 'Tzeentch', 'Godeye', 'Morning dossier', 'Slang']);
    assert.equal(rendered.initial.activeTab, 'morning-brief');
    assert.equal(rendered.initial.activePanels, 1);
    assert.equal(rendered.initial.runCount, 1);
    assert.equal(rendered.initial.pageCount, 2);
    assert.equal(rendered.initial.returnControl, 'button');
    assert.match(rendered.initial.status, /Sealed archive/);
    assert.equal(rendered.returned.activeTab, 'landing');
    assert.equal(rendered.returned.pathname, '/operator');
    assert.equal(rendered.returned.activePanels, 1);
    assert.equal(rendered.reopened.activeTab, 'morning-brief');
    assert.equal(rendered.reopened.activePanels, 1);
    assert.ok(rendered.visibleTabs.every((tab) => tab.visible), JSON.stringify(rendered.visibleTabs));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function sendJson(response, body) {
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function operatorSessionSeedScript() {
  return String.raw`
    <script>
      sessionStorage.setItem('blue-swallow-society:operator-session', JSON.stringify({
        token: 'browser-token',
        expiresAt: '2099-07-21T20:00:00Z',
        ttlSeconds: 28800,
      }));
    </script>
  `;
}

function browserBootScript() {
  return String.raw`
    <script>
      window.__bssErrors = [];
      window.addEventListener('error', (event) => window.__bssErrors.push(event.message));
      window.addEventListener('unhandledrejection', (event) => window.__bssErrors.push(event.reason?.message || String(event.reason)));

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

      const activeSnapshot = () => ({
        activeTab: document.querySelector('.tab-btn[aria-selected="true"]')?.dataset.tab || null,
        activePanels: Array.from(document.querySelectorAll('.tab-content')).filter((panel) => panel.classList.contains('active')).length,
        pathName: window.location.pathname,
        pathname: window.location.pathname,
        runCount: document.querySelectorAll('#briefRunSelect option').length,
        pageCount: document.querySelectorAll('.brief-page img').length,
        returnControl: document.querySelector('#briefReturnToConsole')?.tagName.toLowerCase() || null,
        status: document.querySelector('#briefStatus')?.textContent || '',
      });

      const capturePayload = () => {
        const visibleTabs = Array.from(document.querySelectorAll('.tab-btn[data-tab]')).map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            label: button.textContent.trim().replace(/\s+/g, ' '),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            visible: rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= window.innerWidth + 1,
          };
        });
        return {
          tabLabels: visibleTabs.map((tab) => tab.label),
          visibleTabs,
          initial: window.__initialSnapshot,
          returned: window.__returnedSnapshot,
          reopened: window.__reopenedSnapshot,
          errors: window.__bssErrors || [],
        };
      };

      window.addEventListener('load', async () => {
        try {
          await waitFor(() => document.querySelector('#morning-brief-tab.active'), 'deep-linked morning dossier tab');
          await waitFor(() => document.querySelectorAll('.brief-page img').length === 2, 'verified dossier pages');
          window.__initialSnapshot = activeSnapshot();
          document.querySelector('#briefReturnToConsole')?.click();
          await waitFor(() => document.querySelector('#landing-tab.active'), 'operator landing return');
          window.__returnedSnapshot = activeSnapshot();
          document.querySelector('#tab-morning-brief')?.click();
          await waitFor(() => document.querySelector('#morning-brief-tab.active'), 'top-level morning dossier tab');
          window.__reopenedSnapshot = activeSnapshot();
          document.body.textContent = JSON.stringify(capturePayload());
        } catch (error) {
          document.body.textContent = JSON.stringify({
            evalError: error?.message || String(error),
            stack: error?.stack || '',
            errors: window.__bssErrors || [],
            snapshot: capturePayload(),
          });
        }
      });
    </script>
  `;
}

function parseObscuraJson(output) {
  const lines = output.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith('{') && lines[index].endsWith('}')) return JSON.parse(lines[index]);
  }
  throw new Error(`No JSON payload found in Obscura output:\n${output}`);
}
