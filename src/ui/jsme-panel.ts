import type { SceneContext } from '../render';
import { rebuildDisplay, buildScene } from '../render';
import { parseMolBlock } from '../mol-parser';
import { computeLocalGeometry } from '../geometry/local-geometry';
import { parameterGapWarnings } from '../geometry/parameter-warnings';
import { fetch3D, computeFormula } from '../geometry/resolve3d';
import type { PubChemInfo } from '../geometry/resolve3d';

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

function updateMoleculeInfo(info: PubChemInfo) {
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
    info.source === 'local' ? 'Local MMFF94' : 'Fallback';
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
}

export function mountJsmePanel(ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')! as HTMLButtonElement;
  ctx.rerender = () => rebuildDisplay(ctx);

  renderBtn.onclick = async () => {
    const applet = window.jsmeApplet;
    if (!applet) return;

    renderBtn.textContent = 'Loading...';
    renderBtn.disabled = true;
    showLoading('Rendering...');

    try {
      const t0 = performance.now();
      const smiles = applet.smiles();
      const molBlock = applet.molFile();
      const t1 = performance.now();
      let molecule = parseMolBlock(molBlock);
      const t2 = performance.now();
      if (molecule.atoms.length === 0) return;

      const forceLocal = (document.getElementById('ctrl-force-fallback') as HTMLInputElement | null)?.checked ?? false;
      const result = forceLocal ? null : await fetch3D(smiles);
      const t3 = performance.now();
      if (result) {
        const fetched = parseMolBlock(result.sdf);
        if (fetched.atoms.length > 0) molecule = fetched;
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        updateMoleculeInfo({ ...result.info, formula, weight: `${weight}` });
      } else {
        showLoading('Refining geometry...');
        const local = await computeLocalGeometry(molecule);
        const t4 = performance.now();
        if (local) molecule = local;
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        updateMoleculeInfo({
          source: forceLocal ? 'local' : 'fallback',
          formula,
          weight: `${weight}`,
          warnings: parameterGapWarnings(molecule),
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
