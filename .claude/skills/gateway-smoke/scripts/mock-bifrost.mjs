#!/usr/bin/env node
/**
 * Mock Bifrost gateway for smoke-testing the studio's API mode.
 *
 * Implements the management API contract the studio depends on, at BOTH
 * version prefixes:
 *   GET    /api/version
 *   GET    /api/routing/rules                  +  /api/governance/routing-rules
 *   POST   /api/routing/rules                  +  /api/governance/routing-rules
 *   PUT    /api/routing/rules/{id}             +  /api/governance/routing-rules/{id}
 *   DELETE /api/routing/rules/{id}             +  /api/governance/routing-rules/{id}
 *
 * Both prefixes serve the same store, so the version fork is observable without
 * losing state. Note the suffix differs per prefix: the legacy route is
 * `/api/governance/routing-rules`, NOT `/api/governance/rules`.
 *
 * It reproduces the behaviours that actually broke things in practice:
 *   - `PUT` replaces the whole rule (targets included), it does not merge
 *   - the update schema has no `scope` — sending one is rejected
 *   - `(scope, priority)` is UNIQUE — a naive priority swap collides with itself
 *     and fails, so a reordering only survives here if it dodges first
 *
 * Usage:
 *   node .claude/skills/gateway-smoke/scripts/mock-bifrost.mjs [--port 8080] [--token secret]
 *
 * The token defaults to "secret" — this is a test double, not a security boundary.
 */
import http from 'node:http';

const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PORT = Number(argOf('--port', process.env.MOCK_PORT ?? 8080));
const TOKEN = argOf('--token', process.env.MOCK_TOKEN ?? 'secret');

/** id -> rule. Ids are minted server-side, exactly like the real gateway. */
const rules = new Map();
let seq = 0;

const send = (res, status, payload) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectBody);
  });

const weightSumOk = (targets) => Math.abs((targets ?? []).reduce((a, t) => a + Number(t.weight ?? 0), 0) - 1) < 1e-6;

/**
 * The real gateway has UNIQUE (scope, priority): two rules cannot hold the same
 * priority within a scope. The studio side only learned this from a 500 on the
 * first priority swap — without this simulation every reordering looks healthy
 * and the bug stays invisible.
 */
const priorityTaken = (scope, priority, exceptId) =>
  [...rules.values()].some(
    (r) => r.id !== exceptId && r.scope === scope && r.priority === priority,
  );

const priorityConflict = (scope, priority) => ({
  error: {
    message: `Failed to update routing rule in database: routing rule with priority ${priority} already exists for scope '${scope}'`,
  },
});

async function parseJson(req, res) {
  try {
    return JSON.parse(await readBody(req));
  } catch {
    send(res, 400, { error: { message: 'invalid JSON body' } });
    return undefined;
  }
}

/** Collection route: `/api/routing/rules` or `/api/governance/routing-rules`. */
async function handleCollection(req, res) {
  if (req.method === 'GET') return send(res, 200, { rules: [...rules.values()], count: rules.size });
  if (req.method === 'POST') {
    const body = await parseJson(req, res);
    if (!body) return;
    if (!body.name || !body.cel_expression || !body.scope || body.priority == null || !Array.isArray(body.targets)) {
      return send(res, 400, { error: { message: 'missing required field' } });
    }
    if (!weightSumOk(body.targets)) {
      return send(res, 400, { error: { message: 'target weights must sum to 1' } });
    }
    if (priorityTaken(body.scope, body.priority)) {
      return send(res, 500, priorityConflict(body.scope, body.priority));
    }
    seq += 1;
    const rule = { ...body, id: `srv-${seq}` };
    rules.set(rule.id, rule);
    return send(res, 200, { message: 'created', rule });
  }
  return send(res, 405, { error: { message: `method not allowed: ${req.method}` } });
}

/** Item route: `.../rules/{id}` or `.../routing-rules/{id}`. */
async function handleItem(req, res, id) {
  const current = rules.get(id);
  if (req.method === 'PUT') {
    if (!current) return send(res, 404, { error: { message: 'routing rule not found' } });
    const body = await parseJson(req, res);
    if (!body) return;
    if (body.scope || body.scope_id) {
      // The real update schema has neither field; a gateway that accepts one is
      // silently wrong, and this mock keeps the studio honest about it.
      return send(res, 400, { error: { message: 'scope/scope_id cannot be changed via update' } });
    }
    if (body.targets && !weightSumOk(body.targets)) {
      return send(res, 400, { error: { message: 'target weights must sum to 1' } });
    }
    // Only when the body actually carries a priority — the constraint must not
    // fire on updates that leave the priority alone.
    if (body.priority != null && priorityTaken(current.scope, body.priority, id)) {
      return send(res, 500, priorityConflict(current.scope, body.priority));
    }
    // Replaces, not merges. That is the documented behaviour being tested.
    const next = { ...current, ...body };
    rules.set(id, next);
    return send(res, 200, { message: 'updated', rule: next });
  }
  if (req.method === 'DELETE') {
    if (!rules.delete(id)) return send(res, 404, { error: { message: 'routing rule not found' } });
    return send(res, 200, { message: 'deleted' });
  }
  if (req.method === 'GET') {
    if (!current) return send(res, 404, { error: { message: 'routing rule not found' } });
    return send(res, 200, { rule: current });
  }
  return send(res, 405, { error: { message: `method not allowed: ${req.method}` } });
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;

  // Public — the studio probes this before authenticating.
  if (path === '/api/version') return send(res, 200, { version: 'v2.3.1' });

  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return send(res, 401, { error: { message: 'unauthorized', code: 401 } });
  }

  const COLLECTIONS = ['/api/routing/rules', '/api/governance/routing-rules'];
  if (COLLECTIONS.includes(path)) return handleCollection(req, res);

  const item = path.match(/^\/api\/(?:routing\/rules|governance\/routing-rules)\/([^/]+)$/);
  if (item) return handleItem(req, res, decodeURIComponent(item[1]));

  return send(res, 404, { error: { message: `no route ${req.method} ${path}` } });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-bifrost] http://127.0.0.1:${PORT}  token="${TOKEN}"`);
  const stop = () => { server.close(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});