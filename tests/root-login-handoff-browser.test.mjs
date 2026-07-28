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
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

test('Obscura boots the operator surface from a memory-only root session without navigation', async () => {
  let validationRequestCount = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/validate-passcode') {
      validationRequestCount += 1;
      sendJson(res, { ok: true, operatorSession: { token: 'browser-token', expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(), ttlSeconds: 300 } });
      return;
    }
    if (url.pathname === '/operator/loader.js') {
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.js'] });
      res.end("export async function bootOperatorSurface() { document.body.dataset.mode = 'operator'; document.body.innerHTML = '<main id=operator-surface-loaded>operator</main>'; }");
      return;
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = normalize(join(appRoot, pathname));
    if (!filePath.startsWith(appRoot)) return res.writeHead(403).end('forbidden');
    try {
      let body = readFileSync(filePath, 'utf8');
      if (pathname === '/index.html') body = body.replace('</body>', `${browserBootScript()}</body>`);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end('missing'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const { stdout } = await execFileAsync('obscura', ['fetch', `http://127.0.0.1:${port}/`, '--allow-private-network', '--wait', '3', '--timeout', '30', '--dump', 'text'], { encoding: 'utf8', timeout: 45000 });
    const rendered = parseObscuraJson(stdout);
    assert.equal(rendered.evalError, undefined, JSON.stringify(rendered));
    assert.deepEqual(rendered.errors, [], JSON.stringify(rendered));
    assert.equal(validationRequestCount, 1);
    assert.equal(rendered.mode, 'operator');
    assert.equal(rendered.surfaceLoaded, true);
    assert.equal(rendered.navigation, null);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

function sendJson(res, body) { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); }
function browserBootScript() { return String.raw`<script>
  window.__bssErrors=[]; window.__bssTestNavigation=null;
  window.addEventListener('error', e=>window.__bssErrors.push(e.message));
  window.addEventListener('unhandledrejection', e=>window.__bssErrors.push(e.reason?.message||String(e.reason)));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async p=>{for(let i=0;i<160;i+=1){if(p()) return; await sleep(50)}throw new Error('timed out')};
  window.addEventListener('load',async()=>{try{const input=document.getElementById('passcodeInput'); input.value='browser-only-passcode'; input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); await waitFor(()=>document.getElementById('operator-surface-loaded')); document.body.textContent=JSON.stringify({mode:document.body.dataset.mode,surfaceLoaded:true,navigation:window.__bssTestNavigation,errors:window.__bssErrors})}catch(error){document.body.textContent=JSON.stringify({evalError:error.message,errors:window.__bssErrors})}});
</script>`; }
function parseObscuraJson(output) { const line = output.trim().split(/\r?\n/).map((line) => line.trim()).findLast((line) => line.startsWith('{') && line.endsWith('}')); if (!line) throw new Error(`No JSON payload found in Obscura output:\n${output}`); return JSON.parse(line); }
