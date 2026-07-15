import * as THREE from 'three';
import type { SceneContext } from '../scene';
import { parseMolBlock } from '../mol-parser';
import { fillMissingHydrogens } from '../hydrogens';
import { place3D } from '../embedder';
import { fetch3D } from '../services/resolve3d';
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

function setStatus(info: { source: string; name?: string; formula?: string }) {
  const bar = document.getElementById('status-bar')!;
  if (info.source === 'pubchem') {
    bar.innerHTML = `<span class="source pubchem">PubChem 3D</span>${info.name ? `<span class="name">${info.name}</span>` : ''}${info.formula ? `<span class="formula">${info.formula}</span>` : ''}`;
  } else if (info.source === 'cir') {
    bar.innerHTML = `<span class="source fallback">CIR fallback</span>`;
  } else {
    bar.innerHTML = `<span class="source fallback">Embedder fallback</span>`;
  }
}

export function mountJsmePanel(_container: HTMLElement, ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')! as HTMLButtonElement;
  ctx.rerender = () => rebuildDisplay(ctx);

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

      const result = await fetch3D(smiles);
      if (result) {
        const fetched = parseMolBlock(result.sdf);
        if (fetched.atoms.length > 0) molecule = fetched;
        setStatus(result.info);
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
        setStatus({ source: 'fallback' });
      }

      ctx.currentMolecule = molecule;
      buildScene(ctx);
    } finally {
      renderBtn.textContent = 'Render Molecule';
      renderBtn.disabled = false;
    }
  };
}
