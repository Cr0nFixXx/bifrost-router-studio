import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// TLS is opt-in and env-driven so the default setup is unchanged. It matters
// because the management token can be typed into the Connect screen: without
// HTTPS it crosses the LAN in cleartext, readable by anyone on the network.
// Certificates are the operator's, not the repo's — generate them with mkcert
// or openssl and point these two variables at the files.
//
// Note the mixed-content trap: on an https:// page the browser blocks fetch()
// against http://, so a hand-typed `http://localhost:8787` bridge URL fails
// silently. The default `<origin>/bridge` is same-origin and keeps working.
const tlsKey = process.env.BFRS_TLS_KEY;
const tlsCert = process.env.BFRS_TLS_CERT;

// Vite config. This is a 100% client-side app: there is no backend. The
// Bifrost SQLite file is read/written in-browser via sql.js (WASM).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    ...(tlsKey && tlsCert ? { https: { key: readFileSync(tlsKey), cert: readFileSync(tlsCert) } } : {}),
    proxy: {
      // The bridge binds to 127.0.0.1, so a browser on another machine can never
      // reach it directly — `localhost:8787` in their address bar is their own PC.
      // Proxying /bridge through the dev server keeps the bridge loopback-only
      // (its own env token never leaves the host) while giving the browser a
      // same-origin URL it can actually reach. Strip the prefix on the way
      // through: the client appends /api/health, and the bridge serves that path.
      '/bridge': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bridge/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
});
