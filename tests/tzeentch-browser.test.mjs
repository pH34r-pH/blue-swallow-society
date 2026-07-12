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
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const osintPayload = {
  ok: true,
  mode: 'overview',
  query: '',
  requestedMode: 'overview',
  detectedType: 'overview',
  detectedLabel: 'Live overview',
  normalizedQuery: '',
  summary: 'Public OSINT overview loaded.',
  metrics: {
    sourceCount: 2,
    findingCount: 2,
    updatedAt: '2026-07-09T12:00:00Z',
    headline: 'Overview loaded',
  },
  supportedSources: ['Hacker News', 'Reddit', 'CoinGecko', 'Polymarket Gamma'],
  sources: [
    { name: 'Hacker News', status: 'live', detail: 'Top stories' },
    { name: 'Reddit worldnews', status: 'live', detail: 'Hot posts' },
  ],
  sections: {
    profile: [{ label: 'Mode', value: 'Overview', detail: 'No target entered yet.' }],
    network: [],
    social: [],
    archive: [],
  },
  signals: [],
  sourceDigest: ['Hacker News', 'Reddit'],
};

const tzeentchPayload = {
  ok: true,
  updatedAt: '2026-07-09T12:00:00Z',
  publicOnly: true,
  sourceFamilies: ['Hacker News', 'Reddit', 'CoinGecko', 'Polymarket Gamma'],
  warnings: [],
  murmurs: {
    hackerNews: [
      {
        id: 'hn-btc',
        title: 'Bitcoin ETF flows light a BTC fuse',
        url: 'https://example.com/btc',
        source: 'Hacker News',
        author: 'alice',
        score: 120,
        comments: 18,
        publishedAt: '2026-07-09T11:45:00Z',
        domain: 'example.com',
      },
    ],
    reddit: [
      {
        id: 'rd-sol',
        title: 'Solana devs ship new public client notes',
        url: 'https://example.com/sol',
        source: 'r/cryptocurrency',
        author: 'bob',
        score: 90,
        comments: 22,
        publishedAt: '2026-07-09T11:30:00Z',
        domain: 'example.com',
      },
    ],
    updatedAt: '2026-07-09T12:00:00Z',
  },
  crypto: {
    markets: [
      {
        id: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        image: '',
        currentPrice: 65000,
        marketCap: 1300000000000,
        marketCapRank: 1,
        totalVolume: 25000000000,
        priceChange24h: 2.5,
        priceChange7d: 6.1,
        high24h: 66000,
        low24h: 64000,
        lastUpdated: '2026-07-09T12:00:00Z',
        sparklinePrices: [63000, 63500, 64000, 64750, 65000],
      },
    ],
    updatedAt: '2026-07-09T12:00:00Z',
  },
  polymarket: {
    newMarkets: [
      {
        id: 'pm-btc',
        title: 'Will Bitcoin close above 70k?',
        marketUrl: 'https://polymarket.com/event/pm-btc',
        createdAt: '2026-07-09T10:00:00Z',
        updatedAt: '2026-07-09T11:00:00Z',
        liquidity: 125000,
        volume: 425000,
        yesPrice: 0.44,
        noPrice: 0.56,
      },
    ],
    resolvedMarkets: [],
    updatedAt: '2026-07-09T12:00:00Z',
  },
  paperBooks: {
    updatedAt: '2026-07-09T12:00:00Z',
    paperOnly: true,
    summary: '3 paper books running in parallel against public feeds.',
    loop: { cadence: 'test', strategyCount: 3, iterationCount: 4, riskNote: 'Paper only.' },
    benchmark: { label: 'BTC 24h proxy', assetId: 'bitcoin', mark: 65000, returnPct: 2.5 },
    books: [
      {
        id: 'murmur-momentum',
        name: 'Murmur Momentum',
        strategy: 'Buy high-volume crypto assets showing positive public-feed momentum.',
        iteration: 4,
        cash: 9000,
        equity: 10250,
        totalPnl: 250,
        totalReturnPct: 2.5,
        alphaPct: 0,
        positions: [],
        pendingOrders: [],
        tradeLog: [],
      },
    ],
  },
};

test('Obscura renders Tzeentch sub-tabs and switches to the Crypto panel', async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/validate-passcode') {
      sendJson(res, {
        ok: true,
        operatorSession: {
          token: 'browser-token',
          expiresAt: '2099-07-12T20:00:00Z',
          ttlSeconds: 28800,
        },
      });
      return;
    }
    if (url.pathname === '/api/operator-shell') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(repoRoot, 'api/_private/operator/shell.html'), 'utf8'));
      return;
    }
    if (url.pathname === '/api/osint') {
      sendJson(res, osintPayload);
      return;
    }
    if (url.pathname === '/api/tzeentch') {
      sendJson(res, tzeentchPayload);
      return;
    }

    const pathname = url.pathname === '/operator' ? '/operator/index.html' : (url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = normalize(join(appRoot, pathname));
    if (!filePath.startsWith(appRoot)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    try {
      const body = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
      if (pathname === '/operator/index.html') {
        const html = body.toString('utf8')
          .replace('<script src="/operator/loader.js" type="module"></script>', `${operatorSessionSeedScript()}${browserBootScript()}<script src="/operator/loader.js" type="module"></script>`);
        res.end(html);
        return;
      }
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const { stdout } = await execFileAsync('obscura', [
      'fetch',
      `http://127.0.0.1:${port}/operator`,
      '--allow-private-network',
      '--wait',
      '10',
      '--timeout',
      '30',
      '--dump',
      'text',
    ], { encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });

    const rendered = parseObscuraJson(stdout);
    assert.equal(rendered.evalError, undefined, JSON.stringify(rendered));
    assert.deepEqual(rendered.errors, [], JSON.stringify(rendered));
    assert.equal(rendered.activeSurface, 'crypto');
    assert.equal(rendered.seekHidden, true);
    assert.equal(rendered.marketHidden, false);
    assert.equal(rendered.cryptoCards, 1, JSON.stringify(rendered));
    assert.match(rendered.cryptoText, /Bitcoin/);
    assert.match(rendered.cryptoText, /murmur match/i);
    assert.deepEqual(rendered.tabLabels, ['Seek', 'Murmurs', 'Crypto', 'Polymarket', 'Actionable Intel']);
    assert.ok(rendered.visibleTabs.every((tab) => tab.visible), JSON.stringify(rendered.visibleTabs));
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

function operatorSessionSeedScript() {
  return String.raw`
    <script>
      sessionStorage.setItem('blue-swallow-society:operator-session', JSON.stringify({
        token: 'browser-token',
        expiresAt: '2099-07-12T20:00:00Z',
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

      const capturePayload = () => {
        const visibleTabs = Array.from(document.querySelectorAll('.tzeentch-subtab')).map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            label: button.textContent.trim().replace(/\s+/g, ' '),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= window.innerWidth + 1,
          };
        });

        return {
          activeSurface: document.querySelector('.tzeentch-subtab.is-active')?.dataset.surface || null,
          tabLabels: visibleTabs.map((entry) => entry.label),
          visibleTabs,
          seekHidden: document.querySelector('#tzeentchSeekPanel')?.classList.contains('hidden') || false,
          marketHidden: document.querySelector('#tzeentchMarketPanel')?.classList.contains('hidden') || false,
          cryptoCards: document.querySelectorAll('.tzeentch-panel-crypto .crypto-asset-card').length,
          cryptoText: document.querySelector('.tzeentch-panel-crypto')?.textContent.replace(/\s+/g, ' ').trim() || '',
          errors: window.__bssErrors || [],
        };
      };

      window.addEventListener('load', async () => {
        try {
          await sleep(50);
          sessionStorage.setItem('blue-swallow-society:operator-session', JSON.stringify({
            token: 'browser-token',
            expiresAt: '2099-07-12T20:00:00Z',
            ttlSeconds: 28800,
          }));

          document.body.dataset.mode = 'operator';
          document.querySelector('#terminalScreen')?.classList.remove('active');
          document.querySelector('#terminalScreen')?.setAttribute('aria-hidden', 'true');
          document.querySelector('#mainInterface')?.classList.add('active');
          document.querySelector('#mainInterface')?.removeAttribute('aria-hidden');
          document.querySelector('#tab-tzeentch')?.click();
          await waitFor(() => document.querySelector('#tzeentch-tab')?.classList.contains('active'), 'Tzeentch tab');
          await waitFor(() => (document.querySelector('#tzeentchStatus')?.textContent || '').includes('Public OSINT overview'), 'OSINT overview');
          document.querySelector('#tzeentchSurfaceCrypto')?.click();
          await waitFor(() => document.querySelector('.tzeentch-panel-crypto .crypto-asset-card'), 'Crypto asset card');
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
    if (lines[index].startsWith('{') && lines[index].endsWith('}')) {
      return JSON.parse(lines[index]);
    }
  }
  throw new Error(`No JSON payload found in Obscura output:\n${output}`);
}
