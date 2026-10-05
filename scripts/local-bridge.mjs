#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const root = path.resolve(process.env.BFRS_LOCAL_ROOT ?? process.cwd());
const port = Number(process.env.BFRS_BRIDGE_PORT ?? 8787);
const host = process.env.BFRS_BRIDGE_HOST ?? '127.0.0.1';
const bifrostUrl = (process.env.BFRS_BIFROST_URL ?? 'http://localhost:8080').replace(/\/$/, '');

/**
 * Management token for the live gateway. Deliberately env-only: the browser
 * never sees it, so a compromised page cannot reach the gateway with it.
 * Either a bearer token, or admin user/password which Bifrost also accepts
 * base64-encoded.
 */
function bifrostToken() {
  if (process.env.BFRS_BIFROST_TOKEN) return process.env.BFRS_BIFROST_TOKEN;
  if (process.env.BFRS_BIFROST_USER && process.env.BFRS_BIFROST_PASSWORD) {
    return Buffer.from(`${process.env.BFRS_BIFROST_USER}:${process.env.BFRS_BIFROST_PASSWORD}`).toString('base64');
  }
  return null;
}

/**
 * The only gateway paths this bridge will forward. A generic `/api/*` proxy
 * would let the token in this process reach `/api/config` or `/api/api-keys`,
 * which is far more than rule syncing needs.
 */
const BIFROST_ROUTES = new Set(['/api/version', '/api/health', '/api/routing/rules', '/api/governance/routing-rules']);

function isAllowedBifrostPath(pathname) {
  if (BIFROST_ROUTES.has(pathname)) return true;
  // /api/routing/rules/{id} and /api/governance/routing-rules/{id}
  return /^\/api\/(routing\/rules|governance\/routing-rules)\/[^/]+$/.test(pathname);
}

async function bifrostFetch(pathname, { method = 'GET', body } = {}) {
  const token = bifrostToken();
  if (!token) {
    const err = new Error('BFRS_BIFROST_TOKEN (oder BFRS_BIFROST_USER + BFRS_BIFROST_PASSWORD) ist nicht gesetzt.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${bifrostUrl}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    // `body` arrives as raw request text — forwarding it as-is avoids a double
    // encode that would turn the rule object into a string on the far side.
    body: body || undefined,
  });
  const text = await res.text();
  return { status: res.status, text };
}

/** Probes the gateway so /api/health can explain *why* a connect fails. */
async function bifrostStatus() {
  const status = { url: bifrostUrl, reachable: false, authOk: false };
  if (!bifrostToken()) {
    status.reason = 'Kein Token: BFRS_BIFROST_TOKEN oder BFRS_BIFROST_USER+BFRS_BIFROST_PASSWORD setzen.';
    return status;
  }
  try {
    const res = await bifrostFetch('/api/version');
    if (res.status === 401 || res.status === 403) {
      status.reachable = true;
      status.reason = 'Bifrost lehnt den Token ab (401).';
      return status;
    }
    status.reachable = true;
    status.authOk = res.status < 400;
    if (!status.authOk) status.reason = `GET /api/version → ${res.status}`;
    try { status.version = JSON.parse(res.text).version; } catch { /* no version field */ }
  } catch (err) {
    status.reason = err.status === 503 ? err.message : err.message;
  }
  return status;
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  });
  res.end(body);
}
function safePath(raw) {
  if (!raw) throw new Error('Missing path');
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  const allowAbsolute = process.env.BFRS_ALLOW_ABSOLUTE === '1';
  if (!allowAbsolute && !candidate.startsWith(root + path.sep) && candidate !== root) {
    throw new Error(`Path outside BFRS_LOCAL_ROOT is denied. Set BFRS_ALLOW_ABSOLUTE=1 to allow absolute paths. Root: ${root}`);
  }
  return candidate;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, root, port, host, bifrost: await bifrostStatus() }));
    }
    if (url.pathname === '/api/bifrost/version') {
      const out = await bifrostFetch('/api/version');
      return send(res, out.status, out.text);
    }
    if (url.pathname.startsWith('/api/bifrost/')) {
      const target = url.pathname.slice('/api/bifrost'.length) || '';
      if (!isAllowedBifrostPath(target)) {
        return send(res, 403, JSON.stringify({ error: `Path not allowed by the bridge: ${target}` }));
      }
      let body;
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
      }
      const out = await bifrostFetch(target, { method: req.method, body });
      return send(res, out.status, out.text);
    }
    if (url.pathname === '/api/list') {
      const dir = safePath(url.searchParams.get('path') || '.');
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return send(res, 200, JSON.stringify({ root, path: dir, entries: entries.map((e) => ({ name: e.name, directory: e.isDirectory() })) }));
    }
    if (url.pathname === '/api/open') {
      const file = safePath(url.searchParams.get('path'));
      const stat = await fs.stat(file);
      if (!stat.isFile()) return send(res, 400, JSON.stringify({ error: 'Not a file' }));
      res.writeHead(200, {
        'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        'content-length': stat.size,
        'x-bfrs-filename': encodeURIComponent(path.basename(file)),
        'access-control-allow-origin': '*',
      });
      createReadStream(file).pipe(res);
      return;
    }
    send(res, 404, JSON.stringify({ error: 'Not found', endpoints: ['/api/health', '/api/list?path=.', '/api/open?path=config.sqlite', '/api/bifrost/rules'] }));
  } catch (err) {
    send(res, err.status ?? 500, JSON.stringify({ error: err.message }));
  }
});
server.listen(port, host, () => {
  console.log(`[local-bridge] http://${host}:${port}`);
  console.log(`[local-bridge] root=${root}`);
  console.log(`[local-bridge] bifrost=${bifrostUrl} token=${bifrostToken() ? 'configured' : 'MISSING (set BFRS_BIFROST_TOKEN)'}`);
  console.log('[local-bridge] Set BFRS_ALLOW_ABSOLUTE=1 to allow absolute paths outside root.');
});
