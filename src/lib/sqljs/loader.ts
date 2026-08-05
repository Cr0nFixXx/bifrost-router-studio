/**
 * sql.js (SQLite compiled to WASM) singleton loader.
 *
 * sql.js is a *pure* JS/WASM build of SQLite — no native module, no server, no
 * build toolchain. It runs entirely in the browser, so the entire app can
 * open, edit and export a real Bifrost SQLite file client-side. We locate the
 * .wasm binary is resolved through Vite's asset pipeline (see the `?url` import
 * below) so it is always served as a valid, correctly-hosted asset.
 */
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
// Resolve the wasm binary through Vite's asset pipeline (`?url`) instead of
// guessing a public path. Vite emits/hosts the wasm as a proper asset URL, so
// sql.js always fetches a valid, correctly-served binary (no SPA-fallback HTML,
// no stale public copy, no "failed to match magic number" errors).
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let sqlStatic: SqlJsStatic | null = null;
let initPromise: Promise<SqlJsStatic> | null = null;

export function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlStatic) return Promise.resolve(sqlStatic);
  if (!initPromise) {
    initPromise = initSqlJs({
      locateFile: (file) => (file.endsWith('.wasm') ? wasmUrl : file),
    }).then((SQL) => {
      sqlStatic = SQL;
      return SQL;
    });
  }
  return initPromise;
}

export type { Database };

/** Open an existing database from a byte buffer, or create an empty one. */
export async function openDatabase(buffer?: Uint8Array): Promise<Database> {
  const SQL = await getSqlJs();
  // sql.js takes ownership of the buffer; pass a copy so the caller's ArrayBuffer
  // (e.g. a File) is not detached.
  return buffer ? new SQL.Database(new Uint8Array(buffer)) : new SQL.Database();
}
