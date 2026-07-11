const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4280;
const APP_DIR = path.join(__dirname, 'app');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const urlPath = url.pathname;

  if (urlPath.startsWith('/downloads/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  if (urlPath.startsWith('/api/')) {
    if (urlPath === '/api/echo') {
      const msg = url.searchParams.get('msg') || 'empty';
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        status: 200,
        body: `Echo from local server: ${msg}`,
      }));
      return;
    }

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
    filePath = path.join(APP_DIR, 'index.html');
  } else if (urlPath === '/operator') {
    filePath = path.join(APP_DIR, 'operator', 'index.html');
  } else if (urlPath === '/agent' || urlPath === '/agent.html') {
    filePath = path.join(APP_DIR, 'operator', 'agent.html');
  } else {
    filePath = path.join(APP_DIR, urlPath);
  }

  const realPath = path.resolve(filePath);
  if (!realPath.startsWith(path.resolve(APP_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(APP_DIR, 'index.html');
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

server.listen(PORT, () => {
  console.log(`\n✓ Local dev server running at http://localhost:${PORT}`);
  console.log(`✓ App directory: ${APP_DIR}`);
  console.log(`✓ API echo endpoint available at http://localhost:${PORT}/api/echo?msg=test`);
  console.log('✓ Unmounted API routes return 501 JSON instead of SPA HTML');
  console.log('\nPress Ctrl+C to stop\n');
});
