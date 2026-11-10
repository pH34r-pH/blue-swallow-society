import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { releaseFixture, readerFixture } from '../fixtures/wardriver-development.mjs';
const require = createRequire(import.meta.url);
const { fixture } = require('./viewer-fixture.cjs');
const { createCompanionAuthHandler } = require('../../api/companion-auth');
const { createCompanionGuard } = require('../../api/_lib/companion-auth');
const { createCompanionUiHandler } = require('../../api/companion-ui');
const { createCompanionDownloadsHandler } = require('../../api/companion-downloads');
const { createBirdJournalHandler } = require('../../api/bird-journal');
const ownerShell = require('../../api/operator-shell');

export async function startCompanionServer() {
  const f = await fixture();
  Object.assign(process.env, f.env);
  const state = { reads: [], privateReads: 0, failShell: false, releaseUnavailable: false, sessionDelay: 0,
    publication: { version: 1, updatedAt: null, posts: [], sightings: [] } };
  let origin;
  const getConfig = () => ({ ...f.settings, origin });
  const guard = createCompanionGuard({ getConfig, createStore: () => f.store });
  const auth = createCompanionAuthHandler({ getConfig, createStore: () => f.store,
    createLimiter: () => ({ reserveAttempt: async () => ({ limited: false }) }) });
  const ui = createCompanionUiHandler({ authorize: guard, readFile: async (...args) => {
    state.privateReads++; if (state.failShell) throw new Error('fixture_failure'); return readFile(...args);
  } });
  const release = releaseFixture();
  const downloads = createCompanionDownloadsHandler({ authorize: guard, env: readerFixture().env,
    createStore: () => ({ getRelease: async () => { if (state.releaseUnavailable) throw new Error('fixture_failure'); return release; },
      createDownloadUrl: async () => origin + '/synthetic-artifact' }) });
  const journal = createBirdJournalHandler({ readPublication: async () => state.publication });
  const staticPaths = { '/': 'index.html', '/main.js': 'main.js', '/journal.css': 'journal.css',
    '/journal-view.mjs': 'journal-view.mjs', '/companion-loader.mjs': 'companion-loader.mjs',
    '/companion.html': 'companion.html', '/owner': 'owner/index.html', '/owner/main.js': 'owner/main.js',
    '/styles.css': 'styles.css', '/operator/loader.js': 'operator/loader.js', '/operator/operator-session.mjs': 'operator/operator-session.mjs' };
  async function serve(incoming, outgoing) {
    const url = new URL(incoming.url, origin);
    state.reads.push(url.pathname);
    let body = '';
    for await (const chunk of incoming) { body += chunk; if (body.length > 8192) throw new Error('fixture_body_limit'); }
    const request = { method: incoming.method, headers: incoming.headers, query: Object.fromEntries(url.searchParams),
      params: { action: url.pathname.split('/').at(-1), asset: url.pathname.split('/').at(-1),
        artifact: url.pathname.slice('/api/companion-downloads/'.length) }, body: body ? JSON.parse(body) : undefined };
    const context = {};
    if (url.pathname === '/api/companion-auth/session' && state.sessionDelay) await new Promise((resolve) => setTimeout(resolve, state.sessionDelay));
    if (url.pathname.startsWith('/api/companion-auth/')) await auth(context, request);
    else if (url.pathname.startsWith('/api/companion-ui/')) await ui(context, request);
    else if (url.pathname.startsWith('/api/companion-downloads/')) await downloads(context, request);
    else if (url.pathname === '/api/bird-journal') await journal(context, request);
    else if (url.pathname === '/api/operator-shell') await ownerShell(context, request);
    else {
      const publicRoute = /^\/(archive|about|species(?:\/[a-z0-9-]+)?|journal\/[a-z0-9-]+)$/.test(url.pathname);
      const privateRoute = /^\/operator(?:\/(map|encounters|trips|downloads))?$/.test(url.pathname);
      const file = staticPaths[url.pathname] || (publicRoute ? 'index.html' : privateRoute ? 'companion.html' : null);
      context.res = file ? { status: 200, headers: { 'Content-Type': /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' },
        body: await readFile(new URL('../../app/' + file, import.meta.url), 'utf8') } : { status: 404, body: '' };
    }
    const response = context.res;
    const headers = { 'Content-Type': 'application/json', ...response.headers };
    if (response.cookies?.length) headers['Set-Cookie'] = response.cookies.map((cookie) =>
      cookie.name + '=' + cookie.value + '; Path=/; Max-Age=' + cookie.maxAge + '; HttpOnly; Secure; SameSite=' + cookie.sameSite);
    outgoing.writeHead(response.status, headers);
    outgoing.end(incoming.method === 'HEAD' ? undefined : typeof response.body === 'string' ? response.body : JSON.stringify(response.body));
  }
  const server = createServer((req, res) => void serve(req, res).catch(() => { if (!res.headersSent) res.writeHead(503); res.end(); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  return { origin, password: f.password, state, table: f.table, close: () => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); } };
}
