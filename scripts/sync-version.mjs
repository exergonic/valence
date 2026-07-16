import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version format: "${version}" — expected semver`);
  process.exit(1);
}

// 1. index.html — brand-version span + cite text
let html = readFileSync(join(root, 'index.html'), 'utf8');
const htmlBefore = html;
html = html.replace(
  /(<span class="brand-version">)v\d+\.\d+\.\d+(<\/span>)/,
  `$1v${version}$2`,
);
  html = html.replace(
  /(Valence )v\d+\.\d+\.\d+( —)/,
  `$1v${version}$2`,
);
if (html !== htmlBefore) {
  writeFileSync(join(root, 'index.html'), html, 'utf8');
  console.log('  index.html ✓');
} else {
  console.log('  index.html — no change');
}

// 2. src-tauri/tauri.conf.json
const tauriPath = join(root, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriPath, 'utf8'));
if (tauriConf.version !== version) {
  tauriConf.version = version;
  writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  console.log('  tauri.conf.json ✓');
} else {
  console.log('  tauri.conf.json — no change');
}

// 3. src-tauri/Cargo.toml
const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
const cargoBefore = cargo;
cargo = cargo.replace(
  /^version = "\d+\.\d+\.\d+"/m,
  `version = "${version}"`,
);
if (cargo !== cargoBefore) {
  writeFileSync(cargoPath, cargo, 'utf8');
  console.log('  Cargo.toml ✓');
} else {
  console.log('  Cargo.toml — no change');
}

// 4. src-tauri/Cargo.lock
const lockPath = join(root, 'src-tauri', 'Cargo.lock');
let lock = readFileSync(lockPath, 'utf8');
const lockBefore = lock;
lock = lock.replace(
  /(name = "valence"\n)version = "\d+\.\d+\.\d+"/,
  `$1version = "${version}"`,
);
if (lock !== lockBefore) {
  writeFileSync(lockPath, lock, 'utf8');
  console.log('  Cargo.lock ✓');
} else {
  console.log('  Cargo.lock — no change');
}

console.log(`\nAll files synced to v${version}.`);
