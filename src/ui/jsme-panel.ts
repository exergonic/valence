import { assessBonding, markBondingChanges } from '../geometry/bond-integrity';
import type { SceneContext } from '../render';
import { rebuildDisplay, buildScene } from '../render';
import { parseMolBlock } from '../mol-parser';
import type { Molecule } from '../mol-parser';
import { writeNote, type InfoNote } from './info-note';
import { kekulizeSmiles } from '../chem/kekulize-smiles';
import { fillMissingHydrogens } from '../chem/fill-hydrogens';
import { parseXAtomLabel, xAtomLabels } from './x-atom-labels';
import { isMetal, lowestMultiplicity, spinName } from '../chem/elements';
import type { NormalMode } from '../chem/gfn2-xtb/normal-modes';
import { computeLocalGeometry, type LocalGeometry } from '../geometry/local-geometry';
import {
  cancelGfn2, Gfn2Cancelled, Gfn2Unavailable, refineWithGfn2, GFN2_NOTE, SADDLE_FREQUENCY_THRESHOLD, type Gfn2Held, type Gfn2Progress, type Gfn2Result,
} from '../geometry/gfn2-refine';
import { parameterGapWarnings } from '../geometry/parameter-warnings';
import { ringPuckerWarnings } from '../geometry/ring-pucker';
import { vseprShapeMismatches } from '../chem/vsepr/compare-shape';
import { fetch3D, computeFormula } from '../geometry/resolve3d';
import { symmetrizeMolecule } from '../geometry/symmetrize';
import type { PubChemInfo } from '../geometry/resolve3d';

declare global {
  interface Window {
    jsmeApplet: any;
  }
}

/** localStorage key for the sketcher panel's collapsed state. */
const JSME_COLLAPSED_KEY = 'valence:jsme-collapsed';

/**
 * Dock or undock the sketcher panel. Collapsing clears a dragged width so
 * the rail is always its own slim size; expanding falls back to the CSS
 * width. JSME sizes to its container, so expanding repaints the applet.
 */
export function setJsmeCollapsed(collapsed: boolean) {
  const panel = document.getElementById('jsme-panel');
  if (!panel) return;
  if (collapsed) panel.style.width = '';
  panel.classList.toggle('collapsed', collapsed);
  try {
    localStorage.setItem(JSME_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // private mode or no storage: the panel just won't remember
  }
  if (!collapsed && window.jsmeApplet) setTimeout(() => window.jsmeApplet.repaint(), 50);
}

export function toggleJsmeCollapsed() {
  const panel = document.getElementById('jsme-panel');
  if (panel) setJsmeCollapsed(!panel.classList.contains('collapsed'));
}

/** Show the busy overlay. `cancellable` adds the Cancel button, which stops a
 *  GFN2 run in flight (the caller decides what a cancelled run shows). */
function showLoading(text: string, cancellable = false) {
  const overlay = document.getElementById('loading-overlay')!;
  document.getElementById('loading-text')!.textContent = text;
  document.getElementById('loading-detail')!.textContent = '';
  const cancel = document.getElementById('loading-cancel') as HTMLButtonElement;
  cancel.classList.toggle('hidden', !cancellable);
  cancel.onclick = cancellable ? () => cancelGfn2() : null;
  overlay.classList.remove('hidden');
}

/** The overlay's clock while the Thermo view's Hessian runs (see
 *  trackGfn2Progress); stopped with the overlay. */
let hessianClock: ReturnType<typeof setInterval> | null = null;

function stopHessianClock() {
  if (hessianClock !== null) clearInterval(hessianClock);
  hessianClock = null;
}

function hideLoading() {
  stopHessianClock();
  document.getElementById('loading-overlay')!.classList.add('hidden');
  document.getElementById('loading-cancel')!.classList.add('hidden');
}

/**
 * The overlay's running account of a GFN2 run: what stage it is in, how many
 * energy evaluations it has made, the lowest energy so far and the time spent.
 * A larger molecule takes tens of seconds, and a counter that moves is the
 * difference between "working" and "hung".
 *
 * The Thermo view's Hessian is one call into the engine that reports nothing
 * until it returns, so given its estimate (`hessianSeconds`) the overlay keeps
 * its own clock: the time so far against the estimate.
 */
function trackGfn2Progress(hessianSeconds: number | null = null): (progress: Gfn2Progress) => void {
  const started = performance.now();
  return (progress) => {
    // a saddle's escape ends one Hessian, and its check starts another
    stopHessianClock();
    const hessianStarted = progress.stage === 'curvature' && hessianSeconds !== null ? performance.now() : null;
    const write = () => {
      const stage = progress.stage === 'optimising' ? 'Optimising with GFN2-xTB…'
        : progress.stage === 'curvature'
          ? hessianStarted === null ? 'Checking the curvature (numerical Hessian)…' : 'Computing the vibrations (numerical Hessian)…'
        : progress.stage === 'holding' ? 'The bonding changed — relaxing the molecule drawn with its bonds held…'
        : 'Converged to a saddle point — pushing it downhill and re-optimising…';
      document.getElementById('loading-text')!.textContent = stage;
      const seconds = ((performance.now() - started) / 1000).toFixed(0);
      const energy = progress.energyHartree === null ? '' : ` · E ${progress.energyHartree.toFixed(5)} Eh`;
      document.getElementById('loading-detail')!.textContent = hessianStarted !== null
        ? `${((performance.now() - hessianStarted) / 1000).toFixed(0)} s of about ${Math.max(1, Math.round(hessianSeconds!))} s`
        : `${progress.evaluations} energy evaluations${energy} · ${seconds} s`;
    };
    if (hessianStarted !== null) hessianClock = setInterval(write, 1000);
    write();
  };
}

function showRenderError(text: string) {
  const banner = document.getElementById('render-error')!;
  document.getElementById('render-error-text')!.textContent = text;
  banner.classList.remove('hidden');
}

function hideRenderError() {
  document.getElementById('render-error')!.classList.add('hidden');
}

/**
 * Snap the resolved geometry to the point group it nearly has — the last step
 * of the pipeline, after the source (PubChem, CIR, or the local GFN2-xTB
 * engine) has had its say. Every source leaves a symmetric molecule a little asymmetric
 * (measured: 0.2 mÅ in the stiff coordinates, up to 20 mÅ in the soft ones),
 * which reads as a distorted molecule and splits degenerate orbitals. The
 * snap is reported, never silent, and can be turned off.
 */
export function snapToSymmetry(molecule: Molecule): { molecule: Molecule; info: string[] } {
  const enabled = (document.getElementById('ctrl-symmetrize') as HTMLInputElement | null)?.checked ?? true;
  if (!enabled) return { molecule, info: [] };
  const snapped = symmetrizeMolecule(molecule);
  if (snapped.order <= 1) return { molecule, info: [] };
  return {
    molecule: { ...molecule, atoms: snapped.atoms }, // the spin, if any, rides along
    info: [
      `Point group ${snapped.symbol}: the geometry was snapped to the symmetry it nearly has, its atoms moved at `
      + `most ${(snapped.maxShift * 1000).toFixed(2)} mÅ. Turn off "Snap to point group" to see it raw.`,
    ],
  };
}

/**
 * The caveats on a PubChem structure: one-liners for the header, since each
 * says its geometry is approximate. Only PubChem's
 * structures are MMFF94 conformers, so only they get the MMFF94 caveats: the
 * parameter-gap report ("geometry approximate") and the 3-ring pucker check
 * (ring-pucker.ts: MMFF94's reference-angle artifact, reported, never
 * repaired). CIR builds its 3D by rule (CORINA) and MMFF94 never touches it —
 * "Ni has no MMFF94 type" on a CIR structure left the reader asking what
 * MMFF94 had to do with anything — and a local structure is GFN2's or the
 * unoptimised start, neither MMFF94's. The dipole's caveats depend on which
 * charge model is on screen, so the dipole readout carries them
 * (render/rebuild.ts).
 */
function mmff94ConformerCaveats(molecule: Molecule): string[] {
  return [...parameterGapWarnings(molecule), ...ringPuckerWarnings(molecule)];
}

/** The spin control under Refine: back to the lowest allowed spin, for a new
 *  structure — a triplet chosen for one molecule says nothing of the next. */
export function resetGfn2Spin(): void {
  const spin = document.getElementById('ctrl-gfn2-spin') as HTMLSelectElement | null;
  if (spin) spin.value = 'auto';
}

type Note = string | InfoNote;

/**
 * What the header and its structure card say about a structure (decided with
 * the user 2026-11-09). Something wrong with it is said in the header itself,
 * in one line (`warnings`), and explained first in the card (`attention`);
 * everything else waits in the card (`info`), so a structure with nothing
 * wrong shows nothing but its facts until asked.
 */
interface StructureNotes {
  warnings: string[];
  attention: Note[];
  info: Note[];
}

function joinNotes(...parts: Partial<StructureNotes>[]): StructureNotes {
  return {
    warnings: parts.flatMap((p) => p.warnings ?? []),
    attention: parts.flatMap((p) => p.attention ?? []),
    info: parts.flatMap((p) => p.info ?? []),
  };
}

/**
 * What a GFN2 run says about itself: the convergence line, and the curvature.
 * A gradient-based stop cannot tell a minimum from a saddle — both have zero
 * gradient — so the Hessian is what lets the app say which one is on screen,
 * and when the run was pushed off a saddle, it says that too. A run that
 * stopped short, or a saddle it could not leave, is something wrong.
 */
function gfn2RunNotes(run: Gfn2Result): StructureNotes {
  const seconds = (run.milliseconds / 1000).toFixed(1);
  if (!run.converged) {
    // No curvature verdict either: the Hessian runs only on a converged point.
    return joinNotes({
      warnings: ['GFN2-xTB structure, not fully converged.'],
      attention: [`GFN2-xTB stopped after ${run.iterations} steps (${seconds} s), short of full convergence. The `
        + `structure shown is the lowest-energy point it reached (${run.energyHartree.toFixed(6)} Eh): its shape `
        + 'is reliable, its last few hundredths of an ångström are not.'],
    });
  }
  const converged = `GFN2-xTB converged in ${run.iterations} steps to ${run.energyHartree.toFixed(6)} Eh (${seconds} s).`;
  const escapes = run.saddleEscapes === 1 ? 'once' : `${run.saddleEscapes} times`;
  if (run.lowestFrequency === null) {
    return joinNotes({ info: [converged, 'The Hessian check was skipped above 16 atoms, where it costs more than the '
      + 'optimisation: a converged stationary point, not verified to be a minimum. The Thermo view computes it.'] });
  }
  if (run.lowestFrequency < SADDLE_FREQUENCY_THRESHOLD) {
    return joinNotes({
      warnings: ['A saddle point, not a minimum.'],
      attention: ['GFN2-xTB converged to a saddle, not a minimum: the lowest vibration is imaginary '
        + `(${Math.abs(run.lowestFrequency).toFixed(0)}i cm⁻¹)`
        + (run.saddleEscapes > 0 ? `, and pushing it down that mode (${escapes}) did not reach a minimum` : '')
        + '. The geometry on screen is that stationary point.'],
      info: [converged],
    });
  }
  return joinNotes({ info: [converged, run.saddleEscapes > 0
    ? `It first converged to a saddle point; pushed down its imaginary mode (${escapes}) and re-optimised, it `
      + 'reached a minimum, with no imaginary mode.'
    : 'Hessian: a minimum, with no imaginary mode.'] });
}

/** The charges and radicals the sketch holds on X atoms (x-atom-labels.ts):
 *  the V2000 block names such an atom by its label ("I-", "C•", or "Q"), the
 *  V3000 block keeps the label whole. */
function withXAtomLabels(molecule: Molecule, v3000: string): Molecule {
  const labels = xAtomLabels(v3000);
  if (labels.size === 0) return molecule;
  const atoms = molecule.atoms.map((atom, i) => {
    const label = parseXAtomLabel(labels.get(i) ?? '');
    if (!label) return atom;
    return { ...atom, element: label.element, charge: label.charge, ...(label.radical ? { radical: label.radical } : {}) };
  });
  return { ...molecule, atoms };
}

/**
 * Where GFN2-xTB's structure leaves the shape the VSEPR picture predicts
 * (compare-shape.ts): said, so a model failure becomes something to look at
 * rather than a silent wrong answer — GFN2 makes SeF₄ a square pyramid, where
 * VSEPR and experiment say seesaw (NOTES.md, 2026-10-20). Neither side is
 * assumed right.
 */
function gfn2ShapeNotes(molecule: Molecule): StructureNotes {
  const mismatches = vseprShapeMismatches(molecule);
  const name = (index: number) => `${molecule.atoms[index].element}${index + 1}`;
  return joinNotes({
    warnings: mismatches.length === 0 ? []
      : [`${mismatches.map((m) => name(m.atomIndex)).join(', ')}: not the shape VSEPR predicts.`],
    attention: mismatches.map((m) => {
      const found = m.measured ? `${m.measured} (bond angles ${m.measuredAngles})` : `bond angles ${m.measuredAngles}`;
      return `${name(m.atomIndex)} is not the shape VSEPR predicts. VSEPR: ${m.formula}, ${m.predicted} (bond angles `
        + `${m.predictedAngles}). GFN2-xTB: ${found}. Either can be wrong (VSEPR is a counting rule, GFN2-xTB a `
        + 'semiempirical model), and experiment decides between them.';
    }),
  });
}

/**
 * Put a geometry in the scene. `gfn2Charges` rides along only when the GFN2
 * tier produced this structure — they belong to exactly this atom list, and
 * buildScene drops the pairing if it is ever broken. `noMinimum` says why
 * optimising this structure would not give a minimum of the molecule drawn
 * (the Thermo view reads it).
 */
function showMolecule(
  ctx: SceneContext, molecule: Molecule, gfn2Charges: number[] | null, vibrations: NormalMode[] | null = null,
  noMinimum: string | null = null,
) {
  ctx.currentMolecule = molecule;
  ctx.gfn2Charges =
    gfn2Charges && gfn2Charges.length === molecule.atoms.length ? { molecule, charges: gfn2Charges } : null;
  // the snap moved atoms by under a milliångström, so the minimum's modes still describe it.
  // A structure that is not the molecule drawn keeps none, at any size: GFN2's
  // set-aside result below 16 atoms arrives with the Hessian verdict's modes,
  // but its thermochemistry would be another molecule's — redraw that one
  // (decided with the user 2026-11-09)
  ctx.vibrations = vibrations && vibrations.length > 0 && !noMinimum ? { molecule, modes: vibrations } : null;
  ctx.noMinimum = noMinimum ? { molecule, reason: noMinimum } : null;
  ctx.display.vibrationIndex = null;
  buildScene(ctx);
}

/** What the header shows besides the formula and weight, which are read off
 *  the molecule itself. */
type HeaderInfo = Omit<PubChemInfo, 'source' | 'formula' | 'weight'> & Partial<StructureNotes> & {
  source: PubChemInfo['source'] | 'example' | 'atom';
  /** The spin was chosen under Refine, not left to the electron count. */
  spinChosen?: boolean;
};

const SOURCE_LABEL: Record<HeaderInfo['source'], string> = {
  pubchem: 'PubChem 3D', cir: 'CIR', gfn2: 'GFN2-xTB', local: 'Unoptimised', example: 'Example', atom: 'Single atom',
};

/** Where the structure came from, as the card's first fact says it. */
const SOURCE_FACT: Record<HeaderInfo['source'], string> = {
  pubchem: 'PubChem 3D: an MMFF94 conformer, checked against the sketch',
  cir: 'CIR (NIH CACTUS): built by rule, checked against the sketch',
  gfn2: 'GFN2-xTB, optimised in this browser',
  local: 'the embedder’s start, unoptimised',
  example: 'an example, stored with the app',
  atom: 'a single atom: nothing to optimise',
};

/** The spin GFN2 runs at, and why that one — said for every structure, so an
 *  open shell is never silently one. The worker's own rule: the structure's
 *  spin if it has one, else the lowest the electron count allows. */
function spinFact(molecule: Molecule, source: HeaderInfo['source'], chosen: boolean): string {
  const lowest = lowestMultiplicity(molecule.atoms);
  const multiplicity = molecule.multiplicity ?? lowest;
  const name = spinName(multiplicity);
  if (chosen) return `${name}, chosen under Refine`;
  if (multiplicity === lowest) return lowest === 1 ? name : `${name}: the electron count is odd`;
  return `${name}, ${source === 'example' ? 'the example’s own' : 'this structure’s own'}`;
}

function signedCharge(charge: number): string {
  return charge === 0 ? '0' : `${charge > 0 ? '+' : '−'}${Math.abs(charge)}`;
}

/** The structure card's rows, PubChem's record among them: a term and its value. */
function writeRows(list: HTMLElement, rows: Array<[string, string | undefined]>) {
  const populated = rows.filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0);
  list.replaceChildren(...populated.map(([key, value]) => {
    const row = document.createElement('div');
    row.className = 'data-row';
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }));
}

function writeNotes(container: HTMLElement, notes: Note[]) {
  container.replaceChildren(...notes.map((note) => {
    const p = document.createElement('p');
    writeNote(p, note);
    return p;
  }));
}

/** The source chip opens and closes the structure card. It stays as the user
 *  left it from one molecule to the next. */
let cardWired = false;
function wireStructureCard() {
  if (cardWired) return;
  cardWired = true;
  const chip = document.getElementById('mol-source')!;
  const card = document.getElementById('structure-card')!;
  chip.addEventListener('click', () => {
    const open = card.classList.toggle('hidden') === false;
    chip.setAttribute('aria-expanded', String(open));
    placeStructureCard();
  });
}

/** The card hangs just under the header, which grows a line when it carries
 *  warnings. */
function placeStructureCard() {
  const header = document.getElementById('molecule-info')!;
  const card = document.getElementById('structure-card')!;
  if (!card.classList.contains('hidden')) card.style.top = `${header.offsetTop + header.offsetHeight + 6}px`;
}

/**
 * The molecule header over the scene — formula, name, weight, where the
 * structure came from, what is wrong with it if anything — and the structure
 * card its source chip opens: the attention notes first, then the facts
 * (source, charge, spin), the other notes, and PubChem's record. Every path
 * that puts a structure on screen (a build, a refinement, an example) comes
 * through here.
 */
export function showMoleculeHeader(molecule: Molecule, info: HeaderInfo) {
  wireStructureCard();
  const { formula, weight } = computeFormula(molecule.atoms.map((a) => a.element));
  const container = document.getElementById('molecule-info')!;
  const formulaEl = document.getElementById('mol-formula')!;
  const nameEl = document.getElementById('mol-name')!;
  const weightEl = document.getElementById('mol-weight')!;
  const sourceEl = document.getElementById('mol-source')!;
  const linkEl = document.getElementById('mol-link') as HTMLAnchorElement;
  const warnings = info.warnings ?? [];
  const attention = info.attention ?? [];

  container.classList.remove('hidden');
  formulaEl.textContent = formula;
  nameEl.textContent = info.name ? ` · ${info.name}` : '';
  weightEl.textContent = weight ? ` · MW ${weight}` : '';
  sourceEl.textContent = SOURCE_LABEL[info.source];
  // the chip is marked when the card has something wrong to explain
  sourceEl.className = info.source + (warnings.length > 0 || attention.length > 0 ? ' attention' : '');

  if (info.cid) {
    linkEl.href = `https://pubchem.ncbi.nlm.nih.gov/compound/${info.cid}`;
    linkEl.style.display = '';
  } else {
    linkEl.style.display = 'none';
  }

  const warningsEl = document.getElementById('mol-warnings')!;
  warningsEl.classList.toggle('hidden', warnings.length === 0);
  warningsEl.textContent = warnings.join('\n');

  document.getElementById('mol-set-aside')!.classList.add('hidden');
  document.getElementById('mol-continue')!.classList.add('hidden');

  // the structure card
  const attentionEl = document.getElementById('structure-attention')!;
  writeNotes(attentionEl, attention);
  attentionEl.classList.toggle('hidden', attention.length === 0);
  const charge = molecule.atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0);
  writeRows(document.getElementById('structure-facts')!, [
    ['Source', SOURCE_FACT[info.source]],
    ['Charge', signedCharge(charge)],
    ['Spin', spinFact(molecule, info.source, info.spinChosen ?? false)],
  ]);
  writeNotes(document.getElementById('structure-notes')!, info.info ?? []);

  // PubChem's record, on a PubChem structure
  const recordEl = document.getElementById('structure-record')!;
  if (info.source === 'pubchem' && info.cid && (info.pubchem || info.mmff94)) {
    const rows: Array<[string, string | undefined]> = [];
    if (info.pubchem) {
      const p = info.pubchem;
      rows.push(
        ['CID', info.cid],
        ['IUPAC name', p.iupacName],
        ['Molecular formula', p.formula],
        ['Molecular weight', p.weight],
        ['SMILES', p.smiles],
        ['InChI', p.inchi],
        ['InChI key', p.inchikey],
      );
    }
    if (info.mmff94) {
      rows.push(
        ['MMFF94 energy (kcal/mol)', info.mmff94.energy],
        ['MMFF94 partial charges', info.mmff94.partialCharges],
      );
    }
    writeRows(document.getElementById('mol-data-rows')!, rows);
    document.getElementById('mol-data-cid')!.textContent = `#${info.cid}`;
    recordEl.classList.remove('hidden');
  } else {
    recordEl.classList.add('hidden');
  }
  placeStructureCard();
}

/** The header's button for a GFN2 result set aside because a drawn bond came
 *  apart in it; `label` says what a press shows. Every new header hides it,
 *  so it is offered after the header is written. */
function offerSetAside(label: string, show: () => void) {
  const button = document.getElementById('mol-set-aside') as HTMLButtonElement;
  button.textContent = label;
  button.onclick = show;
  button.classList.remove('hidden');
}

/** The refinement of the structure on screen — the "Refine with GFN2-xTB"
 *  control's, set when the panel mounts. Given a Hessian estimate it is the
 *  Thermo view's run (refineForVibrations). */
let refineOnScreen: (hessianSeconds?: number) => Promise<void> = async () => {};

/**
 * The Thermo view's run: the structure on screen optimised with GFN2-xTB (a
 * minimum barely moves), its Hessian computed whatever its size, a saddle
 * escaped — and the result put on screen as any refinement is, the bonding
 * guard and the structure card included. `hessianSeconds` is the estimate the
 * overlay counts against.
 */
export function refineForVibrations(hessianSeconds: number): Promise<void> {
  return refineOnScreen(hessianSeconds);
}

/** The header's "Keep optimising", offered when a free GFN2 run stopped short
 *  (its 30 s budget, or its step budgets): another run from the best structure
 *  it reached, with a fresh budget, as often as the user likes — a person
 *  checking in every 30 s rather than a run that might never return (decided
 *  with the user 2026-10-24). Every new header hides it. */
function offerContinue() {
  const button = document.getElementById('mol-continue') as HTMLButtonElement;
  button.onclick = () => { void refineOnScreen(); };
  button.classList.remove('hidden');
}

/** kcal/mol per hartree. */
const KCAL_PER_HARTREE = 627.509474;

/** What the header and its structure card say of a held structure: GFN2's free
 *  result (`free`) changed the bonding (`change`, a sentence), so the molecule
 *  drawn is shown, relaxed with its bonds held (geometry/bond-integrity.ts). */
function heldNotes(held: Gfn2Held, free: Gfn2Result, change: string): { warning: string; info: string } {
  const above = ((held.energyHartree - free.energyHartree) * KCAL_PER_HARTREE).toFixed(1);
  const warning = `Held structure — GFN2-xTB's own result is set aside (${change}). Shown: the molecule drawn, `
    + 'relaxed with its bonds held — a constrained structure, not a minimum.';
  const info = held.restrained
    ? 'Held structure: GFN2-xTB relaxed the molecule drawn with each drawn bond kept within a full bond\'s '
      + 'length and no two unbonded atoms brought to bonding distance — the bonding guard\'s own limits. '
      + `Held there, it is not a minimum: ${above} kcal/mol above GFN2-xTB's own result`
      + `${held.converged ? '' : ', and it stopped short of convergence'}. Its bond lengths and angles are the `
      + 'drawn molecule\'s, as far as its bonding allows.'
    : 'Held structure: the lowest-energy point GFN2-xTB\'s own run passed while still the molecule drawn — '
      + `partway through the run, not a stationary point (the held optimisation could not finish); ${above} `
      + 'kcal/mol above GFN2-xTB\'s own result.';
  return { warning, info };
}

/** Why the Thermo view will not optimise a held structure: it is the drawing
 *  held at the guard's limits, and a free run would only break it again. */
const HELD_NO_MINIMUM = 'This is the held structure: GFN2-xTB\'s own result broke or made a bond, so the molecule '
  + 'drawn is shown held at its bond limits — not a minimum, so it has no vibrations. Check the drawing (its charges, '
  + 'hydrogens and bonds) and build it again.';

/** Why the Thermo view will not optimise GFN2's set-aside result. */
const SET_ASIDE_NO_MINIMUM = 'This is GFN2-xTB\'s set-aside result, shown on request: it is no longer the molecule '
  + 'drawn, so its vibrations would be another molecule\'s. If it is the molecule meant, draw it and build it again.';

/** What the header says of GFN2's free result when the user asks for it. */
const freeOnRequest = (change: string) =>
  `GFN2-xTB's result, shown on request: ${change}, drawn dashed — this is no longer the molecule drawn.`;

export function mountJsmePanel(ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')! as HTMLButtonElement;
  ctx.rerender = () => rebuildDisplay(ctx);
  document.getElementById('render-error-close')!.onclick = hideRenderError;

  renderBtn.onclick = async () => {
    const applet = window.jsmeApplet;
    if (!applet) return;

    renderBtn.textContent = 'Loading...';
    renderBtn.disabled = true;
    resetGfn2Spin();
    hideRenderError();
    showLoading('Rendering...');

    try {
      const t0 = performance.now();
      // JSME's smiles() emits aromatic lower-case SMILES (e.g. "c1ccc1" for
      // cyclobutadiene), which PubChem canonicalizes to the wrong compound.
      // Rewrite monocyclic aromatic rings into explicit Kekulé bonds before
      // the structure is sent; non-aromatic SMILES pass through unchanged.
      const smiles = kekulizeSmiles(applet.smiles());
      const molBlock = applet.molFile();
      const t1 = performance.now();
      let molecule = withXAtomLabels(parseMolBlock(molBlock), applet.molFile(true));
      const t2 = performance.now();
      if (molecule.atoms.length === 0) return;

      const forceLocal = (document.getElementById('ctrl-force-fallback') as HTMLInputElement | null)?.checked ?? false;
      // A metal compound goes straight to GFN2: PubChem computes no 3D for
      // most of them, and CIR's are built by rule — H₃Si–Ni came back with a
      // 2.59 Å Si–Ni bond where GFN2 finds 2.17 Å, in a fifth of a second.
      const metal = molecule.atoms.find((a) => isMetal(a.element))?.element ?? null;
      // a single atom (nothing the filler adds hydrogens to) is a point: there is
      // nothing for PubChem or CIR to build
      const atom = fillMissingHydrogens(molecule).atoms.length === 1;
      // A drawn radical goes straight to GFN2 too: JSME's SMILES writes it
      // "[C•]", which neither service reads, and PubChem has 3D for few
      // radicals.
      const radical = molecule.atoms.some((a) => a.radical);
      const result = forceLocal || metal || atom || radical ? null : await fetch3D(smiles, molecule);
      const t3 = performance.now();
      if (result) {
        // fetch3D validates the returned structure against the sketch and
        // returns the parsed molecule — no re-parse here.
        molecule = result.molecule;
        const snapped = snapToSymmetry(molecule);
        molecule = snapped.molecule;
        const caveats = result.info.source === 'pubchem' ? mmff94ConformerCaveats(molecule) : [];
        showMoleculeHeader(molecule, {
          ...result.info, warnings: [...(result.info.warnings ?? []), ...caveats], info: snapped.info,
        });
        // a fetched structure brings no GFN2 charges or vibrations
        showMolecule(ctx, molecule, null, null);
      } else {
        // GFN2 is the only local engine (preloaded at startup), and a larger
        // molecule takes tens of seconds, so the overlay counts as it goes and
        // Cancel shows the unoptimised start instead.
        showLoading('Starting GFN2-xTB…', true);
        const local = await computeLocalGeometry(molecule, trackGfn2Progress());
        const t4 = performance.now();
        if (!local) {
          // Not even a starting structure: refuse to render rather than show
          // the 2D sketch as if it were a 3D model. The view is left as it was.
          console.warn('[render] computeLocalGeometry returned null; refusing to render');
          showRenderError(
            'Could not generate a 3D structure for this sketch — the embedder failed. The 3D view is unchanged.'
          );
          return;
        }
        // One local geometry on screen: the header, its structure card, the
        // scene. `onRequest` is said first in the header when it is a
        // set-aside result the user asked to see.
        const present = (shown: LocalGeometry, onRequest?: string) => {
          const snapped = snapToSymmetry(shown.molecule);
          const next = snapped.molecule;
          // the structural warnings (a drawn wedge the engine could not keep
          // among them) are the header's; how the run went is the card's
          let run: Partial<StructureNotes> = {};
          if (shown.engine === 'gfn2' && shown.gfn2) {
            run = joinNotes(gfn2RunNotes(shown.gfn2), { info: shown.partialBonds ?? [] }, gfn2ShapeNotes(next));
          } else if (shown.engine === 'held' && shown.held && shown.gfn2) {
            const held = heldNotes(shown.held, shown.gfn2, shown.bondingChange ?? 'its bonding changed');
            run = joinNotes({ warnings: [held.warning], attention: [held.info] }, gfn2ShapeNotes(next));
          } else if (shown.engine === 'atom') {
            run = { info: ['A single atom is a point: there is no geometry to optimise, and GFN2-xTB is not asked '
              + 'to. Its charge, spin and orbitals come from GFN2-xTB\'s single point, as for any structure.'] };
          } else {
            // the structure on screen is a starting guess, and bond lengths and
            // angles read off it mean little: something wrong, said in sight
            run = {
              warnings: [`Unoptimised structure — ${shown.unrefinedReason ?? 'GFN2-xTB did not run'}.`],
              attention: ['The structure shown is the embedder\'s starting guess: ideal VSEPR directions and '
                + 'typical bond lengths, not an energy minimum. Read its shape, not its numbers.'],
            };
          }
          const builtLocally = metal && !forceLocal && shown.engine !== 'atom'
            ? [`Built locally, without asking PubChem or CIR: the sketch contains a metal (${metal}). PubChem has `
              + 'no 3D structure for most metal compounds, and CIR builds them by rule, roughly.']
            : [];
          const method = shown.engine === 'gfn2' || shown.engine === 'held' ? [GFN2_NOTE] : [];
          const notes = joinNotes(
            { warnings: onRequest ? [onRequest] : [] }, run, { warnings: shown.warnings },
            { info: [...builtLocally, ...snapped.info, ...method] },
          );
          const source = shown.engine === 'unrefined' ? 'local' : shown.engine === 'atom' ? 'atom' : 'gfn2';
          showMoleculeHeader(next, { source, ...notes });
          // a held structure has its own charges, and no vibrations (it is not a minimum)
          const charges = shown.engine === 'held' ? shown.held?.charges ?? null : shown.gfn2?.charges ?? null;
          const noMinimum = onRequest ? SET_ASIDE_NO_MINIMUM : shown.engine === 'held' ? HELD_NO_MINIMUM : null;
          showMolecule(ctx, next, charges, shown.engine === 'gfn2' ? shown.gfn2?.vibrations ?? null : null, noMinimum);
          if (shown.engine === 'gfn2' && shown.gfn2 && !shown.gfn2.converged) offerContinue();
        };

        // A free result that changed the bonding is set aside, and the molecule
        // drawn shown — held, or the start — but the change may be the
        // chemistry (an open carbocation, an isomerization), so the header
        // offers the free result, and back again.
        const setAside = local.setAside;
        const back = local.engine === 'held' ? 'Show the held structure' : 'Show the unoptimised start';
        const showDrawn = () => {
          present(local);
          if (setAside) offerSetAside('Show GFN2-xTB\'s result', showSetAside);
        };
        const showSetAside = () => {
          present(setAside!, freeOnRequest(local.bondingChange ?? 'its bonding changed'));
          offerSetAside(back, showDrawn);
        };
        showDrawn();
        console.log('[render-timing]', {
          jsme: +(t1 - t0).toFixed(1),
          parse: +(t2 - t1).toFixed(1),
          fetch: +(t3 - t2).toFixed(1),
          local: +(t4 - t3).toFixed(1),
        });
      }
    } finally {
      renderBtn.textContent = 'Build 3D model';
      renderBtn.disabled = false;
      hideLoading();
    }
  };

  // GFN2-xTB refinement of the structure on screen, on demand — chiefly for a
  // fetched PubChem/CIR conformer, which is a force-field geometry. The engine
  // is ~3 MB of wasm, preloaded inside its worker at startup. A cancelled
  // or failed run leaves the structure as it was.
  // The same refinement is the header's "Keep optimising" (offerContinue): a
  // run that stopped short is on screen as the best it reached, and another
  // run from there, with a fresh budget, is exactly what continuing means.
  const gfn2Btn = document.getElementById('ctrl-gfn2-refine') as HTMLButtonElement | null;
  refineOnScreen = async (hessianSeconds?: number) => {
    const current = ctx.currentMolecule;
    if (!current) return;
    if (current.atoms.length === 1) {
      showRenderError('A single atom is a point — there is no geometry to refine.');
      return;
    }
    // A chosen spin must fit the electron count: an even count pairs into
    // singlets, triplets, quintets; an odd one into doublets, quartets, sextets.
    const spinChoice = (document.getElementById('ctrl-gfn2-spin') as HTMLSelectElement | null)?.value ?? 'auto';
    const chosenSpin = spinChoice === 'auto' ? null : Number(spinChoice);
    if (chosenSpin !== null && chosenSpin % 2 !== lowestMultiplicity(current.atoms) % 2) {
      const odd = lowestMultiplicity(current.atoms) === 2;
      showRenderError(`A ${spinName(chosenSpin)} needs an ${odd ? 'even' : 'odd'} number of electrons, and this `
        + `structure has an ${odd ? 'odd' : 'even'} number — choose ${odd ? 'a doublet, quartet or sextet' : 'a singlet, triplet or quintet'}.`);
      return;
    }
    const molecule = chosenSpin === null ? current : { ...current, multiplicity: chosenSpin };
    if (gfn2Btn) {
      gfn2Btn.textContent = 'Refining...';
      gfn2Btn.disabled = true;
    }
    hideRenderError();
    showLoading('Starting GFN2-xTB…', true);
    try {
      const thermo = hessianSeconds !== undefined;
      const refined = await refineWithGfn2(molecule, trackGfn2Progress(hessianSeconds ?? null), thermo);
      if (!refined) {
        showRenderError('GFN2-xTB found no usable geometry from this structure — the geometry is unchanged.');
        return;
      }
      // the same guard as the local pipeline's: a drawn bond stretched,
      // shown dashed; one came apart or a new one formed, the held structure
      // shown (or the screen left as it was), and GFN2's result offered
      const verdict = assessBonding(refined.molecule, refined.bondOrders, refined.bondOrderMatrix);
      const show = (onRequest?: string) => {
        const snapped = snapToSymmetry(markBondingChanges(refined.molecule, verdict));
        const next = snapped.molecule;
        showMolecule(ctx, next, refined.charges, refined.vibrations, onRequest ? SET_ASIDE_NO_MINIMUM : null);
        // The MMFF94 parameter-gap warnings are deliberately NOT repeated here:
        // the geometry no longer comes from MMFF94, so calling it "approximate"
        // would be stale.
        const notes = joinNotes({ warnings: onRequest ? [onRequest] : [] }, gfn2RunNotes(refined),
          { info: verdict.partial }, gfn2ShapeNotes(next), { info: [...snapped.info, GFN2_NOTE] });
        showMoleculeHeader(next, { source: 'gfn2', ...notes, spinChosen: chosenSpin !== null });
        if (!refined.converged) offerContinue();
      };
      const change = verdict.formed ?? verdict.broken;
      if (!change) {
        show();
        return;
      }
      const held = refined.held;
      if (!held) {
        showRenderError(`GFN2-xTB's result no longer had the bonds drawn (${change}) — the geometry is unchanged.`);
        offerSetAside('Show GFN2-xTB\'s result', () => {
          hideRenderError();
          show(freeOnRequest(change));
        });
        return;
      }
      const showHeld = () => {
        const snapped = snapToSymmetry(markBondingChanges(held.molecule, { stretched: verdict.stretched, formedPairs: [] }));
        const next = snapped.molecule;
        showMolecule(ctx, next, held.charges, null, HELD_NO_MINIMUM);
        const notes = heldNotes(held, refined, change);
        showMoleculeHeader(next, {
          source: 'gfn2', spinChosen: chosenSpin !== null,
          ...joinNotes({ warnings: [notes.warning], attention: [notes.info] }, gfn2ShapeNotes(next),
            { info: [...snapped.info, GFN2_NOTE] }),
        });
        offerSetAside('Show GFN2-xTB\'s result', () => {
          show(freeOnRequest(change));
          offerSetAside('Show the held structure', showHeld);
        });
      };
      showHeld();
    } catch (error) {
      showRenderError(error instanceof Gfn2Cancelled
        ? 'GFN2-xTB refinement cancelled — the geometry is unchanged.'
        : error instanceof Gfn2Unavailable
          ? `GFN2-xTB is unavailable: ${error.message}. The geometry is unchanged.`
          : 'GFN2-xTB refinement failed — the geometry is unchanged.');
    } finally {
      if (gfn2Btn) {
        gfn2Btn.textContent = 'Refine with GFN2-xTB';
        gfn2Btn.disabled = false;
      }
      hideLoading();
    }
  };
  if (gfn2Btn) gfn2Btn.onclick = () => { void refineOnScreen(); };

  // The sketcher docks to a slim Build rail — a workspace preference that
  // survives reloads, like the Orbitals rail.
  const jsmeCollapse = document.getElementById('jsme-collapse') as HTMLButtonElement | null;
  const jsmeRail = document.getElementById('jsme-rail') as HTMLButtonElement | null;
  jsmeCollapse?.addEventListener('click', () => setJsmeCollapsed(true));
  jsmeRail?.addEventListener('click', () => setJsmeCollapsed(false));
  try {
    if (localStorage.getItem(JSME_COLLAPSED_KEY) === '1') {
      document.getElementById('jsme-panel')?.classList.add('collapsed');
    }
  } catch {
    // no storage: open every time
  }
}
