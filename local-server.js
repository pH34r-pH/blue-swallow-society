const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4280;
const APP_DIR = path.join(__dirname, 'app');

const server = http.createServer((req, res) => {
  // Remove leading slash and handle /api routes
  let urlPath = req.url.split('?')[0];
  
  if (urlPath.startsWith('/api/')) {
    // For API routes, return a simple echo response for testing
    const apiRoute = urlPath.replace('/api/', '');
    
    if (apiRoute.startsWith('echo')) {
      const msg = new URLSearchParams(req.url.split('?')[1] || '').get('msg') || 'empty';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        status: 200,
        body: `Echo from local server: ${msg}`
      }));
      return;
    }
  }
  
  // Serve static files from app directory
  let filePath = path.join(APP_DIR, urlPath === '/' ? 'index.html' : urlPath);
  
  // Security: prevent directory traversal
  const realPath = path.resolve(filePath);
  if (!realPath.startsWith(path.resolve(APP_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If not found, serve index.html for SPA routing
      filePath = path.join(APP_DIR, 'index.html');
    }
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      
      // Guess content type
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon'
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
  console.log(`\nPress Ctrl+C to stop\n`);
});
