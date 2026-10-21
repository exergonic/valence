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

/** Both orbital lists are GFN2's by default, and wait on its single point. */
async function orbitalsReady(b: Browser) {
  for (let waited = 0; waited < 15_000; waited += 250) {
    const note: string = await b.run(`return document.getElementById('mo-note').textContent;`);
    if (!/^Computing/.test(note)) return;
    await sleep(250);
  }
}

async function view(b: Browser, model: string) {
  await b.run(`document.querySelector('[data-model="${model}"]').click();`);
  await settle(b, 700);
}

/** Sketch a molecule (as SMILES, into JSME) and build it, as the button does. */
async function build(b: Browser, smiles: string) {
  await b.run(`window.jsmeApplet.readGenericMolecularInput(${JSON.stringify(smiles)});`);
  // JSME takes the input in its own time; Build on a sketch it has not read yet builds nothing
  for (let waited = 0; waited < 10_000; waited += 100) {
    if (await b.run(`return !!window.jsmeApplet.smiles();`)) break;
    await sleep(100);
  }
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
        await orbitalsReady(b);
        const state = await b.run(`return {
          rows: document.querySelectorAll('button.orb-item').length,
          homo: [...document.querySelectorAll('.orb-tag')].some((t) => t.textContent === 'HOMO'),
          note: document.getElementById('mo-note').textContent,
        };`);
        // an open shell (O₂, the triplet NiCl₄²⁻) can have levels but no
        // settled filling, and then no localized orbitals — by design, and the
        // note says why
        const openShell = /not closed|open.shell|open shell|no occupancy|partly filled/i.test(state.note);
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

/** Building by dragging toolbar buttons onto the sketch (asked for 2026-10-14,
 *  after a student reached for it): C → CH4, a single bond onto it → ethane,
 *  Cl onto the new carbon → methyl chloride; a drop beside the molecule adds
 *  nothing. */
async function sketcherDragAndDrop(b: Browser) {
  await b.open(url);
  const centre = (selector: string) => b.run(`const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  const smiles = async () => { await sleep(800); return b.run(`return window.jsmeApplet.smiles();`); };
  // Where each atom is drawn: the centre of its label's first letter, or the
  // far end of a bond for a label-less carbon.
  const atoms = () => b.run(`
    const svgs = [...document.getElementById('jsme-stage').querySelectorAll('svg')];
    const size = (s) => { const r = s.getBoundingClientRect(); return r.width * r.height; };
    const drawing = svgs.reduce((a, s) => (size(a) >= size(s) ? a : s));
    const labels = [...drawing.querySelectorAll('text')].filter((t) => t.getNumberOfChars() > 0 && /^[A-Z]/.test(t.textContent)).map((t) => {
      const l = t.getExtentOfChar(0);
      const p = new DOMPoint(l.x + l.width / 2, l.y + l.height / 2).matrixTransform(t.getScreenCTM());
      return { x: p.x, y: p.y };
    });
    const ends = [...drawing.querySelectorAll('line')].flatMap((l) => {
      const m = l.getScreenCTM();
      return [[l.x1, l.y1], [l.x2, l.y2]].map(([x, y]) => { const p = new DOMPoint(x.baseVal.value, y.baseVal.value).matrixTransform(m); return { x: p.x, y: p.y }; });
    });
    const r = drawing.getBoundingClientRect();
    return { labels, ends, area: { x: r.x, y: r.y, width: r.width, height: r.height } };`);

  const first = await atoms();
  await b.drag(await centre('[data-element="C"]'), { x: first.area.x + first.area.width * 0.4, y: first.area.y + first.area.height * 0.4 });
  check('drag C onto the empty sketch → methane', (await smiles()) === 'C');

  const methane = (await atoms()).labels[0];
  await b.drag(await centre('[data-tool="single"]'), methane);
  check('drag a single bond onto CH4 → ethane', (await smiles()) === 'CC');

  const ethane = await atoms();
  const far = ethane.ends.reduce((a, e) => (Math.hypot(e.x - methane.x, e.y - methane.y) > Math.hypot(a.x - methane.x, a.y - methane.y) ? e : a));
  await b.drag(await centre('[data-element="Cl"]'), far);
  check('drag Cl onto a carbon of ethane → methyl chloride', (await smiles()) === 'CCl');

  await b.drag(await centre('[data-element="O"]'), { x: ethane.area.x + ethane.area.width * 0.85, y: ethane.area.y + ethane.area.height * 0.85 });
  const beside = await smiles();
  const chips = await b.run(`return document.querySelectorAll('.sketch-drag-chip').length;`);
  check('a drop beside the molecule adds nothing, and the chip goes home', beside === 'CCl' && chips === 0, `${beside}, ${chips} chip(s) left`);
}

/** Move and Clean (asked for 2026-10-20): the move tool drags one atom and
 *  leaves the molecule what it was; Clean lays it out afresh, still the same
 *  molecule; Undo puts the dragged drawing back. */
async function sketcherMoveAndClean(b: Browser) {
  await b.open(url);
  await b.run(`window.jsmeApplet.readGenericMolecularInput('CC(=O)Nc1ccccc1');`);
  await sleep(400);
  const button = (tool: string) => b.run(`const r = document.querySelector('#sketch-tools [data-tool="${tool}"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  const press = async (tool: string) => {
    const p = await button(tool);
    await b.moveTo(p.x, p.y);
    await b.click(p.x, p.y);
    await sleep(300);
  };
  // the shape of the drawing: every atom's offset from the first, scale-free
  const shape = `const l = window.jsmeApplet.molFile().split('\\n'); const n = parseInt(l[3].slice(0, 3));
    const p = l.slice(4, 4 + n).map((s) => [parseFloat(s.slice(0, 10)), parseFloat(s.slice(10, 20))]);
    const d = p.map((q) => Math.hypot(q[0] - p[0][0], q[1] - p[0][1])); const max = Math.max(...d);
    return d.map((x) => (x / max).toFixed(3)).join(',');`;
  const before = await b.run(shape);
  await press('move');
  const oxygen = await b.run(`
    const svg = [...document.querySelectorAll('#jsme-stage svg')].find((s) => s.getBoundingClientRect().height > 150);
    const r = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'O').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  // JSME ignores the first press on its drawing after the page loads (the
  // first-atom trap of 2026-10-06 again): a first drag did nothing, every one
  // after moved. One press on empty space first — with the move tool it does
  // nothing. Then the atom under JSME's hover box before the press.
  const corner = await b.run(`
    const r = [...document.querySelectorAll('#jsme-stage svg')].find((s) => s.getBoundingClientRect().height > 150).getBoundingClientRect();
    return { x: r.x + 20, y: r.y + r.height - 20 };`);
  await b.moveTo(corner.x, corner.y);
  await b.click(corner.x, corner.y);
  await sleep(200);
  await b.moveTo(oxygen.x, oxygen.y);
  await sleep(300);
  await b.drag(oxygen, { x: oxygen.x + 60, y: oxygen.y + 50 });
  await sleep(300);
  const moved = await b.run(shape);
  const smilesMoved: string = await b.run(`return window.jsmeApplet.smiles();`);
  check('the move tool drags one atom and keeps the molecule', moved !== before && smilesMoved === 'CC(=O)Nc1ccccc1', smilesMoved);
  await press('clean');
  const cleaned = await b.run(shape);
  const smilesCleaned: string = await b.run(`return window.jsmeApplet.smiles();`);
  check('Clean lays it out afresh, the same molecule', cleaned !== moved && smilesCleaned === 'CC(=O)Nc1ccccc1', smilesCleaned);
  await press('undo');
  const undone = await b.run(shape);
  check('Undo after a Clean puts the dragged drawing back', undone === moved, undone === moved ? 'restored' : 'not restored');
}

/** The functional groups (asked for 2026-10-20): pick COOH from "Groups…",
 *  click methanol's O, and the group is bonded to it. */
async function sketcherFunctionalGroup(b: Browser) {
  await b.open(url);
  await b.run(`window.jsmeApplet.readGenericMolecularInput('CO');`);
  await sleep(400);
  const centre = (selector: string) => b.run(`const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  const press = async (selector: string) => {
    const p = await centre(selector);
    await b.moveTo(p.x, p.y);
    await b.click(p.x, p.y);
    await sleep(300);
  };
  // the first press on JSME's drawing after a load is ignored: spend it on empty space
  const corner = await b.run(`
    const r = [...document.querySelectorAll('#jsme-stage svg')].find((s) => s.getBoundingClientRect().height > 150).getBoundingClientRect();
    return { x: r.x + 20, y: r.y + r.height - 20 };`);
  await b.moveTo(corner.x, corner.y);
  await b.click(corner.x, corner.y);
  await press('#sketch-groups');
  await press('#group-palette .fg-cell[data-code="235"]');
  // The O is the last glyph of JSME's "HO" label. JSME redraws a molecule it
  // has read only on a later pointer event, so the label can still sit where
  // the last drawing put it (measured 16 px off): click, read the label again,
  // and click again until the group is on — at most three tries.
  let smiles = 'CO';
  for (let tries = 0; tries < 3 && smiles === 'CO'; tries++) {
    const oxygen = await b.run(`
      const svg = [...document.querySelectorAll('#jsme-stage svg')].find((s) => s.getBoundingClientRect().height > 150);
      const r = [...svg.querySelectorAll('text')].find((t) => /O/.test(t.textContent)).getBoundingClientRect();
      return { x: r.x + r.width * 0.72, y: r.y + r.height / 2 };`);
    await b.moveTo(oxygen.x, oxygen.y);
    await sleep(300);
    await b.click(oxygen.x, oxygen.y);
    await sleep(300);
    smiles = await b.run(`return window.jsmeApplet.smiles();`);
  }
  const pressed: string = await b.run(`return document.querySelector('#sketch-elements [aria-pressed="true"]')?.textContent ?? '';`);
  check('a functional group from "Groups…" is bonded to the atom clicked', smiles === 'COC(=O)O' && pressed === 'COOH', `${smiles}, ${pressed} chosen`);

  // Straight from the list (asked for 2026-10-20): drag CN out of "Groups…"
  // onto methanol's O. The same stale-label retry as above.
  await b.run(`window.jsmeApplet.readGenericMolecularInput('CO'); window.jsmeApplet.repaint();`);
  await sleep(400);
  let dragged = 'CO';
  for (let tries = 0; tries < 3 && dragged === 'CO'; tries++) {
    await press('#sketch-groups');
    const cell = await centre('#group-palette .fg-cell[data-code="242"]');
    const oxygen = await b.run(`
      const svg = [...document.querySelectorAll('#jsme-stage svg')].find((s) => s.getBoundingClientRect().height > 150);
      const r = [...svg.querySelectorAll('text')].find((t) => /O/.test(t.textContent)).getBoundingClientRect();
      return { x: r.x + r.width * 0.72, y: r.y + r.height / 2 };`);
    await b.drag(cell, oxygen);
    await sleep(400);
    dragged = await b.run(`return window.jsmeApplet.smiles();`);
  }
  const row: string = await b.run(`return [...document.querySelectorAll('#sketch-elements [data-group]')].map((b) => b.textContent).join(' ');`);
  check('a group dragged straight from "Groups…" is bonded where it is dropped', dragged === 'COC#N' && row.includes('CN'), `${dragged}; row: ${row}`);
}

/** Charges JSME refuses (asked for 2026-10-20): its charge tool will not
 *  charge a bonded halogen, and it infers I₃ and SiF₆ as cations. Ours gives
 *  each centre its anion as an X atom in one click — ICl₄'s I, I₃'s middle
 *  I, SiF₆'s Si — and Clean keeps the charge. */
async function sketcherRefusedCharges(b: Browser) {
  await b.open(url);
  const centre = (selector: string) => b.run(`const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  const press = async (selector: string) => {
    const p = await centre(selector);
    await b.moveTo(p.x, p.y);
    await b.click(p.x, p.y);
    await sleep(300);
  };
  const smiles = (): Promise<string> => b.run(`return window.jsmeApplet.smiles();`);
  // the first press on JSME's drawing after a load is ignored: spend it on empty space
  const corner = await b.run(`
    const r = [...document.querySelectorAll('#jsme-stage svg')].find((s) => s.getBoundingClientRect().height > 150).getBoundingClientRect();
    return { x: r.x + 20, y: r.y + r.height - 20 };`);
  await b.moveTo(corner.x, corner.y);
  await b.click(corner.x, corner.y);
  // Read the drawing, choose the charge tool, click the atom labelled `label`;
  // JSME's labels can lag a read (the stale-label trap), so click again while
  // nothing has changed — at most three tries.
  const chargeAtom = async (drawn: string, label: string) => {
    await b.run(`window.jsmeApplet.readGenericMolecularInput('${drawn}'); window.jsmeApplet.repaint();`);
    await sleep(400);
    await press('#sketch-tools [data-tool="charge"]');
    const start = await smiles();
    let now = start;
    for (let tries = 0; tries < 3 && now === start; tries++) {
      const atom = await b.run(`
        const svg = [...document.querySelectorAll('#jsme-stage svg')].find((s) => s.getBoundingClientRect().height > 150);
        const r = [...svg.querySelectorAll('text')].find((t) => t.textContent === '${label}').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
      await b.moveTo(atom.x - 20, atom.y - 20);
      await b.moveTo(atom.x, atom.y);
      await sleep(300);
      await b.click(atom.x, atom.y);
      await sleep(400);
      now = await smiles();
    }
    return now;
  };

  const icl4 = await chargeAtom('ClI(Cl)(Cl)Cl', 'I');
  await press('#sketch-tools [data-tool="clean"]');
  const cleaned = await smiles();
  check('the charge tool gives ICl₄ its anion, and Clean keeps it', icl4 === 'Cl[I-](Cl)(Cl)Cl' && cleaned === icl4, `${icl4} → ${cleaned}`);
  const i3 = await chargeAtom('III', 'I+');
  check('one click turns JSME\'s I₃⁺ into I₃⁻', i3 === 'I[I-]I', i3);
  const sif6 = await chargeAtom('F[Si](F)(F)(F)(F)F', 'Si2+');
  check('one click turns JSME\'s SiF₆²⁺ into SiF₆²⁻', sif6 === 'F[Si-2](F)(F)(F)(F)F', sif6);
}

/** Clicking an orbital must not scroll the list (reported 2026-10-06). */
async function orbitalListStaysPut(b: Browser) {
  await b.open(url);
  await pickExample(b, 'Benzene (C₆H₆)');
  await view(b, 'delocalized');
  await orbitalsReady(b);
  const before = await b.run(`
    const rows = [...document.querySelectorAll('button.orb-item')];
    const list = rows[0].closest("#mo-list");
    const box = list.getBoundingClientRect();
    const row = rows.find((r) => { const b = r.getBoundingClientRect(); return b.top > box.top + 2 && b.bottom < box.top + 80; });
    const b = row.getBoundingClientRect();
    return { scroll: list.scrollTop, x: b.x + b.width / 2, y: b.y + b.height / 2, label: row.textContent.trim() };`);
  await b.moveTo(before.x, before.y);
  await b.click(before.x, before.y);
  await settle(b, 800);
  const after = await b.run(`
    const list = document.querySelector("#mo-list");
    return { scroll: list.scrollTop, selected: document.querySelector('button.orb-item.selected')?.textContent.trim() };`);
  check('clicking an MO selects it', after.selected === before.label, after.selected ?? 'nothing selected');
  check('clicking an MO leaves the list where it was', Math.abs(after.scroll - before.scroll) < 1, `scrollTop ${before.scroll} → ${after.scroll}`);
}

/**
 * The Lewis-structure orbitals follow the drawing: formamide drawn O=C–N has a
 * nitrogen lone pair, and its strongest donation is into the C=O π*. (Pipek–
 * Mezey localizes formamide as the zwitterion, with no such lone pair.)
 */
async function lewisStructureDonation(b: Browser) {
  await b.open(url);
  await build(b, 'NC=O');
  await view(b, 'localized');
  await orbitalsReady(b);
  await b.run(`document.querySelector('[data-localize="lewis"]').click();`);
  // the Lewis list is built from the GFN2 single point, which may still be running
  let listed = false;
  for (let waited = 0; waited < 20_000 && !listed; waited += 250) {
    listed = await b.run(`return [...document.querySelectorAll('#mo-list button.orb-item')].some((row) => /^N\\d+\\(LP\\)/.test(row.textContent));`);
    if (!listed) await sleep(250);
  }
  if (!listed) {
    const note: string = await b.run(`return document.getElementById('mo-note').textContent;`);
    check('Lewis structure: formamide’s N lone pair donates most into the C=O π*', false, `no N lone pair listed — ${note.slice(0, 90)}`);
    return;
  }
  await b.run(`
    for (const row of document.querySelectorAll('#mo-list button.orb-item.selected')) row.click();
    [...document.querySelectorAll('#mo-list button.orb-item')].find((row) => /^N\\d+\\(LP\\)/.test(row.textContent)).click();`);
  await settle(b, 600);
  const donations: Array<{ type: string; e2: number }> = await b.run(`
    return [...document.querySelectorAll('#mo-list button.orb-item.donates')].map((row) => ({
      type: row.querySelector('.orb-type').textContent,
      e2: parseFloat(row.querySelector('.orb-e2').textContent),
    })).sort((x, y) => y.e2 - x.e2);`);
  const top = donations[0];
  check('Lewis structure: formamide’s N lone pair donates most into the C=O π*',
    !!top && /^[CO]\d+-[CO]\d+ π\*$/.test(top.type) && top.e2 > 25,
    top ? `${top.type} ${top.e2} kcal/mol` : 'no donation marked');
  const tableTop: string = await b.run(`return document.querySelector('#mo-e2 .e2-entry .e2-pair')?.textContent ?? '';`);
  check('the E(2) table ranks the amide donation first', /^N\d+\(LP\) → [CO]\d+-[CO]\d+ π\*$/.test(tableTop), tableTop || 'no table');
}

/**
 * A clean console on load, in a narrow window — so a real error is never
 * buried in noise. A sketcher under ~300 px is where JSME's menu icons logged
 * dozens of invalid-SVG errors (index.html corrects their markup); the main
 * run's wide window never showed them. Its own browser, at its own size.
 */
async function loadsCleanWhenNarrow() {
  const narrow = await launchBrowser(800, 870, 1);
  try {
    await narrow.open(url);
    await sleep(1500);
    const stage = await narrow.run(`return document.getElementById('jsme-stage').clientWidth;`);
    check('a narrow window loads without console errors', narrow.pageErrors.length === 0,
      narrow.pageErrors.slice(0, 2).join('; ') || `sketcher ${stage} px`);
  } finally {
    await narrow.close();
  }
}

const started = Date.now();
console.log(`Valence smoke test — ${url}\n`);
try {
  await loadsCleanWhenNarrow();
} catch (error) {
  check('loadsCleanWhenNarrow', false, `stopped: ${(error as Error).message.split('\n')[0]}`);
}
// 150 % display scaling, as on most Windows laptops: at 100 % JSME draws the
// first atom where it is clicked, and the CH4 bug of 2026-10-06 did not show.
const b = await launchBrowser(1600, 1000, 1.5);
try {
  for (const part of [examplesInEveryView, sketchedBuilds, sketcherFirstAtom, sketcherDragAndDrop, sketcherMoveAndClean, sketcherFunctionalGroup, sketcherRefusedCharges, orbitalListStaysPut, lewisStructureDonation]) {
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
