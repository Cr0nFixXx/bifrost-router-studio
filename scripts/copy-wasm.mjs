/**
 * Copies the sql.js WASM binary from node_modules into /public so Vite serves
 * it at /sql-wasm.wasm (browser fetch needs a stable URL). Runs before dev/build.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/sql.js/dist/sql-wasm.wasm');
const destDir = resolve(root, 'public');
const dest = resolve(destDir, 'sql-wasm.wasm');

if (!existsSync(src)) {
  console.warn('[copy-wasm] sql.js WASM not found at', src);
  process.exit(0);
}
if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[copy-wasm] sql-wasm.wasm -> public/sql-wasm.wasm');
