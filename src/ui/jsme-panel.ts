import type { SceneContext } from '../render';
import { rebuildDisplay, buildScene } from '../render';
import { parseMolBlock } from '../mol-parser';
import { fillMissingHydrogens } from '../chem/hydrogens';
import { place3D } from '../geometry/place3d';
import { refineWithMMFF94 } from '../geometry/mmff-refine';
import { fetch3D, computeFormula } from '../geometry/resolve3d';
import type { PubChemInfo } from '../geometry/resolve3d';

declare global {
  interface Window {
    jsmeApplet: any;
  }
}

function setStatus(info: PubChemInfo) {
  const popup = document.getElementById('info-popup')!;

  if (info.source === 'pubchem') {
    const sourceEl = document.getElementById('info-source')!;
    sourceEl.className = 'pubchem';
    sourceEl.textContent = '✓ PubChem 3D';
    document.getElementById('info-name')!.textContent = info.name || '';
    document.getElementById('info-formula')!.textContent = info.formula || '';
    document.getElementById('info-weight')!.textContent = info.weight ? `MW ${info.weight}` : '';
    document.getElementById('info-cid')!.textContent = info.cid ? `CID ${info.cid}` : '';
    const link = document.getElementById('info-link')! as HTMLAnchorElement;
    if (info.cid) {
      link.href = `https://pubchem.ncbi.nlm.nih.gov/compound/${info.cid}`;
      link.style.display = '';
    } else {
      link.style.display = 'none';
    }
    popup.classList.remove('hidden');
  } else if (info.source === 'cir') {
    const sourceEl = document.getElementById('info-source')!;
    sourceEl.className = 'fallback';
    sourceEl.textContent = '⚠ PubChem 3D unavailable';
    document.getElementById('info-name')!.textContent = 'Using NIH CACTUS resolver (CIR)';
    document.getElementById('info-formula')!.textContent = info.formula || '';
    document.getElementById('info-weight')!.textContent = info.weight ? `MW ${info.weight}` : '';
    document.getElementById('info-cid')!.textContent = '';
    document.getElementById('info-link')!.style.display = 'none';
    popup.classList.remove('hidden');
  } else if (info.source === 'local') {
    const sourceEl = document.getElementById('info-source')!;
    sourceEl.className = 'fallback';
    sourceEl.textContent = '⚡ Local MMFF94';
    document.getElementById('info-name')!.textContent = 'Embedder + MMFF94 refinement (forced)';
    document.getElementById('info-formula')!.textContent = info.formula || '';
    document.getElementById('info-weight')!.textContent = info.weight ? `MW ${info.weight}` : '';
    document.getElementById('info-cid')!.textContent = '';
    document.getElementById('info-link')!.style.display = 'none';
    popup.classList.remove('hidden');
  } else {
    const sourceEl = document.getElementById('info-source')!;
    sourceEl.className = 'warning';
    sourceEl.textContent = '⚠ Approximate geometry';
    document.getElementById('info-name')!.textContent = 'PubChem & CIR unavailable — in-house fallback';
    document.getElementById('info-formula')!.textContent = info.formula || '';
    document.getElementById('info-weight')!.textContent = info.weight ? `MW ${info.weight}` : '';
    document.getElementById('info-cid')!.textContent = '';
    document.getElementById('info-link')!.style.display = 'none';
    popup.classList.remove('hidden');
  }
}

export function mountJsmePanel(_container: HTMLElement, ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')! as HTMLButtonElement;
  ctx.rerender = () => rebuildDisplay(ctx);

  document.getElementById('info-close')!.addEventListener('click', () => {
    document.getElementById('info-popup')!.classList.add('hidden');
  });

  renderBtn.onclick = async () => {
    const applet = window.jsmeApplet;
    if (!applet) return;

    renderBtn.textContent = 'Loading...';
    renderBtn.disabled = true;

    try {
      const smiles = applet.smiles();
      const molBlock = applet.molFile();
      let molecule = parseMolBlock(molBlock);
      if (molecule.atoms.length === 0) return;

      // "Force local lookup" (debug/offline toggle): skip PubChem and
      // CIR entirely and go straight to the local embedder + MMFF94
      // refinement — the same code path the network failure falls
      // back to. Re-enabled from the old RDKit-era debug toggle; it
      // now exercises the mmff94-ts geometry bridge.
      const forceLocal = (document.getElementById('ctrl-force-fallback') as HTMLInputElement | null)?.checked ?? false;
      const result = forceLocal ? null : await fetch3D(smiles);
      if (result) {
        const fetched = parseMolBlock(result.sdf);
        if (fetched.atoms.length > 0) molecule = fetched;
        // Compute formula and weight from parsed atoms
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        setStatus({ ...result.info, formula, weight: `${weight}` });
      } else {
        molecule = fillMissingHydrogens(molecule);
        const placed = place3D(molecule);
        molecule = {
          atoms: molecule.atoms.map((a, i) => {
            const p = placed[i];
            return { ...a, x: p[0], y: p[1], z: p[2] };
          }),
          bonds: molecule.bonds,
        };
        // MMFF94 refinement of the graph-walk guess: same force field
        // PubChem uses for its 3D SDFs. Keeps the guess when the
        // refinement cannot type the molecule.
        const refined = refineWithMMFF94(molecule);
        if (refined) molecule = refined;
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        setStatus({ source: forceLocal ? 'local' : 'fallback', formula, weight: `${weight}` });
      }

      ctx.currentMolecule = molecule;
      buildScene(ctx);
    } finally {
      renderBtn.textContent = 'Render Molecule';
      renderBtn.disabled = false;
    }
  };
}
