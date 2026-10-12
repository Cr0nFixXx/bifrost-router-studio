/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest config. It mirrors the `@` -> src alias so tests can import the same
// modules the app uses. `bifrostDb.test.ts` boots sql.js (WASM) in the node
// environment to exercise the real SQLite layer. The `extensions/` pattern picks
// up the VSCode extension's pure-logic tests, which import `@/` the same way and
// deliberately avoid the `vscode` module so they need no editor host.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'extensions/*/src/**/*.test.ts'],
  },
});
