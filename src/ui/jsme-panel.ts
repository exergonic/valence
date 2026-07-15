import * as THREE from 'three';
import type { SceneContext } from '../scene';
import { parseMolBlock } from '../mol-parser';
import { fillMissingHydrogens } from '../hydrogens';
import { place3D } from '../embedder';
import { fetch3D, computeFormula } from '../services/resolve3d';
import type { PubChemInfo } from '../services/resolve3d';
import { generate3DFromSMILES } from '../services/rdkit';
import { renderAtoms, renderBonds, renderOrbitals, renderLabels } from '../scene';

declare global {
  interface Window {
    jsmeApplet: any;
  }
}

function clearGroup(g: THREE.Group) {
  while (g.children.length > 0) {
    const child = g.children[0];
    g.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  }
}

// Rebuild meshes without touching camera position
function rebuildDisplay(ctx: SceneContext) {
  if (!ctx.currentMolecule) return;
  clearGroup(ctx.moleculeGroup);
  clearGroup(ctx.orbitalGroup);
  clearGroup(ctx.labelGroup);

  const { atoms, bonds } = ctx.currentMolecule;
  renderAtoms(ctx.moleculeGroup, atoms, ctx.display);
  renderBonds(ctx.moleculeGroup, atoms, bonds, ctx.display);
  renderOrbitals(ctx.orbitalGroup, ctx.currentMolecule, ctx.display.orbitalPreset);
  renderLabels(ctx.labelGroup, ctx.currentMolecule);
  ctx.labelGroup.visible = ctx.display.showLabels;
}

// Full build including camera framing
function buildScene(ctx: SceneContext) {
  rebuildDisplay(ctx);

  const center = new THREE.Vector3();
  ctx.moleculeGroup.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      center.add(child.position);
    }
  });
  center.divideScalar(ctx.moleculeGroup.children.length || 1);

  const box = new THREE.Box3().setFromObject(ctx.moleculeGroup);
  const size = box.getSize(new THREE.Vector3()).length();
  const dist = size * 1.5;
  ctx.camera.position.set(center.x, center.y, center.z + dist);
  ctx.camera.lookAt(center);
  ctx.controls.target.set(center.x, center.y, center.z);
  ctx.controls.update();
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
    sourceEl.textContent = '⚠ CIR fallback';
    document.getElementById('info-name')!.textContent = '';
    document.getElementById('info-formula')!.textContent = '';
    document.getElementById('info-weight')!.textContent = '';
    document.getElementById('info-cid')!.textContent = '';
    document.getElementById('info-link')!.style.display = 'none';
    popup.classList.remove('hidden');
  } else if (info.source === 'rdkit') {
    const sourceEl = document.getElementById('info-source')!;
    sourceEl.className = 'fallback';
    sourceEl.textContent = '⚡ RDKit.js (ETKDG + MMFF94)';
    document.getElementById('info-name')!.textContent = info.name || '';
    document.getElementById('info-formula')!.textContent = info.formula || '';
    document.getElementById('info-weight')!.textContent = info.weight ? `MW ${info.weight}` : '';
    document.getElementById('info-cid')!.textContent = '';
    document.getElementById('info-link')!.style.display = 'none';
    popup.classList.remove('hidden');
  } else {
    popup.classList.add('hidden');
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

      const result = document.getElementById('ctrl-force-fallback') &&
        (document.getElementById('ctrl-force-fallback') as HTMLInputElement).checked
        ? null
        : await fetch3D(smiles);
      if (result) {
        const fetched = parseMolBlock(result.sdf);
        if (fetched.atoms.length > 0) molecule = fetched;
        // Compute formula and weight from parsed atoms
        const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
        setStatus({ ...result.info, formula, weight: `${weight}` });
      } else {
        // Fallback 1: RDKit.js ETKDG + MMFF94 (client-side, quality comparable to PubChem)
        const rdkitSdf = await generate3DFromSMILES(smiles);
        if (rdkitSdf) {
          const fetched = parseMolBlock(rdkitSdf);
          if (fetched.atoms.length > 0) molecule = fetched;
          const { formula, weight } = computeFormula(molecule.atoms.map(a => a.element));
          setStatus({ source: 'rdkit', formula, weight: `${weight}` });
        } else {
          // Fallback 2: graph-walk embedder
          molecule = fillMissingHydrogens(molecule);
          const placed = place3D(molecule);
          molecule = {
            atoms: molecule.atoms.map((a, i) => {
              const p = placed[i].position;
              return { ...a, x: p[0], y: p[1], z: p[2] };
            }),
            bonds: molecule.bonds,
          };
          setStatus({ source: 'fallback' });
        }
      }

      ctx.currentMolecule = molecule;
      buildScene(ctx);
    } finally {
      renderBtn.textContent = 'Render Molecule';
      renderBtn.disabled = false;
    }
  };
}
