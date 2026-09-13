#!/usr/bin/env node
/**
 * Small read-only static server for repository development tools.
 *
 *   node tools/serve-static.js [port] [root] [default-file]
 *
 * With no arguments it serves the repository root on port 8123 and opens the
 * branding exporter. A different root/default file can be supplied for any
 * other local static preview without adding another server script.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const REPOSITORY = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || process.argv[2] || 8123);
const ROOT = path.resolve(process.argv[3] || REPOSITORY);
const DEFAULT_FILE = process.argv[4] || 'tools/export-branding.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Invalid port: ${process.env.PORT || process.argv[2]}`);
  process.exit(1);
}
if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
  console.error(`Static root is not a directory: ${ROOT}`);
  process.exit(1);
}

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  const relative = pathname.replace(/^\/+/, '') || DEFAULT_FILE;
  const target = path.resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Static files: http://127.0.0.1:${PORT}/`);
  console.log(`Root: ${ROOT}`);
  console.log('Ctrl+C to stop.');
});
