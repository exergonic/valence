import { defineConfig } from 'vite';
import { readFileSync, copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';

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

// Copy JSME and RDKit so they're available in dist builds
copyDir('node_modules/jsme-editor', 'public/jsme');
copyDir('node_modules/@rdkit/rdkit/dist', 'public/rdkit');

const RDKIT_DIR = resolve('node_modules/@rdkit/rdkit/dist');

export default defineConfig({
  base: '/web_vbvis/',
  build: { target: 'esnext' },
  plugins: [
    {
      name: 'copy-assets',
      writeBundle() {
        copyDir('public/jsme', 'dist/jsme');
        copyDir('public/rdkit', 'dist/rdkit');
      },
    },
    {
      name: 'serve-rdkit',
      configureServer(server) {
        server.middlewares.use('/rdkit', (req, res, next) => {
          const file = req.url?.split('?')[0] || '';
          const fullPath = join(RDKIT_DIR, file);
          if (existsSync(fullPath)) {
            const ext = file.split('.').pop();
            const mime: Record<string, string> = {
              js: 'application/javascript',
              wasm: 'application/wasm',
              html: 'text/html',
              css: 'text/css',
              png: 'image/png',
            };
            res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
            res.end(readFileSync(fullPath));
          } else {
            next();
          }
        });
      },
    },
  ],
});
