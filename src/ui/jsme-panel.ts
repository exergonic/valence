import { assessBonding, markBondingChanges } from '../geometry/bond-integrity';
import type { SceneContext } from '../render';
import { rebuildDisplay, buildScene } from '../render';
import { parseMolBlock } from '../mol-parser';
import type { Molecule } from '../mol-parser';
import { writeNote, type InfoNote } from './info-note';
import { kekulizeSmiles } from '../chem/kekulize-smiles';
import { fillMissingHydrogens } from '../chem/fill-hydrogens';
import { chargedXAtoms, parseChargedLabel } from './charged-x-atoms';
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

function hideLoading() {
  document.getElementById('loading-overlay')!.classList.add('hidden');
  document.getElementById('loading-cancel')!.classList.add('hidden');
}

/**
 * The overlay's running account of a GFN2 run: what stage it is in, how many
 * energy evaluations it has made, the lowest energy so far and the time spent.
 * A larger molecule takes tens of seconds, and a counter that moves is the
 * difference between "working" and "hung".
 */
function trackGfn2Progress(): (progress: Gfn2Progress) => void {
  const started = performance.now();
  return (progress) => {
    const stage = progress.stage === 'optimising' ? 'Optimising with GFN2-xTB…'
      : progress.stage === 'curvature' ? 'Checking the curvature (numerical Hessian)…'
      : progress.stage === 'holding' ? 'The bonding changed — relaxing the molecule drawn with its bonds held…'
      : 'Converged to a saddle point — pushing it downhill and re-optimising…';
    document.getElementById('loading-text')!.textContent = stage;
    const seconds = ((performance.now() - started) / 1000).toFixed(0);
    const energy = progress.energyHartree === null ? '' : ` · E ${progress.energyHartree.toFixed(5)} Eh`;
    document.getElementById('loading-detail')!.textContent =
      `${progress.evaluations} energy evaluations${energy} · ${seconds} s`;
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
      `Symmetry: ${snapped.symbol} — the geometry was snapped to the point group it nearly has `
      + `(atoms moved at most ${(snapped.maxShift * 1000).toFixed(2)} mÅ). Turn off "Snap to point group" to see it raw.`,
    ],
  };
}

/**
 * The caveats on a PubChem structure, for the Info log. Only PubChem's
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
function mmff94ConformerCaveats(molecule: Molecule): (string | InfoNote)[] {
  return [...parameterGapWarnings(molecule), ...ringPuckerWarnings(molecule)];
}

/** The spin control under Refine: back to the lowest allowed spin, for a new
 *  structure — a triplet chosen for one molecule says nothing of the next. */
export function resetGfn2Spin(): void {
  const spin = document.getElementById('ctrl-gfn2-spin') as HTMLSelectElement | null;
  if (spin) spin.value = 'auto';
}

/** Said whenever a run was not a singlet, so an open-shell structure is
 *  never silently one: which spin, and why that one. */
function gfn2SpinNote(run: Gfn2Result, molecule: Molecule, chosen: boolean): string[] {
  if (run.multiplicity === 1) return [];
  const name = spinName(run.multiplicity);
  if (chosen) return [`GFN2-xTB ran as a ${name}, the spin chosen under Refine.`];
  if (run.multiplicity === lowestMultiplicity(molecule.atoms)) {
    return [`GFN2-xTB ran as a ${name}: the electron count is odd, so a singlet is impossible and a doublet `
      + 'is the lowest spin it allows. A different spin can be chosen under Refine.'];
  }
  return [`GFN2-xTB ran as a ${name}, this structure's own spin.`];
}

/**
 * What a converged GFN2 run says about itself: the convergence line, and the
 * curvature. A gradient-based stop cannot tell a minimum from a saddle — both
 * have zero gradient — so the Hessian is what lets the app say which one is on
 * screen, and when the run was pushed off a saddle, it says that too.
 */
function gfn2RunNotes(run: Gfn2Result): string[] {
  const seconds = (run.milliseconds / 1000).toFixed(1);
  if (!run.converged) {
    // No curvature verdict either: the Hessian runs only on a converged point.
    return [
      `GFN2-xTB stopped after ${run.iterations} steps (${seconds} s) before full convergence. The structure `
        + `shown is the lowest-energy point it reached (${run.energyHartree.toFixed(6)} Eh): its shape is `
        + 'reliable, its last few hundredths of an ångström are not.',
    ];
  }
  const notes = [
    `GFN2-xTB converged in ${run.iterations} steps to ${run.energyHartree.toFixed(6)} Eh (${seconds} s).`,
  ];
  const escapes = run.saddleEscapes === 1 ? 'once' : `${run.saddleEscapes} times`;
  if (run.lowestFrequency === null) {
    notes.push('GFN2-xTB Hessian check skipped (above 16 atoms, where it costs more than the optimisation): '
      + 'the structure is a converged stationary point, not verified to be a minimum.');
  } else if (run.lowestFrequency < SADDLE_FREQUENCY_THRESHOLD) {
    notes.push('GFN2-xTB converged to a saddle, not a minimum — the lowest vibration is imaginary '
      + `(${Math.abs(run.lowestFrequency).toFixed(0)}i cm⁻¹)`
      + (run.saddleEscapes > 0 ? `, and pushing it down that mode (${escapes}) did not reach a minimum` : '')
      + ', so the geometry on screen is that stationary point.');
  } else {
    notes.push(run.saddleEscapes > 0
      ? `GFN2-xTB first converged to a saddle point; pushed down its imaginary mode (${escapes}) and `
        + 're-optimised, it reached a minimum — no imaginary mode.'
      : 'GFN2-xTB Hessian: minimum — no imaginary mode.');
  }
  return notes;
}

/** The charges the sketch holds on X atoms (charged-x-atoms.ts): the V2000
 *  block names such an atom by its label ("I-", or "Q"), the V3000 block
 *  keeps the label whole. */
function withXAtomCharges(molecule: Molecule, v3000: string): Molecule {
  const labels = chargedXAtoms(v3000);
  if (labels.size === 0) return molecule;
  const atoms = molecule.atoms.map((atom, i) => {
    const charged = parseChargedLabel(labels.get(i) ?? '');
    return charged ? { ...atom, element: charged.element, charge: charged.charge } : atom;
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
function gfn2ShapeNotes(molecule: Molecule): string[] {
  return vseprShapeMismatches(molecule).map((m) => {
    const atom = `${molecule.atoms[m.atomIndex].element}${m.atomIndex + 1}`;
    const found = m.measured ? `${m.measured} (bond angles ${m.measuredAngles})` : `bond angles ${m.measuredAngles}`;
    return `${atom} is not the shape VSEPR predicts. VSEPR: ${m.formula}, ${m.predicted} (bond angles `
      + `${m.predictedAngles}). GFN2-xTB: ${found}. Either can be wrong — VSEPR is a counting rule, GFN2-xTB a `
      + 'semiempirical model — and experiment decides between them.';
  });
}

/**
 * Put a geometry in the scene. `gfn2Charges` rides along only when the GFN2
 * tier produced this structure — they belong to exactly this atom list, and
 * buildScene drops the pairing if it is ever broken.
 */
function showMolecule(ctx: SceneContext, molecule: Molecule, gfn2Charges: number[] | null, vibrations: NormalMode[] | null = null) {
  ctx.currentMolecule = molecule;
  ctx.gfn2Charges =
    gfn2Charges && gfn2Charges.length === molecule.atoms.length ? { molecule, charges: gfn2Charges } : null;
  // the snap moved atoms by under a milliångström, so the minimum's modes still describe it
  ctx.vibrations = vibrations && vibrations.length > 0 ? { molecule, modes: vibrations } : null;
  ctx.display.vibrationIndex = null;
  buildScene(ctx);
}

/**
 * Verbose model caveats go to the Info log at the bottom of the right panel,
 * not the molecule header (one line, white-space nowrap — a long paragraph
 * there is unreadable). The log exists only while a molecule has notes to
 * show, and every new molecule replaces them.
 */
function showInfoLog(notes: (string | InfoNote)[]) {
  const infoEl = document.getElementById('panel-info')!;
  const itemsEl = document.getElementById('panel-info-items')!;
  itemsEl.replaceChildren();
  for (const note of notes) {
    const item = document.createElement('div');
    item.className = 'panel-info-item';
    writeNote(item, note);
    itemsEl.appendChild(item);
  }
  infoEl.classList.toggle('hidden', notes.length === 0);
}

/** What the header shows besides the formula and weight, which are read off
 *  the molecule itself. */
type HeaderInfo = Omit<PubChemInfo, 'source' | 'formula' | 'weight'> & {
  source: PubChemInfo['source'] | 'example' | 'atom';
  info?: (string | InfoNote)[];
};

const SOURCE_LABEL: Record<HeaderInfo['source'], string> = {
  pubchem: 'PubChem 3D', cir: 'CIR', gfn2: 'GFN2-xTB', local: 'Unoptimised', example: 'Example', atom: 'Single atom',
};

/**
 * The molecule header over the scene — formula, name, weight, where the
 * structure came from, its warnings — and the Info log beneath the inspector.
 * Every path that puts a structure on screen (a build, a refinement, an
 * example) comes through here.
 */
export function showMoleculeHeader(molecule: Molecule, info: HeaderInfo) {
  const { formula, weight } = computeFormula(molecule.atoms.map((a) => a.element));
  const container = document.getElementById('molecule-info')!;
  const formulaEl = document.getElementById('mol-formula')!;
  const nameEl = document.getElementById('mol-name')!;
  const weightEl = document.getElementById('mol-weight')!;
  const sourceEl = document.getElementById('mol-source')!;
  const linkEl = document.getElementById('mol-link') as HTMLAnchorElement;

  container.classList.remove('hidden');
  formulaEl.textContent = formula;
  nameEl.textContent = info.name ? ` · ${info.name}` : '';
  weightEl.textContent = weight ? ` · MW ${weight}` : '';
  sourceEl.textContent = SOURCE_LABEL[info.source];
  sourceEl.className = info.source;

  if (info.cid) {
    linkEl.href = `https://pubchem.ncbi.nlm.nih.gov/compound/${info.cid}`;
    linkEl.style.display = '';
  } else {
    linkEl.style.display = 'none';
  }

  // Show warnings if present
  const warningsEl = document.getElementById('mol-warnings')!;
  warningsEl.classList.toggle('hidden', !(info.warnings && info.warnings.length > 0));
  warningsEl.textContent = info.warnings?.join('\n') ?? '';

  showInfoLog(info.info ?? []);
  document.getElementById('mol-set-aside')!.classList.add('hidden');
  document.getElementById('mol-continue')!.classList.add('hidden');

  // Collapsible PubChem record — only populated on successful PubChem lookups.
  const dataDetails = document.getElementById('mol-data')!;
  const rowsEl = document.getElementById('mol-data-rows')!;
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
    const populated = rows.filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0);

    rowsEl.replaceChildren(...populated.map(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'data-row';
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    }));
    document.getElementById('mol-data-cid')!.textContent = `#${info.cid}`;
    dataDetails.classList.remove('hidden');
  } else {
    dataDetails.classList.add('hidden');
  }
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
 *  control's, set when the panel mounts. */
let refineOnScreen: () => Promise<void> = async () => {};

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

/** What the header and the Info log say of a held structure: GFN2's free
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
      let molecule = withXAtomCharges(parseMolBlock(molBlock), applet.molFile(true));
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
      const result = forceLocal || metal || atom ? null : await fetch3D(smiles, molecule);
      const t3 = performance.now();
      if (result) {
        // fetch3D validates the returned structure against the sketch and
        // returns the parsed molecule — no re-parse here.
        molecule = result.molecule;
        const snapped = snapToSymmetry(molecule);
        molecule = snapped.molecule;
        const caveats = result.info.source === 'pubchem' ? mmff94ConformerCaveats(molecule) : [];
        showMoleculeHeader(molecule, { ...result.info, info: [...caveats, ...snapped.info] });
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
        // One local geometry on screen: the header, the Info log, the scene.
        // `onRequest` is said first in the header when it is a set-aside
        // result the user asked to see.
        const present = (shown: LocalGeometry, onRequest?: string) => {
          const snapped = snapToSymmetry(shown.molecule);
          const next = snapped.molecule;
          // the header keeps the structural warnings (a drawn wedge the engine
          // could not keep among them); the verbose caveats go to the Info log
          const notes: { warnings: string[]; info: (string | InfoNote)[] } = { warnings: [...shown.warnings], info: [] };
          if (shown.engine === 'gfn2' && shown.gfn2) {
            if (!shown.gfn2.converged) notes.warnings.unshift('GFN2-xTB structure, not fully converged.');
            notes.info.push(GFN2_NOTE, ...gfn2RunNotes(shown.gfn2), ...(shown.partialBonds ?? []),
              ...gfn2ShapeNotes(next), ...gfn2SpinNote(shown.gfn2, shown.molecule, false));
          } else if (shown.engine === 'held' && shown.held && shown.gfn2) {
            const held = heldNotes(shown.held, shown.gfn2, shown.bondingChange ?? 'its bonding changed');
            notes.warnings.unshift(held.warning);
            notes.info.push(GFN2_NOTE, held.info, ...gfn2ShapeNotes(next),
              ...gfn2SpinNote(shown.gfn2, shown.molecule, false));
          } else if (shown.engine === 'atom') {
            notes.info.push('A single atom is a point: there is no geometry to optimise, and GFN2-xTB is not asked '
              + 'to. Its charge, spin and orbitals come from GFN2-xTB\'s single point, as for any structure.');
            // with no run to report it, the spin is said here (a non-singlet always says why)
            const spin = shown.molecule.multiplicity ?? lowestMultiplicity(shown.molecule.atoms);
            if (spin > 1) {
              notes.info.push(`The single point runs as a ${spinName(spin)}: the electron count is odd, so a singlet `
                + 'is impossible and a doublet is the lowest spin it allows.');
            }
          } else {
            // Said in the header, not just the log: the structure on screen is a
            // starting guess, and bond lengths and angles read off it mean little.
            notes.warnings.unshift(`Unoptimised structure — ${shown.unrefinedReason ?? 'GFN2-xTB did not run'}.`);
            notes.info.push(
              'The structure shown is the embedder\'s starting guess: ideal VSEPR directions and typical bond '
              + 'lengths, not an energy minimum. Read its shape, not its numbers.',
            );
          }
          if (onRequest) notes.warnings.unshift(onRequest);
          if (metal && !forceLocal && shown.engine !== 'atom') {
            notes.info.push(`Built locally, without asking PubChem or CIR: the sketch contains a metal (${metal}). `
              + 'PubChem has no 3D structure for most metal compounds, and CIR builds them by rule, roughly.');
          }
          notes.info.push(...snapped.info);
          const source = shown.engine === 'unrefined' ? 'local' : shown.engine === 'atom' ? 'atom' : 'gfn2';
          showMoleculeHeader(next, { source, ...notes });
          // a held structure has its own charges, and no vibrations (it is not a minimum)
          const charges = shown.engine === 'held' ? shown.held?.charges ?? null : shown.gfn2?.charges ?? null;
          showMolecule(ctx, next, charges, shown.engine === 'gfn2' ? shown.gfn2?.vibrations ?? null : null);
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
  refineOnScreen = async () => {
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
      const refined = await refineWithGfn2(molecule, trackGfn2Progress());
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
        showMolecule(ctx, next, refined.charges, refined.vibrations);
        // The MMFF94 parameter-gap warnings are deliberately NOT repeated here:
        // the geometry no longer comes from MMFF94, so calling it "approximate"
        // would be stale.
        const info = [GFN2_NOTE, ...gfn2RunNotes(refined), ...verdict.partial, ...gfn2ShapeNotes(next),
          ...gfn2SpinNote(refined, molecule, chosenSpin !== null), ...snapped.info];
        const warnings = refined.converged ? [] : ['GFN2-xTB structure, not fully converged.'];
        if (onRequest) warnings.unshift(onRequest);
        showMoleculeHeader(next, { source: 'gfn2', warnings, info });
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
        showMolecule(ctx, next, held.charges, null);
        const notes = heldNotes(held, refined, change);
        showMoleculeHeader(next, { source: 'gfn2', warnings: [notes.warning],
          info: [GFN2_NOTE, notes.info, ...gfn2ShapeNotes(next), ...gfn2SpinNote(refined, molecule, chosenSpin !== null), ...snapped.info] });
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
  if (gfn2Btn) gfn2Btn.onclick = refineOnScreen;

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
