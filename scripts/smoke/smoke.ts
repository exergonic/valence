/**
 * The smoke test: use Valence end to end in a real (headless) browser, the way
 * a teacher does in a lesson, and say plainly what broke.
 *
 *   bun run smoke                                       # against `bun run dev`
 *   bun run smoke https://exergonic.github.io/valence/  # against the live site
 *
 * The unit tests hold the chemistry to outside references; this holds the app
 * together. Every bug of the 2026-10-06 session (a triplet refined as a
 * singlet, a leaning HOMO, CH4 for the first atom, a list that scrolled under
 * the pointer) lived in the glue between the pieces, where no unit test looks.
 *
 * Network: the sketched builds ask PubChem first, as the app does. Offline,
 * they fall through to the local pipeline, which is fine — the check is that
 * a structure arrives, not where it came from.
 */
import { launchBrowser, sleep, type Browser } from './browser';

const url = process.argv[2] ?? 'http://localhost:5173/valence/';
const VIEWS = ['vsepr', 'charge', 'localized', 'delocalized'] as const;

interface Result { name: string; ok: boolean; detail: string }
const results: Result[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Wait until the loading overlay is gone (a fetch, an optimisation, the charges). */
async function settle(b: Browser, extra = 500) {
  for (let i = 0; i < 300; i++) {
    const busy = await b.run(`return !document.getElementById('loading-overlay').classList.contains('hidden');`);
    if (!busy) break;
    await sleep(200);
  }
  await sleep(extra);
}

/** Share of the scene's pixels that are not background. The scene is taken as
 *  a screenshot (a WebGL canvas cannot be read back reliably) and decoded in
 *  the page, so this works on the deployed build as well. */
async function sceneCoverage(b: Browser): Promise<number> {
  const clip = await b.run(`const r = document.getElementById('canvas-container').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };`);
  const png = await b.capture(clip);
  return b.run(`
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = ${JSON.stringify(png)}; });
    const copy = document.createElement('canvas');
    copy.width = img.width; copy.height = img.height;
    const g = copy.getContext('2d');
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, copy.width, copy.height);
    const bg = [data[0], data[1], data[2]]; // a corner: the scene's background
    let differ = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 40) differ++;
    }
    return differ / (data.length / 16);
  `);
}

async function pickExample(b: Browser, name: string) {
  await b.run(`const s = document.getElementById('examples-dropdown'); const o = [...s.options].find((o) => o.textContent === ${JSON.stringify(name)}); s.value = o.value; s.dispatchEvent(new Event('change'));`);
  await settle(b, 900);
}

async function view(b: Browser, model: string) {
  await b.run(`document.querySelector('[data-model="${model}"]').click();`);
  await settle(b, 700);
}

/** Sketch a molecule (as SMILES, into JSME) and build it, as the button does. */
async function build(b: Browser, smiles: string) {
  await b.run(`window.jsmeApplet.readGenericMolecularInput(${JSON.stringify(smiles)});`);
  await sleep(300);
  await b.run(`document.getElementById('render-btn').click();`);
  await sleep(800);
  await settle(b, 1000);
}

const banner = (b: Browser) => b.run(`const e = document.getElementById('render-error'); return e && !e.classList.contains('hidden') ? e.textContent.trim() : '';`);

async function examplesInEveryView(b: Browser) {
  await b.open(url);
  const names: string[] = await b.run(`return [...document.getElementById('examples-dropdown').options].slice(1).map((o) => o.textContent);`);
  check('examples are listed', names.length >= 10, `${names.length} examples`);
  for (const name of names) {
    const errorsBefore = b.pageErrors.length;
    await pickExample(b, name);
    const formula: string = await b.run(`return document.getElementById('mol-formula').textContent.trim();`);
    const problems: string[] = [];
    if (!formula) problems.push('no formula in the header');
    for (const model of VIEWS) {
      await view(b, model);
      const coverage = await sceneCoverage(b);
      if (coverage < 0.005) problems.push(`${model}: the scene looks empty (${(coverage * 100).toFixed(2)}% drawn)`);
      if (model === 'localized' || model === 'delocalized') {
        const state = await b.run(`return {
          rows: document.querySelectorAll('button.orb-item').length,
          homo: [...document.querySelectorAll('.orb-tag')].some((t) => t.textContent === 'HOMO'),
          note: document.getElementById('mo-note').textContent,
        };`);
        // an open shell (O₂, the triplet NiCl₄²⁻) has levels but no filling, and
        // no localized orbitals — by design, and the note says why
        const openShell = /not closed|open.shell|open shell|no occupancy/i.test(state.note);
        if (model === 'delocalized' && state.rows === 0) problems.push('delocalized: no orbital levels');
        if (model === 'delocalized' && !state.homo && !openShell) problems.push('delocalized: no HOMO marked');
        if (model === 'localized' && state.rows === 0 && !openShell) problems.push(`localized: no orbitals (${state.note.slice(0, 80)})`);
      }
    }
    const err = await banner(b);
    if (err) problems.push(`error banner: ${err.slice(0, 120)}`);
    const newErrors = b.pageErrors.slice(errorsBefore);
    if (newErrors.length) problems.push(...newErrors.slice(0, 3));
    check(`example ${name}`, problems.length === 0, problems.join('; ') || formula);
  }
}

async function sketchedBuilds(b: Browser) {
  await b.open(url);
  await build(b, 'CC=O');
  let header: string = await b.run(`return document.getElementById('molecule-info').textContent.replace(/\\s+/g, ' ').trim();`);
  let err = await banner(b);
  check('sketch → 3D (fetched or local): acetaldehyde', /C2H4O/.test(header) && !err, err || header.slice(0, 90));

  // the local pipeline, forced: GFN2-xTB in its Web Worker
  await b.run(`const c = document.getElementById('ctrl-force-fallback'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));`);
  await build(b, 'CC(=O)N');
  header = await b.run(`return document.getElementById('molecule-info').textContent.replace(/\\s+/g, ' ').trim();`);
  const source: string = await b.run(`return document.getElementById('mol-source').textContent.trim();`);
  err = await banner(b);
  check('sketch → 3D, local GFN2-xTB: acetamide', source === 'GFN2-xTB' && !err, err || `${source}: ${header.slice(0, 80)}`);
  const coverage = await sceneCoverage(b);
  check('the locally built structure is drawn', coverage > 0.005, `${(coverage * 100).toFixed(1)}% of the scene`);
}

/** The first atom of a session must be the element chosen (reported
 *  2026-10-06: it was CH4 every time), and so must the first after a Clear. */
async function sketcherFirstAtom(b: Browser) {
  await b.open(url);
  const place = async (element: string, fx: number, fy: number) => {
    const btn = await b.run(`const r = document.querySelector('[data-element="${element}"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
    await b.moveTo(btn.x, btn.y);
    await b.click(btn.x, btn.y);
    const area = await b.run(`
      const svgs = [...document.getElementById('jsme-stage').querySelectorAll('svg')];
      const size = (s) => { const r = s.getBoundingClientRect(); return r.width * r.height; };
      const r = svgs.reduce((a, s) => (size(a) >= size(s) ? a : s)).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };`);
    const x = area.x + area.width * fx, y = area.y + area.height * fy;
    await b.moveTo(x, y, btn);
    await b.click(x, y);
    await sleep(1000);
    return b.run(`return window.jsmeApplet.smiles();`);
  };
  check('first atom of a session is the element chosen', (await place('P', 0.2, 0.15)) === 'P', 'P, off-centre click');
  const clear = await b.run(`const r = document.querySelector('[data-tool="clear"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  await b.moveTo(clear.x, clear.y);
  await b.click(clear.x, clear.y);
  await sleep(500);
  check('Clear empties the sketch', (await b.run(`return window.jsmeApplet.smiles();`)) === '');
  check('first atom after Clear is the element chosen', (await place('O', 0.8, 0.85)) === 'O', 'O, far corner');

  // An element from "More…": one pick in the periodic table, then one click
  // on the sketch places it (JSME's X box, borrowed at startup — NOTES.md).
  const centre = (selector: string) => b.run(`const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  const press = async (selector: string) => {
    const p = await centre(selector);
    await b.moveTo(p.x, p.y);
    await b.click(p.x, p.y);
    await sleep(300);
  };
  await press('[data-tool="clear"]');
  await press('#sketch-more');
  await press('#periodic-table [data-symbol="Xe"]');
  const picked = await b.run(`return document.querySelector('#sketch-elements [data-element="Xe"]')?.getAttribute('aria-pressed');`);
  check('a pick from the periodic table is chosen at once', picked === 'true', `Xe button pressed: ${picked}`);
  const area = await b.run(`
    const svgs = [...document.getElementById('jsme-stage').querySelectorAll('svg')];
    const size = (s) => { const r = s.getBoundingClientRect(); return r.width * r.height; };
    const r = svgs.reduce((a, s) => (size(a) >= size(s) ? a : s)).getBoundingClientRect();
    return { x: r.x + r.width * 0.4, y: r.y + r.height * 0.4 };`);
  await b.moveTo(area.x, area.y);
  await b.click(area.x, area.y);
  await sleep(1000);
  const xenon = await b.run(`return window.jsmeApplet.smiles();`);
  check('an element from "More…" is placed by one click', xenon === '[Xe]', xenon || 'nothing placed');
}

/** Clicking an orbital must not scroll the list (reported 2026-10-06). */
async function orbitalListStaysPut(b: Browser) {
  await b.open(url);
  await pickExample(b, 'Benzene (C₆H₆)');
  await view(b, 'delocalized');
  const before = await b.run(`
    const rows = [...document.querySelectorAll('button.orb-item')];
    const list = rows[0].parentElement;
    const box = list.getBoundingClientRect();
    const row = rows.find((r) => { const b = r.getBoundingClientRect(); return b.top > box.top + 2 && b.bottom < box.top + 80; });
    const b = row.getBoundingClientRect();
    return { scroll: list.scrollTop, x: b.x + b.width / 2, y: b.y + b.height / 2, label: row.textContent.trim() };`);
  await b.moveTo(before.x, before.y);
  await b.click(before.x, before.y);
  await settle(b, 800);
  const after = await b.run(`
    const list = document.querySelector('button.orb-item').parentElement;
    return { scroll: list.scrollTop, selected: document.querySelector('button.orb-item.selected')?.textContent.trim() };`);
  check('clicking an MO selects it', after.selected === before.label, after.selected ?? 'nothing selected');
  check('clicking an MO leaves the list where it was', Math.abs(after.scroll - before.scroll) < 1, `scrollTop ${before.scroll} → ${after.scroll}`);
}

// 150 % display scaling, as on most Windows laptops: at 100 % JSME draws the
// first atom where it is clicked, and the CH4 bug of 2026-10-06 did not show.
const b = await launchBrowser(1600, 1000, 1.5);
const started = Date.now();
console.log(`Valence smoke test — ${url}\n`);
try {
  for (const part of [examplesInEveryView, sketchedBuilds, sketcherFirstAtom, orbitalListStaysPut]) {
    try {
      await part(b);
    } catch (error) {
      check(part.name, false, `stopped: ${(error as Error).message.split('\n')[0]}`);
    }
  }
} finally {
  await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (${((Date.now() - started) / 1000).toFixed(0)} s)`);
process.exit(failed.length ? 1 : 0);
