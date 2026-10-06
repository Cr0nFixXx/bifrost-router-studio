#!/usr/bin/env node
/**
 * Set the build number in BOTH places the project keeps it, then verify.
 *
 * Why this exists: the build number lives in `src/lib/version.ts` and in the
 * top-level `"build"` field of `package.json`. Updating one and forgetting the
 * other produces no error — it just silently leaves the project claiming an old
 * build. That happened twice before this script existed.
 *
 * The APP version is deliberately NOT touched. The project's versioning contract
 * (CLAUDE.md → "Versioning contract") says it may only change when explicitly
 * asked for. Pass `--version X.Y.Z` to change it; without that flag, this script
 * only moves the build number.
 *
 * Usage:
 *   node .claude/skills/release-bump/scripts/bump.mjs
 *   node .claude/skills/release-bump/scripts/bump.mjs --version 0.3.0
 *   node .claude/skills/release-bump/scripts/bump.mjs --check
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const VERSION_TS = resolve(REPO, 'src/lib/version.ts');
const PACKAGE_JSON = resolve(REPO, 'package.json');

const fail = (msg) => {
  console.error(`FEHLER: ${msg}`);
  process.exit(1);
};

/** YYMMDDHH in Europe/Berlin — the format CLAUDE.md's versioning contract mandates. */
function berlinStamp() {
  return execSync('TZ=Europe/Berlin date +%y%m%d%H', { encoding: 'utf8' }).trim();
}

function readCurrent() {
  const ts = readFileSync(VERSION_TS, 'utf8');
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const v = ts.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
  const b = ts.match(/APP_BUILD\s*=\s*'([^']+)'/)?.[1];
  if (!v || !b) fail(`Konnte APP_VERSION/APP_BUILD nicht aus ${VERSION_TS} lesen`);
  return { tsVersion: v, tsBuild: b, pkgVersion: pkg.version, pkgBuild: pkg.build };
}

function report(label, c) {
  const agree = c.tsBuild === c.pkgBuild && c.tsVersion === c.pkgVersion;
  console.log(`${label}:`);
  console.log(`  version.ts : ${c.tsVersion} (${c.tsBuild})`);
  console.log(`  package.json: ${c.pkgVersion} (${c.pkgBuild ?? 'FEHLT'})`);
  console.log(`  ${agree ? 'OK — beide Stellen stimmen überein' : 'ABWEICHUNG'}`);
  return agree;
}

const args = process.argv.slice(2);

if (args.includes('--check')) {
  const c = readCurrent();
  process.exit(report('Ist-Stand', c) ? 0 : 1);
}

const newBuild = berlinStamp();
const current = readCurrent();
const verIdx = args.indexOf('--version');
const newVersion = verIdx >= 0 ? args[verIdx + 1] : null;

if (verIdx >= 0 && !newVersion) fail('--version braucht ein Argument, z.B. --version 0.3.0');

// version.ts
let ts = readFileSync(VERSION_TS, 'utf8');
ts = ts.replace(/APP_BUILD\s*=\s*'[^']+'/, `APP_BUILD = '${newBuild}'`);
if (newVersion) ts = ts.replace(/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION = '${newVersion}'`);
writeFileSync(VERSION_TS, ts);

// package.json — parse, mutate, serialize. A regex on the raw text would match
// `scripts.build` (the npm script) before the top-level `build` field and
// silently overwrite the Vite invocation. Found by the eval run.
const pkgRaw = readFileSync(PACKAGE_JSON, 'utf8');
const pkg = JSON.parse(pkgRaw);
pkg.build = newBuild;
if (newVersion) pkg.version = newVersion;
writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');

// Re-read from disk. Reading the file you just wrote and comparing is the whole
// point: it catches a failed write, a typo in the pattern, and a partial edit in
// one step.
const after = readCurrent();
const ok = report('Nach dem Bump', after);

console.log(`\nBuild: ${current.tsBuild} -> ${after.tsBuild}`);
if (newVersion) console.log(`Version: ${current.tsVersion} -> ${after.tsVersion}`);
else console.log(`Version unverändert: ${after.tsVersion} (nur auf Anfrage ändern)`);

if (!ok) {
  fail('Die beiden Stellen stimmen nicht überein — git diff prüfen.');
}
console.log('\nNächste Schritte (siehe references/checklist.md): CHANGELOG, PROGRESS, ggf. CLAUDE.md.');