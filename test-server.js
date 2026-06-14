// Local test server for RoastAudit (runs Vercel Functions locally)
// Usage: node test-server.js

import { createServer } from 'http';
import { parse } from 'url';
import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = 3000;

// Import Vercel Function handlers
const auditHandler = (await import('./api/audit.js')).default;
const checkoutHandler = (await import('./api/checkout.js')).default;
const reportHandler = (await import('./api/report.js')).default;
const reportPdfHandler = (await import('./api/report-pdf.js')).default;

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

// Parse JSON body
async function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = chunks.join('');
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch (e) {
        req.body = {};
      }
      resolve();
    });
    req.on('error', () => resolve());
  });
}

// Just use the native http res directly — Vercel ServerResponse
// has all the methods (setHeader, status, json, end, writeHead) handlers need
// (handlers are written for Vercel which is essentially a ServerResponse wrapper)
function createResAdapter(res) {
  // Wrap res in a Proxy that exposes the missing methods
  return new Proxy(res, {
    get(target, prop) {
      if (prop === 'status') {
        return (code) => {
          target.statusCode = code;
          return createResAdapter(target);
        };
      }
      if (prop === 'json') {
        return (data) => {
          target.setHeader('Content-Type', 'application/json');
          target.end(JSON.stringify(data));
        };
      }
      // Fall through to native res (has on, once, write, end, setHeader, etc.)
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    },
  });
}

const server = createServer(async (req, res) => {
  const parsedUrl = parse(req.url, true);
  const { pathname } = parsedUrl;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Route to Vercel Function handlers
  try {
    if (pathname === '/api/audit' && req.method === 'POST') {
      await parseBody(req);
      await auditHandler(req, createResAdapter(res));
      return;
    }

    if (pathname === '/api/checkout' && req.method === 'POST') {
      await parseBody(req);
      await checkoutHandler(req, createResAdapter(res));
      return;
    }

    if (pathname === '/api/report' && req.method === 'GET') {
      req.query = parsedUrl.query;
      await reportHandler(req, createResAdapter(res));
      return;
    }

    if (pathname === '/api/report-pdf' && req.method === 'GET') {
      req.query = parsedUrl.query;
      await reportPdfHandler(req, createResAdapter(res));
      return;
    }
  } catch (e) {
    console.error('Handler error:', e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error: ' + e.message);
    }
    return;
  }

  // Serve static files
  let filePath = join(__dirname, pathname === '/' ? 'index.html' : pathname);
  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Local test server running at http://localhost:${PORT}`);
  console.log(`  Routes:`);
  console.log(`  POST /api/audit`);
  console.log(`  POST /api/checkout`);
  console.log(`  GET  /api/report`);
  console.log(`  GET  /api/report-pdf`);
});
