import { defineConfig } from 'vite';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { extname, join } from 'path';

function copyDir(src: string, dest: string) {
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
