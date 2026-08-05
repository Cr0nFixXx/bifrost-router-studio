#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const root = path.resolve(process.env.BFRS_LOCAL_ROOT ?? process.cwd());
const port = Number(process.env.BFRS_BRIDGE_PORT ?? 8787);
const host = process.env.BFRS_BRIDGE_HOST ?? '127.0.0.1';

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
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
    if (url.pathname === '/api/health') return send(res, 200, JSON.stringify({ ok: true, root, port, host }));
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
    send(res, 404, JSON.stringify({ error: 'Not found', endpoints: ['/api/health', '/api/list?path=.', '/api/open?path=config.sqlite'] }));
  } catch (err) {
    send(res, 500, JSON.stringify({ error: err.message }));
  }
});
server.listen(port, host, () => {
  console.log(`[local-bridge] http://${host}:${port}`);
  console.log(`[local-bridge] root=${root}`);
  console.log('[local-bridge] Set BFRS_ALLOW_ABSOLUTE=1 to allow absolute paths outside root.');
});
