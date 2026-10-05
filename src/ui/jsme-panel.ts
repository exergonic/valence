import type { SceneContext } from '../render';
import { rebuildDisplay, buildScene } from '../render';
import { parseMolBlock } from '../mol-parser';
import type { Molecule } from '../mol-parser';
import { kekulizeSmiles } from '../chem/kekulize-smiles';
import { computeLocalGeometry } from '../geometry/local-geometry';
import {
  cancelGfn2, Gfn2Cancelled, Gfn2Unavailable, refineWithGfn2, GFN2_NOTE, HESSIAN_SADDLE_THRESHOLD, type Gfn2Progress, type Gfn2Result,
} from '../geometry/gfn2-refine';
import { parameterGapWarnings } from '../geometry/parameter-warnings';
import { ringPuckerWarnings } from '../geometry/ring-pucker';
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
 * of the pipeline, after the source (PubChem, CIR, or our own MMFF94) has had
 * its say. Every source leaves a symmetric molecule a little asymmetric
 * (measured: 0.2 mÅ in the stiff coordinates, up to 20 mÅ in the soft ones),
 * which reads as a distorted molecule and splits degenerate orbitals. The
 * snap is reported, never silent, and can be turned off.
 */
function snapToSymmetry(molecule: Molecule): { molecule: Molecule; info: string[] } {
  const enabled = (document.getElementById('ctrl-symmetrize') as HTMLInputElement | null)?.checked ?? true;
  if (!enabled) return { molecule, info: [] };
  const snapped = symmetrizeMolecule(molecule);
  if (snapped.order <= 1) return { molecule, info: [] };
  return {
    molecule: { atoms: snapped.atoms, bonds: molecule.bonds },
    info: [
      `Symmetry: ${snapped.symbol} — the geometry was snapped to the point group it nearly has `
      + `(atoms moved at most ${(snapped.maxShift * 1000).toFixed(2)} mÅ). Turn off "Snap to point group" to see it raw.`,
    ],
  };
}

/**
 * The structural warnings and the model caveats for a displayed structure.
 * `source` is where the GEOMETRY came from. A fetched structure (PubChem, CIR)
 * is a force-field conformer — PubChem's are MMFF94 — so the parameter-gap
 * report ("geometry approximate") and the 3-ring pucker check
 * (ring-pucker.ts: MMFF94's reference-angle artifact, reported, never
 * repaired) apply to it. A local structure is GFN2's or the unoptimised start,
 * and neither is MMFF94's. The dipole's caveats depend on which charge model
 * is on screen, so the dipole readout carries them (render/rebuild.ts).
 */
function composeNotes(
  warnings: string[],
  molecule: Molecule,
  source: 'fetched' | 'local',
): { warnings: string[]; info: string[] } {
  const info = source === 'fetched' ? [...parameterGapWarnings(molecule), ...ringPuckerWarnings(molecule)] : [];
  return { warnings, info };
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
  if (run.lowestHessianMode === null) {
    notes.push('GFN2-xTB Hessian check skipped (above 16 atoms, where it costs more than the optimisation): '
      + 'the structure is a converged stationary point, not verified to be a minimum.');
  } else if (run.lowestHessianMode < HESSIAN_SADDLE_THRESHOLD) {
    notes.push('GFN2-xTB converged to a saddle, not a minimum — the lowest Hessian mode is imaginary '
      + `(λ = ${run.lowestHessianMode.toFixed(3)} Eh/bohr²)`
      + (run.saddleEscapes > 0 ? `, and pushing it down that mode (${escapes}) found nothing lower` : '')
      + ', so the geometry on screen is that stationary point.');
  } else {
    // The raw Hessian's lowest eigenvalue at a minimum is a rigid-body zero
    // mode (~0 ± the FD noise floor), not a number worth printing.
    notes.push(run.saddleEscapes > 0
      ? `GFN2-xTB first converged to a saddle point; pushed down its imaginary mode (${escapes}) and `
        + 're-optimised, it reached a minimum — no imaginary mode.'
      : 'GFN2-xTB Hessian: minimum — no imaginary mode.');
  }
  return notes;
}

/**
 * Put a geometry in the scene. `gfn2Charges` rides along only when the GFN2
 * tier produced this structure — they belong to exactly this atom list, and
 * buildScene drops the pairing if it is ever broken.
 */
function showMolecule(ctx: SceneContext, molecule: Molecule, gfn2Charges: number[] | null) {
  ctx.currentMolecule = molecule;
  ctx.gfn2Charges =
    gfn2Charges && gfn2Charges.length === molecule.atoms.length ? { molecule, charges: gfn2Charges } : null;
  buildScene(ctx);
}

function updateMoleculeInfo(info: PubChemInfo & { info?: string[] }) {
  const container = document.getElementById('molecule-info')!;
  const formulaEl = document.getElementById('mol-formula')!;
  const nameEl = document.getElementById('mol-name')!;
  const weightEl = document.getElementById('mol-weight')!;
  const sourceEl = document.getElementById('mol-source')!;
  const linkEl = document.getElementById('mol-link') as HTMLAnchorElement;

  container.classList.remove('hidden');
  formulaEl.textContent = info.formula || '';
  nameEl.textContent = info.name ? ` · ${info.name}` : '';
  weightEl.textContent = info.weight ? ` · MW ${info.weight}` : '';
  sourceEl.textContent = info.source === 'pubchem' ? 'PubChem 3D' :
    info.source === 'cir' ? 'CIR' :
    info.source === 'gfn2' ? 'GFN2-xTB' :
    'Unoptimised';
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

  // Verbose model caveats go to the Info log at the bottom of the right
  // panel, not the molecule header (one line, white-space nowrap — a long
  // paragraph there is unreadable). The log exists only while a molecule
  // has notes to show.
  const infoEl = document.getElementById('panel-info')!;
  const itemsEl = document.getElementById('panel-info-items')!;
  const notes = info.info ?? [];
  itemsEl.replaceChildren();
  for (const note of notes) {
    const item = document.createElement('div');
    item.className = 'panel-info-item';
    item.textContent = note;
    itemsEl.appendChild(item);
  }
  infoEl.classList.toggle('hidden', notes.length === 0);

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

export function mountJsmePanel(ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')! as HTMLButtonElement;
  ctx.rerender = () => rebuildDisplay(ctx);
  document.getElementById('render-error-close')!.onclick = hideRenderError;

  renderBtn.onclick = async () => {
    const applet = window.jsmeApplet;
    if (!applet) return;

    renderBtn.textContent = 'Loading...';
    renderBtn.disabled = true;
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
      let molecule = parseMolBlock(molBlock);
      // The GFN2 tier hands back its own charges with the geometry; the fetch
      // and MMFF94 paths have none to offer.
      let gfn2Charges: number[] | null = null;
      const t2 = performance.now();
      if (molecule.atoms.length === 0) return;

      const forceLocal = (document.getElementById('ctrl-force-fallback') as HTMLInputElement | null)?.checked ?? false;
      const result = forceLocal ? null : await fetch3D(smiles, molecule);
      const t3 = performance.now();
      if (result) {
        // fetch3D validates the returned structure against the sketch and
        // returns the parsed molecule — no re-parse here.
        molecule = result.molecule;
        const snapped = snapToSymmetry(molecule);
        molecule = snapped.molecule;
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        const notes = composeNotes(result.info.warnings ?? [], molecule, 'fetched');
        notes.info.push(...snapped.info);
        updateMoleculeInfo({
          ...result.info,
          formula,
          weight: `${weight}`,
          warnings: notes.warnings,
          info: notes.info,
        });
      } else {
        // GFN2 is the only local engine: the first run downloads ~3 MB, and a
        // larger molecule takes tens of seconds, so the overlay counts as it
        // goes and Cancel shows the unoptimised start instead.
        showLoading('Loading GFN2-xTB (first use downloads ~3 MB)…', true);
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
        molecule = local.molecule;
        gfn2Charges = local.gfn2?.charges ?? null;
        const snapped = snapToSymmetry(molecule);
        molecule = snapped.molecule;
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        const notes = composeNotes(local.warnings, molecule, 'local');
        if (local.engine === 'gfn2' && local.gfn2) {
          if (!local.gfn2.converged) notes.warnings.unshift('GFN2-xTB structure, not fully converged.');
          notes.info.push(GFN2_NOTE, ...gfn2RunNotes(local.gfn2));
        } else {
          // Said in the header, not just the log: the structure on screen is a
          // starting guess, and bond lengths and angles read off it mean little.
          notes.warnings.unshift(`Unoptimised structure — ${local.unrefinedReason ?? 'GFN2-xTB did not run'}.`);
          notes.info.push(
            'The structure shown is the embedder\'s starting guess: ideal VSEPR directions and typical bond '
            + 'lengths, not an energy minimum. Read its shape, not its numbers.',
          );
        }
        notes.info.push(...snapped.info);
        updateMoleculeInfo({
          source: local.engine === 'gfn2' ? 'gfn2' : 'local',
          formula,
          weight: `${weight}`,
          // The stereo-enforcement failures ride out of the worker with the
          // molecule; the parameter-gap report is composed here (the header keeps the structural warnings, the
          // verbose caveats go to the panel's Info log).
          warnings: notes.warnings,
          info: notes.info,
        });
        console.log('[render-timing]', {
          jsme: +(t1 - t0).toFixed(1),
          parse: +(t2 - t1).toFixed(1),
          fetch: +(t3 - t2).toFixed(1),
          local: +(t4 - t3).toFixed(1),
        });
      }

      showMolecule(ctx, molecule, gfn2Charges);
    } finally {
      renderBtn.textContent = 'Render Molecule';
      renderBtn.disabled = false;
      hideLoading();
    }
  };

  // GFN2-xTB refinement of the structure on screen, on demand — chiefly for a
  // fetched PubChem/CIR conformer, which is a force-field geometry. The engine
  // is ~3 MB of wasm, loaded lazily inside its worker on first use. A cancelled
  // or failed run leaves the structure as it was.
  const gfn2Btn = document.getElementById('ctrl-gfn2-refine') as HTMLButtonElement | null;
  if (gfn2Btn) {
    gfn2Btn.onclick = async () => {
      const molecule = ctx.currentMolecule;
      if (!molecule) return;
      gfn2Btn.textContent = 'Refining...';
      gfn2Btn.disabled = true;
      hideRenderError();
      showLoading('Loading GFN2-xTB (first use downloads ~3 MB)…', true);
      try {
        const refined = await refineWithGfn2(molecule, trackGfn2Progress());
        if (!refined) {
          showRenderError('GFN2-xTB found no usable geometry from this structure — the geometry is unchanged.');
          return;
        }
        const snapped = snapToSymmetry(refined.molecule);
        const next = snapped.molecule;
        showMolecule(ctx, next, refined.charges);
        const { formula, weight } = computeFormula(next.atoms.map(a => a.element));
        // The MMFF94 parameter-gap warnings are deliberately NOT repeated here:
        // the geometry no longer comes from MMFF94, so calling it "approximate"
        // would be stale.
        const info = [GFN2_NOTE, ...gfn2RunNotes(refined), ...snapped.info];
        updateMoleculeInfo({ source: 'gfn2', formula, weight: `${weight}`, warnings: refined.converged ? [] : ['GFN2-xTB structure, not fully converged.'], info });
      } catch (error) {
        showRenderError(error instanceof Gfn2Cancelled
          ? 'GFN2-xTB refinement cancelled — the geometry is unchanged.'
          : error instanceof Gfn2Unavailable
            ? `GFN2-xTB is unavailable: ${error.message}. The geometry is unchanged.`
            : 'GFN2-xTB refinement failed — the geometry is unchanged.');
      } finally {
        gfn2Btn.textContent = 'Refine with GFN2-xTB';
        gfn2Btn.disabled = false;
        hideLoading();
      }
    };
  }

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
