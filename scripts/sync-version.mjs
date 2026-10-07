import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

// X.Y.Z, or a pre-release X.Y.Z-label.N (1.0.0-beta.1)
const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+)\.(\d+))?$/.exec(version);
if (!match) {
  console.error(`Invalid version format: "${version}" — expected X.Y.Z or X.Y.Z-label.N`);
  process.exit(1);
}

// A version as the files already write it, pre-release included, so a sync
// after a beta still finds the old number.
const ANY = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?`;

// The Windows installer (MSI) takes only numbers, major.minor.patch.build, and
// Tauri refuses a lettered pre-release there. So a pre-release gets its own MSI
// version with the pre-release number as the build: 1.0.0-beta.1 installs as
// 1.0.0.1. A plain release needs none.
const msiVersion = match[4] ? `${match[1]}.${match[2]}.${match[3]}.${match[5]}` : null;

// 1. index.html — brand-version span + cite text
let html = readFileSync(join(root, 'index.html'), 'utf8');
const htmlBefore = html;
html = html.replace(
  new RegExp(`(<span class="brand-version">)v${ANY}(</span>)`),
  `$1v${version}$2`,
);
html = html.replace(
  new RegExp(`(Valence )v${ANY}( —)`),
  `$1v${version}$2`,
);
if (html !== htmlBefore) {
  writeFileSync(join(root, 'index.html'), html, 'utf8');
  console.log('  index.html ✓');
} else {
  console.log('  index.html — no change');
}

// 2. src-tauri/tauri.conf.json — the app version, and the MSI's own
const tauriPath = join(root, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriPath, 'utf8'));
const wix = tauriConf.bundle?.windows?.wix;
if (tauriConf.version !== version || (wix?.version ?? null) !== msiVersion) {
  tauriConf.version = version;
  if (wix) {
    if (msiVersion) wix.version = msiVersion;
    else delete wix.version;
  }
  writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  console.log(`  tauri.conf.json ✓${msiVersion ? ` (MSI ${msiVersion})` : ''}`);
} else {
  console.log('  tauri.conf.json — no change');
}

// 3. src-tauri/Cargo.toml
const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
const cargoBefore = cargo;
cargo = cargo.replace(
  new RegExp(`^version = "${ANY}"`, 'm'),
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
  new RegExp(`(name = "valence"\\r?\\n)version = "${ANY}"`),
  `$1version = "${version}"`,
);
if (lock !== lockBefore) {
  writeFileSync(lockPath, lock, 'utf8');
  console.log('  Cargo.lock ✓');
} else {
  console.log('  Cargo.lock — no change');
}

// 5. README.md — citation line, and the version badge (shields.io writes a
// literal "-" as "--")
const readmePath = join(root, 'README.md');
let readme = readFileSync(readmePath, 'utf8');
const readmeBefore = readme;
readme = readme.replace(
  new RegExp(`(Valence )v${ANY}( —)`, 'g'),
  `$1v${version}$2`,
);
readme = readme.replace(
  /(img\.shields\.io\/badge\/version-).+?(-blue\))/,
  `$1${version.replace(/-/g, '--')}$2`,
);
if (readme !== readmeBefore) {
  writeFileSync(readmePath, readme, 'utf8');
  console.log('  README.md ✓');
} else {
  console.log('  README.md — no change');
}

console.log(`\nAll files synced to v${version}.`);
