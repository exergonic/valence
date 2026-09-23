// Dev-only bench: three 2D sketchers at the app's real panel size, each fed the
// SAME Kekulé benzene and each asked for a molfile back, so the bond orders that
// come out are directly comparable. Vendor assets are gitignored — see
// sketchers.html for the setup. Nothing here ships: Vite's entry is index.html.

// OpenChemLib ships as an ES module (package "type": "module"); its vendored
// bundle is served raw by the playground-vendor plugin in vite.config.ts.
import * as OCL from './vendor/ocl/openchemlib.js';

const BENZENE_KEKULE = `benzene (bench fixture)
  Valence

  6  6  0  0  0  0  0  0  0  0999 V2000
    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.5000    0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5000    0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5000   -0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.5000   -0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0
  2  3  1  0
  3  4  2  0
  4  5  1  0
  5  6  2  0
  6  1  1  0
M  END
`;

type Sketcher = {
  key: string;
  /** Resolves with the editor's API object once it can accept a structure. */
  ready: Promise<any>;
  set: (api: any, mol: string) => Promise<void> | void;
  get: (api: any) => Promise<string>;
};

/** When each editor first became usable (ms since page load). */
const readyAt = new Map<string, number>();

/** Poll until the editor exposes something usable, or give up. */
async function waitFor<T>(key: string, probe: () => T | null | undefined | false, label: string, timeoutMs = 60000): Promise<T> {
  const started = performance.now();
  for (;;) {
    const value = probe();
    if (value) {
      readyAt.set(key, Math.round(performance.now()));
      return value as T;
    }
    if (performance.now() - started > timeoutMs) throw new Error(`${label} never became ready`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const jsme: Sketcher = {
  key: 'jsme',
  ready: waitFor('jsme', () => (window as any).jsmeApplet, 'JSME'),
  set: (applet, mol) => applet.readMolFile(mol),
  get: (applet) => Promise.resolve(applet.molFile() as string),
};

const ketcherFrame = document.getElementById('host-ketcher') as HTMLIFrameElement;
const ketcher: Sketcher = {
  key: 'ketcher',
  // The README's own warning: window.ketcher inside the frame is only assigned
  // after init finishes, so poll for the methods rather than for the object.
  ready: waitFor('ketcher', () => {
    const frameWindow = ketcherFrame.contentWindow as any;
    const api = frameWindow && frameWindow.ketcher;
    return api && typeof api.setMolecule === 'function' ? api : null;
  }, 'Ketcher'),
  set: (api, mol) => api.setMolecule(mol),
  get: (api) => api.getMolfile(),
};

const ocl: Sketcher = {
  key: 'ocl',
  ready: waitFor('ocl', () => {
    // The element in the markup upgrades once the tag is registered.
    if (!customElements.get('openchemlib-editor') && typeof OCL.registerCustomElement === 'function') {
      OCL.registerCustomElement();
    }
    const element = document.querySelector('openchemlib-editor') as any;
    return element && typeof element.setMolecule === 'function' ? element : null;
  }, 'OpenChemLib'),
  set: (element, mol) => element.setMolecule(OCL.Molecule.fromMolfile(mol)),
  get: (element) => Promise.resolve(element.getMolecule().toMolfile()),
};

const SKETCHERS: Sketcher[] = [jsme, ketcher, ocl];
const NEEDLE: Record<string, string> = {
  jsme: 'jsme/',
  ketcher: 'vendor/ketcher/',
  ocl: 'vendor/ocl/',
};
// Measured off the actual build files (gzip -c | wc -c), for reference — the
// numbers the panel reports are raw sizes, because the dev server does not
// compress. Ketcher inlines Indigo's WASM in main.js, which is why it is 28 MB.
const GZIP_NOTE: Record<string, string> = {
  jsme: '~0.3 MB gzipped',
  ketcher: '8.4 MB gzipped',
  ocl: '0.3 MB gzipped',
};

/** Bytes this editor has actually pulled so far. The dev server streams without
 *  Content-Length (bogus transferSize) and an iframe keeps its own timeline, so
 *  prefer encoded/decoded size and walk both timelines. */
function transferred(needle: string, frameWindow?: Window | null) {
  const timelines: Performance[] = [performance];
  if (frameWindow && frameWindow.performance) timelines.push(frameWindow.performance);
  let count = 0;
  let bytes = 0;
  for (const timeline of timelines) {
    for (const entry of timeline.getEntriesByType('resource') as PerformanceResourceTiming[]) {
      if (!entry.name.includes(needle)) continue;
      count += 1;
      bytes += entry.encodedBodySize || entry.decodedBodySize || entry.transferSize || 0;
    }
  }
  return { count, mb: bytes / 1048576 };
}

function bondOrders(mol: string): string[] {
  return mol
    .split('\n')
    .filter((line) => /^\s*\d+\s+\d+\s+\d+\s+\d/.test(line))
    .map((line) => line.trim().split(/\s+/)[2]);
}

const apis = new Map<string, any>();
const stat = (key: string) => document.querySelector(`[data-stat="${key}"]`)!;

async function init() {
  for (const sketcher of SKETCHERS) {
    try {
      const api = await sketcher.ready;
      apis.set(sketcher.key, api);
      await sketcher.set(api, BENZENE_KEKULE);
      const { count, mb } = transferred(NEEDLE[sketcher.key], sketcher.key === 'ketcher' ? ketcherFrame.contentWindow : null);
      stat(sketcher.key).textContent =
        `ready ${readyAt.get(sketcher.key)} ms · ${count} files, ${mb.toFixed(1)} MB raw · ${GZIP_NOTE[sketcher.key]}`;
    } catch (error) {
      stat(sketcher.key).textContent = `failed: ${error}`;
    }
  }
  document.getElementById('bench-status')!.textContent =
    'benzene loaded in all three — export each to compare molfile output';
}

document.getElementById('load')!.addEventListener('click', () => {
  for (const sketcher of SKETCHERS) {
    const api = apis.get(sketcher.key);
    if (api) void sketcher.set(api, BENZENE_KEKULE);
  }
});

for (const button of Array.from(document.querySelectorAll('[data-export]'))) {
  button.addEventListener('click', async () => {
    const key = (button as HTMLElement).dataset.export!;
    const out = document.querySelector(`[data-out="${key}"]`)!;
    const verdict = document.querySelector(`[data-verdict="${key}"]`)!;
    out.classList.add('show');
    const api = apis.get(key);
    if (!api) {
      out.textContent = 'editor not ready';
      return;
    }
    const started = performance.now();
    try {
      const mol = await SKETCHERS.find((sketcher) => sketcher.key === key)!.get(api);
      const ms = Math.round(performance.now() - started);
      const orders = bondOrders(mol);
      const aromatic = orders.filter((order) => order === '4').length;
      verdict.textContent = aromatic
        ? `aromatic type 4 × ${aromatic}`
        : `Kekulé (${Array.from(new Set(orders)).join('/')})`;
      const { count, mb } = transferred(NEEDLE[key], key === 'ketcher' ? ketcherFrame.contentWindow : null);
      out.textContent =
        `${ms} ms · orders ${orders.join(',')} · ${count} files / ${mb.toFixed(1)} MB raw so far\n\n${mol}`;
    } catch (error) {
      out.textContent = `export failed: ${error}`;
    }
  });
}

void init();

// OpenChemLib's editor does not build its canvas in a hidden page — and the
// automation harness always reports visibilityState 'hidden', so its panel comes
// up blank here while its API still round-trips a molfile. Say so in the panel
// rather than leaving something that reads as broken.
setTimeout(() => {
  const element = document.querySelector('openchemlib-editor');
  if (!element || element.querySelector('canvas')) return;
  const note = document.createElement('p');
  note.style.cssText = 'font-size:11px;color:#a1355a;margin:6px 0 0;line-height:1.45;';
  note.textContent =
    document.visibilityState === 'hidden'
      ? 'No canvas initialised: this page reports visibilityState "hidden", and OpenChemLib\'s editor appears to need a visible tab. Open the bench in a normal browser tab to judge this panel — its API works either way (see Export molfile).'
      : 'No canvas initialised, though the API works (see Export molfile). Check the browser console.';
  document.getElementById('host-ocl')!.closest('.panel')!.appendChild(note);
}, 8000);
