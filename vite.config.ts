import { defineConfig } from 'vite';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { extname, join } from 'path';

function copyDir(src: string, dest: string) {
  // A vendored directory may legitimately be absent (e.g. the GFN2 wasm before
  // it has been built and vendored); copying nothing beats crashing the dev server.
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (entry.endsWith('.json')) continue;
    const p = join(src, entry);
    const d = join(dest, entry);
    if (statSync(p).isDirectory()) copyDir(p, d);
    else copyFileSync(p, d);
  }
}

const VENDOR_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? '/' : '/valence/',
  build: { target: 'esnext' },
  server: {
    watch: {
      // The Rust build output is not the app's source, and a `tauri build`
      // holds its files locked: watching them crashed the dev server with
      // EBUSY on target/release/deps/valence.exe (2026-10-07).
      ignored: ['**/src-tauri/target/**'],
    },
  },
  worker: {
    // The worker is created with `{ type: 'module' }`, and the vendored
    // emscripten glue uses top-level await (its Node-detection branches), which
    // the default 'iife' worker format cannot express. ES is both correct here
    // and what the worker is declared as.
    format: 'es',
    rollupOptions: {
      // The glue's Node-only branches are never executed in a browser, but
      // their bare specifiers would otherwise need resolving at build time.
      external: ['node:module', 'node:worker_threads'],
    },
  },
  plugins: [
    {
      name: 'copy-jsme',
      buildStart() { copyDir('node_modules/jsme-editor', 'public/jsme'); },
      writeBundle() { copyDir('public/jsme', 'dist/jsme'); },
    },
    {
      // Dev-only: the sketcher bench's vendored sketchers (playground/vendor/)
      // are classic non-module bundles that Vite's transform pipeline would
      // mangle, and they must never be copied into dist/. Serve them raw in dev.
      name: 'playground-vendor',
      configureServer(server) {
        const root = join(process.cwd(), 'playground/vendor');
        server.middlewares.use('/valence/playground/vendor', (req, res, next) => {
          const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
          const filePath = join(root, urlPath);
          if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
            next();
            return;
          }
          res.setHeader('Content-Type', VENDOR_TYPES[extname(filePath)] ?? 'application/octet-stream');
          createReadStream(filePath).pipe(res);
        });
      },
    },
  ],
});
