#!/usr/bin/env node
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const httpProxy = require('http-proxy');

const port = Number(process.env.PORT || 4710);
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://localhost:4720';
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:4711';
const prod = process.env.NODE_ENV === 'production';
const root = path.resolve(__dirname, '..');
const distCandidates = [
  path.join(root, 'frontend', 'dist', 'meet-poc-frontend', 'browser'),
  path.join(root, 'frontend', 'dist', 'meet-poc-frontend'),
];
const distDir = distCandidates.find((candidate) => fs.existsSync(candidate)) || distCandidates[0];
const proxy = httpProxy.createProxyServer({ changeOrigin: true, xfwd: true });

function log(message) {
  console.log(`[serve.js] ${message}`);
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath);
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(content);
  });
}

function isBackendPath(url) {
  return url.startsWith('/api') || url.startsWith('/upload');
}

proxy.on('error', (err, _req, res) => {
  log(`proxy error: ${err.message}`);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'content-type': 'application/json' });
  }
  if (res) res.end(JSON.stringify({ error: 'proxy unavailable' }));
});

const server = http.createServer((req, res) => {
  if (req.headers.upgrade) {
    console.log(`[serve upgrade header] ${req.url} upgrade=${req.headers.upgrade}`);
  }
  const url = req.url || '/';
  if (isBackendPath(url)) {
    proxy.web(req, res, { target: backendOrigin });
    return;
  }
  if (!prod) {
    proxy.web(req, res, { target: frontendOrigin });
    return;
  }

  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname === '/tg' || parsed.pathname === '/tg/') {
    res.writeHead(302, { Location: '/app/rooms' });
    res.end();
    return;
  }
  const requested = path.normalize(parsed.pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(distDir, requested === '/' ? 'index.html' : requested);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }
  sendFile(res, path.join(distDir, 'index.html'));
});

server.on('upgrade', (req, socket, head) => {
  console.log(`[fe-ws-upgrade] url=${req.url}`);
  if (req.url === '/ws') {
    console.log(`[fe-ws-proxy] proxying ws for ${req.url}`);
    proxy.ws(req, socket, head, { target: backendOrigin.replace(/^http/, 'ws') });
    return;
  }
  socket.destroy();
});

server.listen(port, '0.0.0.0', () => {
  log(`listening on http://0.0.0.0:${port}`);
  log(`backend -> ${backendOrigin}`);
  log(prod ? `static -> ${distDir}` : `frontend -> ${frontendOrigin}`);
});
