import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);
  for (const entry of entries) {
    if (entry.endsWith('.json')) continue;
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function copyJsme() {
  copyDir('node_modules/jsme-editor', 'public/jsme');
}

export default defineConfig({
  build: {
    target: 'esnext',
  },
  plugins: [
    {
      name: 'copy-jsme-dev',
      buildStart() {
        copyJsme();
      },
    },
    {
      name: 'copy-jsme-build',
      writeBundle() {
        copyDir('public/jsme', 'dist/jsme');
      },
    },
  ],
});
