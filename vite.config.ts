import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

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

export default defineConfig({
  base: '/web_vbvis/',
  build: { target: 'esnext' },
  plugins: [
    {
      name: 'copy-jsme',
      buildStart() { copyDir('node_modules/jsme-editor', 'public/jsme'); },
      writeBundle() { copyDir('public/jsme', 'dist/jsme'); },
    },
    {
      name: 'copy-rdkit',
      buildStart() { copyDir('node_modules/@rdkit/rdkit/dist', 'public/rdkit'); },
      writeBundle() { copyDir('public/rdkit', 'dist/rdkit'); },
    },
  ],
});
