import type { SceneContext } from '../render';
import { rebuildDisplay, buildScene } from '../render';
import { parseMolBlock } from '../mol-parser';
import type { Molecule } from '../mol-parser';
import { kekulizeSmiles } from '../chem/kekulize-smiles';
import { computeLocalGeometry } from '../geometry/local-geometry';
import { refineWithGfn2, GFN2_NOTE, HESSIAN_SADDLE_THRESHOLD } from '../geometry/gfn2-refine';
import { parameterGapWarnings } from '../geometry/parameter-warnings';
import { ringPuckerWarnings } from '../geometry/ring-pucker';
import { fetch3D, computeFormula } from '../geometry/resolve3d';
import { symmetrizeMolecule } from '../geometry/symmetrize';
import type { PubChemInfo } from '../geometry/resolve3d';
import { computeDipole, DIPOLE_APPROXIMATE, DIPOLE_RESIDUAL_CHARGE } from '../chem/charge-model/dipole';
import type { DipoleResult } from '../chem/charge-model/dipole';

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

function showLoading(text: string) {
  const overlay = document.getElementById('loading-overlay')!;
  const loadingText = document.getElementById('loading-text')!;
  loadingText.textContent = text;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay')!.classList.add('hidden');
}

function showRenderError(text: string) {
  const banner = document.getElementById('render-error')!;
  document.getElementById('render-error-text')!.textContent = text;
  banner.classList.remove('hidden');
}

function hideRenderError() {
  document.getElementById('render-error')!.classList.add('hidden');
}

// The dipole runs on MMFF94 BCI partial charges; on generic parameters
// (hypervalent centers, ...) those charges are approximate, and an ion the
// type space cannot represent (the carbanion C⁻) gets its drawn charge
// placed by hand. Either way the readout would silently overstate itself.
// The caveat prose is far too long for the one-line molecule header, so it
// goes to the panel's Info log (bottom of the right panel) and the header
// keeps only the short structural warnings — the stereo notes from the
// pipeline.
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

function composeNotes(
  warnings: string[],
  molecule: Molecule,
  dipole: DipoleResult | null,
  engine?: 'mmff94' | 'gfn2',
): { warnings: string[]; info: string[] } {
  // The parameter-gap warnings are phrased about the geometry ("refined
  // geometry approximate"), so they only apply when MMFF94 produced it. The
  // charge model still runs on those parameters either way, which is what the
  // dipole caveats below are for.
  const gaps = engine === 'gfn2' ? [] : parameterGapWarnings(molecule);
  const info = [...gaps];
  // A puckered trigonal 3-ring centre is MMFF94's reference-angle artifact
  // (ring-pucker.ts) — reported, never repaired. The GFN2 tier gets those
  // centres right on its own, so the check runs only on other sources.
  if (engine !== 'gfn2') info.push(...ringPuckerWarnings(molecule));
  if (dipole && gaps.length > 0) info.push(DIPOLE_APPROXIMATE);
  if (dipole?.residualCharge) info.push(DIPOLE_RESIDUAL_CHARGE);
  return { warnings, info };
}

/**
 * The Hessian verdict line for a converged GFN2 run. A gradient-based stop
 * cannot tell a minimum from a saddle — both have zero gradient — so the
 * curvature check is what lets the app say which one is on screen. The saddle
 * case is real: the planar cyclopropenyl anion is one, and the optimiser would
 * otherwise report it as converged.
 */
function gfn2HessianNote(lowestMode: number): string {
  return lowestMode < HESSIAN_SADDLE_THRESHOLD
    ? 'GFN2-xTB converged to a saddle, not a minimum — the lowest Hessian mode is imaginary '
      + `(λ = ${lowestMode.toFixed(3)} Eh/bohr²), so the geometry on screen is that stationary point.`
    // The raw Hessian's lowest eigenvalue at a minimum is a rigid-body zero
    // mode (~0 ± the FD noise floor), so it is not a number worth printing —
    // only a negative one, far below the floor, is information.
    : 'GFN2-xTB Hessian: minimum — no imaginary mode.';
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

function updateMoleculeInfo(info: PubChemInfo & { dipole?: DipoleResult | null; info?: string[] }) {
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
    'Local MMFF94';
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

  // Charge-model dipole readout. A null dipole means the molecule has no
  // honest MMFF94 charges (an element outside the type space); say so
  // rather than leaving the readout blank next to an absent arrow. The
  // visible text stays short — the hover explains the model and the
  // arrow convention.
  const dipoleEl = document.getElementById('mol-dipole')!;
  if (info.dipole) {
    dipoleEl.classList.remove('unsupported');
    dipoleEl.textContent = `Dipole: ${info.dipole.debye.toFixed(2)} D`;
    dipoleEl.title =
      'Computed from MMFF94 BCI partial charges (a charge model, not a quantum-mechanical dipole). ' +
      'The arrow points from the positive end (δ+) toward the negative end (δ−) — the chemistry ' +
      'convention; the physics convention draws it the other way.';
  } else if (info.dipole === null) {
    dipoleEl.classList.add('unsupported');
    dipoleEl.textContent = 'Dipole: n/a';
    dipoleEl.title = '';
  } else {
    dipoleEl.textContent = '';
    dipoleEl.title = '';
  }

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
        const dipole = computeDipole(molecule);
        const notes = composeNotes(result.info.warnings ?? [], molecule, dipole);
        notes.info.push(...snapped.info);
        updateMoleculeInfo({
          ...result.info,
          formula,
          weight: `${weight}`,
          dipole,
          warnings: notes.warnings,
          info: notes.info,
        });
      } else {
        showLoading('Refining geometry...');
        const local = await computeLocalGeometry(molecule);
        const t4 = performance.now();
        if (!local) {
          // The local pipeline failed: refuse to render rather than silently
          // displaying the unrefined 2D sketch as if it were a 3D model.
          // The 3D view is left unchanged.
          console.warn('[render] computeLocalGeometry returned null; refusing to render');
          showRenderError(
            'Could not generate 3D geometry for this structure — the local MMFF94 pipeline failed. ' +
            'The 3D view is unchanged.'
          );
          return;
        }
        molecule = local.molecule;
        gfn2Charges = local.gfn2Charges ?? null;
        const snapped = snapToSymmetry(molecule);
        molecule = snapped.molecule;
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        const dipole = computeDipole(molecule);
        const notes = composeNotes(local.warnings, molecule, dipole, local.engine);
        notes.info.push(...snapped.info);
        if (local.engine === 'gfn2' && local.gfn2LowestMode !== undefined) {
          notes.info.push(gfn2HessianNote(local.gfn2LowestMode));
        }
        updateMoleculeInfo({
          source: local.engine === 'gfn2' ? 'gfn2' : 'local',
          formula,
          weight: `${weight}`,
          dipole,
          // The stereo-enforcement failures ride out of the worker with the
          // molecule; the parameter-gap report and the dipole caveats are
          // composed here (the header keeps the structural warnings, the
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

  // GFN2-xTB refinement, on demand. The engine is ~3 MB of wasm and loads
  // lazily inside its worker on first use — a user who never asks for it never
  // pays for it. This is the tier for structures MMFF94 cannot describe; the
  // Info log says exactly that (GFN2_NOTE).
  const gfn2Btn = document.getElementById('ctrl-gfn2-refine') as HTMLButtonElement | null;
  if (gfn2Btn) {
    gfn2Btn.onclick = async () => {
      const molecule = ctx.currentMolecule;
      if (!molecule) return;
      gfn2Btn.textContent = 'Refining...';
      gfn2Btn.disabled = true;
      hideRenderError();
      showLoading('Refining with GFN2-xTB (first use downloads ~3 MB)...');
      try {
        const refined = await refineWithGfn2(molecule);
        if (!refined) {
          showRenderError(
            'GFN2-xTB could not refine this structure — the geometry is unchanged. It needs a browser '
            + 'with Workers and elements its parameter table covers.'
          );
          return;
        }
        const snapped = snapToSymmetry(refined.molecule);
        const next = snapped.molecule;
        showMolecule(ctx, next, refined.charges);
        const { formula, weight } = computeFormula(next.atoms.map(a => a.element));
        const dipole = computeDipole(next);
        // The MMFF94 parameter-gap warnings are deliberately NOT repeated here:
        // the geometry no longer comes from MMFF94, so calling it "approximate"
        // would be stale. The charge model still runs on those parameters, so
        // the dipole caveats do still apply.
        const info: string[] = [];
        if (dipole && parameterGapWarnings(next).length > 0) info.push(DIPOLE_APPROXIMATE);
        if (dipole?.residualCharge) info.push(DIPOLE_RESIDUAL_CHARGE);
        info.push(GFN2_NOTE);
        info.push(...snapped.info);
        info.push(
          refined.converged
            ? `GFN2-xTB converged in ${refined.iterations} steps to ${refined.energyHartree.toFixed(6)} Eh `
              + `(${(refined.milliseconds / 1000).toFixed(1)} s).`
            : `GFN2-xTB stopped after ${refined.iterations} steps at ${refined.energyHartree.toFixed(6)} Eh `
              + 'without reaching its convergence threshold — treat the geometry as approximate.',
        );
        if (refined.lowestHessianMode !== null) info.push(gfn2HessianNote(refined.lowestHessianMode));
        updateMoleculeInfo({ source: 'gfn2', formula, weight: `${weight}`, dipole, warnings: [], info });
      } catch {
        showRenderError('GFN2-xTB refinement failed — the geometry is unchanged.');
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
