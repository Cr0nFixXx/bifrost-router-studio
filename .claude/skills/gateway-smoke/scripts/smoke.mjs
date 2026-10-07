#!/usr/bin/env node
/**
 * Smoke test for the studio's API mode.
 *
 * Starts a mock gateway and the local bridge, drives the real client
 * (`src/lib/bifrostApi.ts`, `src/lib/sync.ts`) through the round-trip, and
 * checks the API constraints that are NOT covered by `tsc` or vitest.
 *
 * Those constraints are the reason this script exists. `PUT` replacing the whole
 * target list, `scope` being immutable, a GET shape that no write schema
 * accepts — none of that fails a type check, and none of it shows up in a unit
 * test that mocks the transport. It only shows up against a real round-trip.
 *
 * Usage:
 *   node .claude/skills/gateway-smoke/scripts/smoke.mjs
 *
 * Exit code 0 when all checks pass, 1 otherwise. Processes are always cleaned
 * up, including on Ctrl-C or an unhandled rejection.
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const MOCK = resolve(HERE, 'mock-bifrost.mjs');

// Ports are overridable so parallel runs (eval harnesses) don't collide.
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const PORT = argOf('--port', 8080);
const BRIDGE_PORT = argOf('--bridge-port', 8787);
const TOKEN = 'smoke-secret';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    const detail = fn();
    passed += 1;
    console.log(`  ok   ${name}${detail ? `  (${detail})` : ''}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.log(`  FAIL ${name}  — ${err.message}`);
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => assert(a === b, `${msg} (erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)})`);

/** Poll until the endpoint answers, or give up. */
async function waitFor(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`nicht erreichbar: ${url}`);
}

const children = [];
function start(name, cmd, args, env) {
  const child = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: 'ignore' });
  children.push({ name, child });
  return child;
}

function cleanup() {
  for (const { child } of children) {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}
process.on("exit", () => { cleanup(); vite?.close(); });
process.on('SIGINT', () => { cleanup(); process.exit(130); });
let vite = null;

// --- boot ------------------------------------------------------------------
start('mock', process.execPath, [MOCK, '--port', String(PORT), '--token', TOKEN]);
start('bridge', process.execPath, [resolve(REPO, 'scripts/local-bridge.mjs')], {
  BFRS_BIFROST_URL: `http://127.0.0.1:${PORT}`,
  BFRS_BIFROST_TOKEN: TOKEN,
  BFRS_BRIDGE_PORT: String(BRIDGE_PORT),
});

try {
  await waitFor(`http://127.0.0.1:${BRIDGE_PORT}/api/health`);
} catch (err) {
  console.error(`Bridge/Mock nicht hochgekommen: ${err.message}`);
  cleanup();
  process.exit(1);
}

// Load the real client through vite so the TypeScript sources resolve with their
// `@/` path alias intact. Testing the shipped modules rather than a copy is the
// point — a smoke test against a reimplementation proves nothing.
const { createServer } = await import('vite');
vite = await createServer({ root: REPO, server: { middlewareMode: true }, logLevel: "silent" });
const { BifrostApi, bridgeTransport, directTransport, toWriteShape, apiRuleToRouting } = await vite.ssrLoadModule('/src/lib/bifrostApi.ts');
const { diffRules, applyDiff, diffIsEmpty } = await vite.ssrLoadModule('/src/lib/sync.ts');

const BRIDGE = `http://127.0.0.1:${BRIDGE_PORT}`;
const api = new BifrostApi(bridgeTransport(BRIDGE));

const rule = (patch = {}) => ({
  id: 'r1',
  name: 'Cheap tier',
  enabled: true,
  chain_rule: false,
  cel_expression: 'complexity_tier == "SIMPLE"',
  targets: [{ provider: 'openai', model: 'gpt-4o-mini', weight: 1 }],
  fallbacks: [],
  scope: 'global',
  scope_id: null,
  priority: 10,
  ...patch,
});

const remoteOf = (r) => ({ ...toWriteShape(r), id: r.id, ttft_timeout_ms: 45000 });

console.log('\ngateway-smoke — API-Modus gegen Mock-Gateway\n');

// --- checks ----------------------------------------------------------------
let remote = await api.listRules();

check('Bridge-Connect + listRules liefert ein Array', () => {
  assert(Array.isArray(remote), `kein Array: ${JSON.stringify(remote)}`);
});

const firstDiff = diffRules([rule()], remote);
check('Neue Regel ergibt genau ein POST', () => {
  eq(firstDiff.create.length, 1, 'create-Anzahl');
  eq(firstDiff.update.length, 0, 'update-Anzahl');
});

const createResult = await applyDiff(api, firstDiff, remote);
check('POST angewendet ohne Fehler', () => {
  eq(createResult.created, 1, 'created');
  eq(createResult.failed, 0, 'failed');
});

remote = await api.listRules();
const srvId = remote[0]?.id;
check('Server vergibt eine eigene ID', () => {
  assert(remote.length === 1, `erwartet 1 Regel, war ${remote.length}`);
  assert(srvId && srvId.startsWith('srv-'), `ID unerwartet: ${srvId}`);
});

check('query wird aus dem CEL generiert', () => {
  assert(remote[0].query?.combinator === 'and', `query fehlt: ${JSON.stringify(remote[0].query)}`);
});

const changed = diffRules([rule({ id: srvId, priority: 42 })], remote);
check('Geänderte Regel ergibt genau ein PUT', () => {
  eq(changed.update.length, 1, 'update-Anzahl');
  assert(changed.update[0].write.targets?.length === 1, 'targets nicht vollständig mitgesendet');
});

const updateResult = await applyDiff(api, changed, remote);
remote = await api.listRules();
check('PUT wurde übernommen', () => {
  eq(updateResult.updated, 1, 'updated');
  eq(remote[0].priority, 42, 'priority');
});

check('targets bleiben beim PUT erhalten', () => {
  eq(remote[0].targets.length, 1, 'target-Anzahl');
  eq(remote[0].targets[0].model, 'gpt-4o-mini', 'target model');
});

const unchanged = diffRules([rule({ id: srvId, priority: 42 })], remote);
check('Unveränderte Regel erzeugt keinen Request', () => {
  assert(diffIsEmpty(unchanged), 'Diff ist nicht leer');
  eq(unchanged.unchanged, 1, 'unchanged-Zähler');
});

const serverOnly = diffRules([rule({ id: srvId, priority: 42 })], [{ ...remote[0], ttft_timeout_ms: 30000 }]);
check('Rein serverseitiges Feld erzeugt keinen Push', () => {
  assert(diffIsEmpty(serverOnly), 'ttft_timeout_ms hat einen Push ausgelöst');
});

const scopeMove = diffRules([rule({ id: srvId, priority: 42, scope: 'team', scope_id: 't-9' })], remote);
check('Scope-Wechsel ergibt ein gekoppeltes Move statt PUT', () => {
  eq(scopeMove.update.length, 0, 'update-Anzahl');
  // Nicht zwei lose Einträge: Create und Delete gehören zusammen, damit ein
  // abgelehnter Create die alte Regel nicht mitnimmt.
  eq(scopeMove.moves.length, 1, 'move-Anzahl');
  eq(scopeMove.moves[0].deleteId, srvId, 'deleteId');
  eq(scopeMove.create.length, 0, 'create-Anzahl');
  eq(scopeMove.delete.length, 0, 'delete-Anzahl');
});

await applyDiff(api, scopeMove, remote);
remote = await api.listRules();
check('Scope-Wechsel erzeugt eine neue ID', () => {
  eq(remote.length, 1, 'Regelanzahl');
  eq(remote[0].scope, 'team', 'scope');
  assert(remote[0].id !== srvId, 'ID ist unverändert geblieben');
});

const badWeights = diffRules([rule({ targets: [{ provider: 'openai', weight: 0.5 }] })], remote);
check('Ungültige Gewichte werden abgewiesen statt gepusht', () => {
  eq(badWeights.rejected.length, 1, 'rejected-Anzahl');
  eq(badWeights.create.length, 0, 'create-Anzahl');
  eq(badWeights.update.length, 0, 'update-Anzahl');
});

// Two global rules at priority 0 and 1. The gateway holds UNIQUE (scope,
// priority), so a plain sequential swap collides with itself — this only works
// because applyDiff steps the rules out of the way first.
await api.createRule({ ...toWriteShape(rule()), name: 'swap-a', priority: 0 });
await api.createRule({ ...toWriteShape(rule()), name: 'swap-b', priority: 1 });
remote = await api.listRules();
const swapA = remote.find((r) => r.name === 'swap-a');
const swapB = remote.find((r) => r.name === 'swap-b');
assert(swapA && swapB, `Seed fehlgeschlagen: ${JSON.stringify(remote.map((r) => r.name))}`);

// The canvas still holds every rule — only the two priorities are swapped.
const swapDiff = diffRules(
  remote.map((r) => (r.id === swapA.id ? { ...r, priority: 1 } : r.id === swapB.id ? { ...r, priority: 0 } : r)).map(apiRuleToRouting),
  remote,
);
check('Der Tausch erzeugt genau zwei Updates, keine Löschung', () => {
  eq(swapDiff.update.length, 2, 'update-Anzahl');
  eq(swapDiff.delete.length, 0, 'delete-Anzahl');
  eq(swapDiff.create.length, 0, 'create-Anzahl');
});
const swapResult = await applyDiff(api, swapDiff, remote);
const afterSwap = await api.listRules();
check('Prioritäts-Tausch übersteht UNIQUE (scope, priority)', () => {
  eq(swapResult.failed, 0, `failed (${swapResult.failures.map((f) => f.message).join('; ')})`);
  eq(afterSwap.find((r) => r.id === swapA.id)?.priority, 1, 'priority swap-a');
  eq(afterSwap.find((r) => r.id === swapB.id)?.priority, 0, 'priority swap-b');
});

// Clean up the seed before the delete check below counts the rules.
await api.deleteRule(swapA.id);
await api.deleteRule(swapB.id);
remote = await api.listRules();

const deleteDiff = diffRules([], remote);
const deleteResult = await applyDiff(api, deleteDiff, remote);
remote = await api.listRules();
check('Löschen ergibt DELETE und leert das Gateway', () => {
  eq(deleteResult.deleted, 1, 'deleted');
  eq(remote.length, 0, 'Regelanzahl danach');
});

// A second client pinned to the legacy prefix only, to exercise the fork.
const gov = new BifrostApi({
  url: (p) => `${BRIDGE}/api/bifrost${p}`,
  token: null,
  prefixes: [{ prefix: '/api/governance', rules: '/routing-rules' }],
});

// The version fork: a client that only ever asked `/api/governance/rules`
// would still "pass" a 404-returning mock. Force it to write through the
// legacy prefix, which is the only way to prove the path is right.
const legacyRule = rule({ id: 'legacy', name: 'Legacy rule' });
const legacyCreated = await gov.createRule(toWriteShape(legacyRule));
check('Legacy-Prefix /api/governance/routing-rules funktioniert', () => {
  assert(legacyCreated?.id?.startsWith('srv-'), `keine Server-ID: ${JSON.stringify(legacyCreated)}`);
});

const legacyUpdated = await gov.updateRule(legacyCreated.id, { priority: 7 });
check('Legacy-Prefix Update übernimmt den Wert', () => {
  eq(legacyUpdated?.priority, 7, 'priority');
});
await gov.deleteRule(legacyCreated.id);

const badToken = new BifrostApi(directTransport(`http://127.0.0.1:${PORT}`, 'wrong'));
let authStatus = 0;
try { await badToken.listRules(); } catch (err) { authStatus = err.status ?? 0; }
check('Falscher Token ergibt unterscheidbares 401', () => {
  eq(authStatus, 401, 'status');
});

const deadBridge = new BifrostApi(bridgeTransport('http://127.0.0.1:59999'));
let deadStatus = -1;
try { await deadBridge.listRules(); } catch (err) { deadStatus = err.status ?? -1; }
check('Bridge nicht erreichbar ergibt status 0', () => {
  eq(deadStatus, 0, 'status');
});

const shape = toWriteShape(rule());
check('WriteShape trägt kein id/created_at/updated_at', () => {
  assert(!('id' in shape), 'id ist enthalten');
  assert(!('created_at' in shape), 'created_at ist enthalten');
  assert(!('updated_at' in shape), 'updated_at ist enthalten');
});

const whitelist = await fetch(`${BRIDGE}/api/bifrost/api/config`);
check('Bridge-Whitelist lehnt /api/config mit 403 ab', () => {
  eq(whitelist.status, 403, 'HTTP-Status');
});

// --- Token aus dem Browser --------------------------------------------------
// The bridge used to read its token from the env only and overwrote whatever the
// client sent, so a token typed on the Connect screen was dropped silently. Now a
// client-supplied bearer wins and the env is the fallback. Both halves decide who
// gets to touch the gateway, so both are driven against real bridges here.
const NO_ENV_PORT = BRIDGE_PORT + 1;
const WRONG_ENV_PORT = BRIDGE_PORT + 2;

start('bridge-noenv', process.execPath, [resolve(REPO, 'scripts/local-bridge.mjs')], {
  BFRS_BIFROST_URL: `http://127.0.0.1:${PORT}`,
  // Explicitly blanked, not merely absent: `start` inherits process.env, so a
  // developer who exported a token would otherwise test nothing new.
  BFRS_BIFROST_TOKEN: '',
  BFRS_BIFROST_USER: '',
  BFRS_BIFROST_PASSWORD: '',
  BFRS_BRIDGE_PORT: String(NO_ENV_PORT),
});
start('bridge-wrongenv', process.execPath, [resolve(REPO, 'scripts/local-bridge.mjs')], {
  BFRS_BIFROST_URL: `http://127.0.0.1:${PORT}`,
  BFRS_BIFROST_TOKEN: 'wrong-env-token',
  BFRS_BRIDGE_PORT: String(WRONG_ENV_PORT),
});

const noEnv = `http://127.0.0.1:${NO_ENV_PORT}`;
const wrongEnv = `http://127.0.0.1:${WRONG_ENV_PORT}`;
await waitFor(`${noEnv}/api/health`);
await waitFor(`${wrongEnv}/api/health`);

const healthBare = await (await fetch(`${noEnv}/api/health`)).json();
check('Bridge ohne Token irgendwo meldet "kein Token"', () => {
  eq(healthBare.bifrost.authOk, false, 'authOk');
  assert(/Kein Token/.test(healthBare.bifrost.reason ?? ''), `reason: ${healthBare.bifrost.reason}`);
});

const browserApi = new BifrostApi(bridgeTransport(noEnv, TOKEN));
let browserRead = null;
try { browserRead = await browserApi.listRules(); } catch (err) { browserRead = err.message; }
check('Browser-Token funktioniert ganz ohne Env-Token', () => {
  assert(Array.isArray(browserRead), `listRules: ${browserRead}`);
});

const browserRule = rule({ id: 'browser-token', name: 'Browser token' });
const browserCreated = await browserApi.createRule(toWriteShape(browserRule));
await browserApi.updateRule(browserCreated.id, { priority: 3 });
await browserApi.deleteRule(browserCreated.id);
check('Schreib-Zyklus läuft durch den Browser-Token', () => {
  assert(browserCreated?.id?.startsWith('srv-'), `keine Server-ID: ${JSON.stringify(browserCreated)}`);
});

const overrideApi = new BifrostApi(bridgeTransport(wrongEnv, TOKEN));
let overrideResult = null;
try { overrideResult = await overrideApi.listRules(); } catch (err) { overrideResult = err.message; }
check('Browser-Token schlägt falschen Env-Token', () => {
  assert(Array.isArray(overrideResult), `listRules: ${overrideResult}`);
});

// Not /api/version: the mock serves that one without auth, so it proves nothing
// about the token. The rules collection does enforce it.
const envOnlyApi = new BifrostApi(bridgeTransport(wrongEnv));
let envOnlyStatus = 0;
try { await envOnlyApi.listRules(); } catch (err) { envOnlyStatus = err.status ?? 0; }
check('Falscher Env-Token greift weiter, wenn der Browser keinen sendet', () => {
  eq(envOnlyStatus, 401, 'status');
});

// A malformed header must fall back to the env rather than be relayed. Probed
// against the bridge that has no token at all, so a 503 can only mean the value
// was discarded — a relayed one would have reached the gateway as a bearer.
const malformedRes = await fetch(`${noEnv}/api/bifrost/api/routing/rules`, { headers: { authorization: 'Basic nope' } });
const malformedBody = await malformedRes.text();
check('Header ohne "Bearer" wird verworfen, nicht weitergeleitet', () => {
  eq(malformedRes.status, 503, 'HTTP-Status');
  assert(/nicht gesetzt/.test(malformedBody), `body: ${malformedBody}`);
});

// --- result ----------------------------------------------------------------
const total = passed + failures.length;
console.log(`\n${passed}/${total} bestanden`);
if (failures.length) {
  console.log('\nFehlgeschlagen:');
  for (const f of failures) console.log(`  - ${f}`);
}
cleanup();
process.exit(failures.length ? 1 : 0);