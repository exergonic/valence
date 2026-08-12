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

function setStatus(info: PubChemInfo) {
  const popup = document.getElementById('info-popup')!;
  // Generic-parameter warnings for the local MMFF94 path: cleared on
  // every status (an empty line is invisible), shown when the
  // molecule runs on parameters MMFF94 was never given for.
  const warningsEl = document.getElementById('info-warnings')!;
  warningsEl.classList.toggle('hidden', !(info.warnings && info.warnings.length > 0));
  warningsEl.textContent = info.warnings?.join('\n') ?? '';

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
      // Per-stage timing marks (console.log): the first diagnostic
      // when a render feels slow — paste the [render-timing] line.
      // 2026-08-06 (the diethylphosphine "3 s" report): the local
      // stage measured 2.4 s in every user-facing browser (Edge,
      // Brave, Helium) vs ~300 ms in the Hermes pane and headless
      // Edge — the pipeline was identical, and the cause was
      // OS-level CPU throttling of the browser processes (Windows
      // Efficiency Mode), not the geometry code. The marks stay
      // because the next slowness report starts here.
      const t0 = performance.now();
      const smiles = applet.smiles();
      const molBlock = applet.molFile();
      const t1 = performance.now();
      let molecule = parseMolBlock(molBlock);
      const t2 = performance.now();
      if (molecule.atoms.length === 0) return;

      // "Force local lookup" (debug/offline toggle): skip PubChem and
      // CIR entirely and go straight to the local embedder + MMFF94
      // refinement — the same code path the network failure falls
      // back to. Re-enabled from the old RDKit-era debug toggle; it
      // now exercises the mmff94-ts geometry bridge.
      const forceLocal = (document.getElementById('ctrl-force-fallback') as HTMLInputElement | null)?.checked ?? false;
      const result = forceLocal ? null : await fetch3D(smiles);
      const t3 = performance.now();
      if (result) {
        const fetched = parseMolBlock(result.sdf);
        if (fetched.atoms.length > 0) molecule = fetched;
        // Compute formula and weight from parsed atoms
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        setStatus({ ...result.info, formula, weight: `${weight}` });
      } else {
        // The local pipeline (implicit H's + embedder + MMFF94
        // refinement) runs in a Web Worker: for larger molecules the
        // optimizer takes seconds, and the main thread must stay
        // responsive — a blocked event loop past ~10 s makes the
        // browser offer "Page Unresponsive". Falls back to the
        // synchronous path when Workers are unavailable.
        const local = await computeLocalGeometry(molecule);
        const t4 = performance.now();
        if (local) molecule = local;
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        // Warn when the refined molecule runs on generic MMFF94
        // parameters (hypervalent centers, untyped elements) — the
        // user should not silently trust a geometry MMFF94 has no
        // parameters for. The H-complete refined molecule is the
        // right input: the report counts σ bonds including H's.
        setStatus({
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
    }
  };
}
