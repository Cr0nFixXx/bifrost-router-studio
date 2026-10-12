/**
 * Opening a rule database for the tree, read-only.
 *
 * One thing here is not obvious and is the reason this module exists rather than
 * calling `BifrostDb.open` directly: `migrate()` CREATEs the Studio schema when
 * `routing_rules` is missing (bifrostDb.ts:223-227). On a file that is not a
 * Bifrost DB at all, that would write tables into the user's file and then report
 * a healthy, empty database — the same "empty table that looks like an empty
 * database" failure CLAUDE.md records for the SQL browser. So we open the raw
 * sql.js handle, run `detectKind()` on the untouched file, and only then hand it
 * to `BifrostDb.wrap`, which is the loader-free entry point.
 *
 * Nothing in here writes. The tree is a reader; the browser app owns the file.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { BifrostDb } from '@/lib/db/bifrostDb';
import type { RoutingRule } from '@/types/bifrost';

/**
 * Resolved by the esbuild `asset-url` plugin to a path next to the bundle.
 * Typed as a string by `vite/client`, which is in this tsconfig's `types`.
 */
import wasmPath from 'sql.js/dist/sql-wasm.wasm?url';

let sqlStatic: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlStatic) {
    sqlStatic = await initSqlJs({ locateFile: () => wasmPath });
  }
  return sqlStatic;
}

export interface LoadedRules {
  rules: RoutingRule[];
  kind: 'bifrost-routing' | 'empty' | 'unknown';
}

/**
 * Read the rules out of a .db file. Returns the detected kind alongside, so the
 * caller can tell "no rules" from "not a Bifrost database" — those look the same
 * in a tree and mean very different things.
 */
export async function loadRules(file: string): Promise<LoadedRules> {
  const bytes = await fs.readFile(file);
  const SQL = await getSqlJs();

  let raw: Database | null = null;
  let db: BifrostDb | null = null;
  try {
    raw = new SQL.Database(new Uint8Array(bytes));

    // Judge the file before `wrap` runs migrate() and changes the answer.
    const tables = raw
      .exec("SELECT name FROM sqlite_master WHERE type='table'")
      .flatMap((r) => r.values.map((v) => String(v[0])));
    const kind = detectKind(tables);
    if (kind !== 'bifrost-routing') return { rules: [], kind };

    db = BifrostDb.wrap(raw);
    return { rules: db.listRules(), kind };
  } finally {
    // `wrap` took ownership; closing the BifrostDb closes the same handle.
    if (db) db.close();
    else raw?.close();
  }
}

/**
 * Mirrors `BifrostDb.detectKind()` (bifrostDb.ts:241) but reads a table list we
 * captured pre-migration. Same table names, deliberately — if that list changes
 * there, it has to change here.
 */
function detectKind(tables: string[]): LoadedRules['kind'] {
  if (
    tables.includes('routing_rules') ||
    tables.includes('routing_targets') ||
    tables.includes('providers') ||
    tables.includes('config_providers')
  ) return 'bifrost-routing';
  return tables.length === 0 ? 'empty' : 'unknown';
}

/** Candidate database files in the workspace, for the open QuickPick. */
export function isDatabaseFile(file: string): boolean {
  return ['.db', '.sqlite', '.sqlite3'].includes(path.extname(file).toLowerCase());
}
