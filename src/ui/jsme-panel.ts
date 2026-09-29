import type { SceneContext } from '../render';
import { rebuildDisplay, buildScene } from '../render';
import { parseMolBlock } from '../mol-parser';
import type { Molecule } from '../mol-parser';
import { kekulizeSmiles } from '../chem/kekulize-smiles';
import { computeLocalGeometry } from '../geometry/local-geometry';
import { parameterGapWarnings } from '../geometry/parameter-warnings';
import { fetch3D, computeFormula } from '../geometry/resolve3d';
import type { PubChemInfo } from '../geometry/resolve3d';
import { computeDipole, DIPOLE_APPROXIMATE, DIPOLE_RESIDUAL_CHARGE } from '../chem/charge-model/dipole';
import type { DipoleResult } from '../chem/charge-model/dipole';

declare global {
  interface Window {
    jsmeApplet: any;
  }
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
function composeNotes(warnings: string[], molecule: Molecule, dipole: DipoleResult | null): {
  warnings: string[];
  info: string[];
} {
  const gaps = parameterGapWarnings(molecule);
  const info = [...gaps];
  if (dipole && gaps.length > 0) info.push(DIPOLE_APPROXIMATE);
  if (dipole?.residualCharge) info.push(DIPOLE_RESIDUAL_CHARGE);
  return { warnings, info };
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
      const t2 = performance.now();
      if (molecule.atoms.length === 0) return;

      const forceLocal = (document.getElementById('ctrl-force-fallback') as HTMLInputElement | null)?.checked ?? false;
      const result = forceLocal ? null : await fetch3D(smiles, molecule);
      const t3 = performance.now();
      if (result) {
        // fetch3D validates the returned structure against the sketch and
        // returns the parsed molecule — no re-parse here.
        molecule = result.molecule;
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        const dipole = computeDipole(molecule);
        const notes = composeNotes(result.info.warnings ?? [], molecule, dipole);
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
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        const dipole = computeDipole(molecule);
        const notes = composeNotes(local.warnings, molecule, dipole);
        updateMoleculeInfo({
          source: 'local',
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

      ctx.currentMolecule = molecule;
      buildScene(ctx);
    } finally {
      renderBtn.textContent = 'Render Molecule';
      renderBtn.disabled = false;
      hideLoading();
    }
  };
}
