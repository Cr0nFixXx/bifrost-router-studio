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
 * Management token for the live gateway. Either a bearer token, or admin
 * user/password which Bifrost also accepts base64-encoded.
 *
 * A token sent by the browser wins over the environment: the Connect screen has
 * a field for it, and a field that is silently ignored whenever the env var is
 * set is worse than no field. The env stays as the fallback, so a bridge started
 * without one still works. The browser never holds the env token — it only ever
 * knows what the user typed.
 */
function bifrostToken(requestToken) {
  if (requestToken) return requestToken;
  if (process.env.BFRS_BIFROST_TOKEN) return process.env.BFRS_BIFROST_TOKEN;
  if (process.env.BFRS_BIFROST_USER && process.env.BFRS_BIFROST_PASSWORD) {
    return Buffer.from(`${process.env.BFRS_BIFROST_USER}:${process.env.BFRS_BIFROST_PASSWORD}`).toString('base64');
  }
  return null;
}

/**
 * Reads the bearer credential off an incoming request. This is a trust boundary
 * now that the browser supplies the token: anything that is not a single
 * well-formed bearer value is ignored rather than forwarded, and the length cap
 * keeps a hostile header from being relayed to the gateway.
 *
 * Returns the credential alone, without the `Bearer ` prefix — `bifrostFetch`
 * adds that back, and passing the whole header through would send
 * `Bearer Bearer …`.
 */
function requestToken(req) {
  const raw = req.headers.authorization;
  if (typeof raw !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  if (!match || match[1].length > 4096) return null;
  return match[1];
}

/**
 * The only gateway paths this bridge will forward. A generic `/api/*` proxy
 * would let the token in this process reach `/api/config` or `/api/api-keys`,
 * which is far more than rule syncing needs.
 *
 * `/api/models`, `/api/providers` and `/api/providers/{p}/keys` are the one
 * deliberate addition: the studio needs the gateway's real provider and model
 * names for its target/fallback dropdowns, and a 12-entry built-in list is not
 * a substitute. All three are read-only and return names, key ids and redacted
 * values — no secret material, which is what keeps them out of the "far more
 * than we need" bucket with `/api/config`.
 */
const BIFROST_ROUTES = new Set([
  '/api/version',
  '/api/health',
  '/api/routing/rules',
  '/api/governance/routing-rules',
  '/api/models',
  '/api/providers',
]);

function isAllowedBifrostPath(pathname) {
  if (BIFROST_ROUTES.has(pathname)) return true;
  // /api/routing/rules/{id} and /api/governance/routing-rules/{id}
  if (/^\/api\/(routing\/rules|governance\/routing-rules)\/[^/]+$/.test(pathname)) return true;
  // /api/providers/{provider} and /api/providers/{provider}/keys
  return /^\/api\/providers\/[^/]+(\/keys)?$/.test(pathname);
}

async function bifrostFetch(pathname, { method = 'GET', body, token } = {}) {
  // Named `token`, not destructured as `requestToken`: that would shadow the
  // function of the same name for the whole signature.
  const auth = bifrostToken(token);
  if (!auth) {
    const err = new Error('BFRS_BIFROST_TOKEN (oder BFRS_BIFROST_USER + BFRS_BIFROST_PASSWORD) ist nicht gesetzt.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${bifrostUrl}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${auth}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    // `body` arrives as raw request text — forwarding it as-is avoids a double
    // encode that would turn the rule object into a string on the far side.
    body: body || undefined,
  });
  const text = await res.text();
  return { status: res.status, text };
}

/** Probes the gateway so /api/health can explain *why* a connect fails.
 *  Needs the caller's token: with the token living in the browser, the env is
 *  empty and a probe without it would always report "abgelehnt". */
async function bifrostStatus(token) {
  const status = { url: bifrostUrl, reachable: false, authOk: false };
  if (!bifrostToken(token)) {
    status.reason = 'Kein Token: im Connect-Screen eingeben oder BFRS_BIFROST_TOKEN bzw. BFRS_BIFROST_USER+BFRS_BIFROST_PASSWORD setzen.';
    return status;
  }
  try {
    const res = await bifrostFetch('/api/version', { token });
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
    // Read once per request: the token may come from the browser, and every
    // gateway call below has to see the same one.
    const token = requestToken(req);
    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, root, port, host, bifrost: await bifrostStatus(token) }));
    }
    if (url.pathname === '/api/bifrost/version') {
      const out = await bifrostFetch('/api/version', { token });
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
      // The query string travels too. Dropping it made every paged call answer
      // with page one, which `/api/models?limit=…&offset=…` turned into an
      // endlessly repeated first page rather than an error.
      const out = await bifrostFetch(target + (url.search || ''), { method: req.method, body, token });
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
  console.log(`[local-bridge] bifrost=${bifrostUrl} token=${bifrostToken() ? 'configured (env)' : 'not in env — clients must send one per request'}`);
  console.log('[local-bridge] Set BFRS_ALLOW_ABSOLUTE=1 to allow absolute paths outside root.');
});
