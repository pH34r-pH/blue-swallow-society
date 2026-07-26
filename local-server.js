const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 4280;
const APP_DIR = path.join(__dirname, 'app');

function createLocalServer({ appDir = APP_DIR } = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const urlPath = url.pathname;

    if (urlPath.startsWith('/downloads/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    if (urlPath === '/agent' || urlPath === '/agent.html' || urlPath === '/api/agent') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    if (urlPath.startsWith('/api/')) {
      res.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        statusCode: 501,
        error: 'API route not mounted locally',
        route: urlPath,
      }));
      return;
    }

    let filePath;
    if (urlPath === '/') {
      filePath = path.join(appDir, 'index.html');
    } else if (urlPath === '/operator') {
      filePath = path.join(appDir, 'operator', 'index.html');
    } else {
      filePath = path.join(appDir, urlPath);
    }

    const realPath = path.resolve(filePath);
    if (!realPath.startsWith(path.resolve(appDir))) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        filePath = path.join(appDir, 'index.html');
      }

      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.mjs': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.apk': 'application/vnd.android.package-archive',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.ico': 'image/x-icon',
        };

        const contentType = contentTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });
  });
}

function startLocalServer(port = Number(process.env.PORT || DEFAULT_PORT)) {
  const server = createLocalServer();
  server.listen(port, () => {
    const address = server.address();
    console.log(`\n✓ Local dev server running at http://localhost:${address.port}`);
    console.log(`✓ App directory: ${APP_DIR}`);
    console.log('✓ Retired agent routes return 404; unmounted API routes return 501 JSON instead of SPA HTML');
    console.log('\nPress Ctrl+C to stop\n');
  });
  return server;
}

if (require.main === module) {
  startLocalServer();
}

module.exports = { createLocalServer };
