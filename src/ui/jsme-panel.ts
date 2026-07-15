import * as THREE from 'three';
import type { SceneContext } from '../scene';
import { parseMolBlock } from '../mol-parser';
import { fillMissingHydrogens } from '../hydrogens';
import { place3D } from '../embedder';
import { fetch3D, type PubChemInfo } from '../services/resolve3d';
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

function showInfo(info: PubChemInfo) {
  const box = document.getElementById('info-box')!;
  const sourceEl = document.getElementById('info-source')!;
  const nameEl = document.getElementById('info-name')!;
  const formulaEl = document.getElementById('info-formula')!;
  const weightEl = document.getElementById('info-weight')!;
  const linkEl = document.getElementById('info-link')! as HTMLAnchorElement;

  if (info.source === 'pubchem') {
    sourceEl.className = 'pubchem';
    sourceEl.textContent = '✓ PubChem 3D';
    nameEl.textContent = info.name || '';
    formulaEl.textContent = info.formula || '';
    weightEl.textContent = info.weight ? `MW ${info.weight.toFixed(2)}` : '';
    if (info.cid) {
      linkEl.href = `https://pubchem.ncbi.nlm.nih.gov/compound/${info.cid}`;
      linkEl.style.display = '';
    } else {
      linkEl.style.display = 'none';
    }
    box.style.display = '';
  } else if (info.source === 'cir') {
    sourceEl.className = 'fallback';
    sourceEl.textContent = '⚠ CIR fallback';
    nameEl.textContent = '';
    formulaEl.textContent = '';
    weightEl.textContent = '';
    linkEl.style.display = 'none';
    box.style.display = '';
  } else {
    hideInfo();
  }
}

function hideInfo() {
  document.getElementById('info-box')!.style.display = 'none';
}

export function mountJsmePanel(_container: HTMLElement, ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')! as HTMLButtonElement;
  ctx.rerender = () => rebuildDisplay(ctx);

  document.getElementById('info-dismiss')!.addEventListener('click', hideInfo);

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

      hideInfo();
      const result = await fetch3D(smiles);
      if (result) {
        const fetched = parseMolBlock(result.sdf);
        if (fetched.atoms.length > 0) {
          molecule = fetched;
        }
        showInfo(result.info);
      } else {
        molecule = fillMissingHydrogens(molecule);
        const placed = place3D(molecule);
        molecule = {
          atoms: molecule.atoms.map((a, i) => {
            const p = placed[i].position;
            return { ...a, x: p[0], y: p[1], z: p[2] };
          }),
          bonds: molecule.bonds,
        };
      }

      ctx.currentMolecule = molecule;
      buildScene(ctx);
    } finally {
      renderBtn.textContent = 'Render Molecule';
      renderBtn.disabled = false;
    }
  };
}
