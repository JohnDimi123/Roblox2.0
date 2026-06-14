// Minimal HTTP routing + static file serving on top of node:http.
// Keeps the server free of a web-framework dependency while giving us
// Express-style ergonomics (params, json bodies, auth middleware).

import fs from 'node:fs';
import path from 'node:path';
import { verifyToken } from './auth.js';
import { db } from './db.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm'
};

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const rx = new RegExp(
      '^' +
        pattern.replace(/:[^/]+/g, (m) => {
          keys.push(m.slice(1));
          return '([^/]+)';
        }) +
        '$'
    );
    this.routes.push({ method, rx, keys, handler, auth: opts.auth });
  }

  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  del(p, h, o) { this.add('DELETE', p, h, o); }

  async handle(req, res, urlPath) {
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const m = r.rx.exec(urlPath);
      if (!m) continue;
      req.params = {};
      r.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1])));

      if (r.auth) {
        const user = authUser(req);
        if (!user) return send(res, 401, { error: 'unauthorized' });
        req.user = user;
      }
      try {
        req.body = await readJson(req);
        const result = await r.handler(req, res);
        if (result !== undefined && !res.writableEnded) send(res, 200, result);
      } catch (err) {
        if (!res.writableEnded) {
          const code = err.status || 500;
          send(res, code, { error: err.message || 'server error' });
        }
        if (!err.status) console.error('[api error]', err);
      }
      return true;
    }
    return false;
  }
}

export function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = db('users').get(payload.uid);
  return user || null;
}

export function send(res, code, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*'
  });
  res.end(data);
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function readJson(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'DELETE') return resolve({});
    let raw = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) { req.destroy(); return resolve({}); } // 25MB cap (asset uploads)
      raw += c;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export function serveStatic(rootDir, urlPath, res) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const safe = path
    .normalize(rel)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  const filePath = path.join(rootDir, safe);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback to index.html
      fs.readFile(path.join(rootDir, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}
