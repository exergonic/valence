import * as THREE from 'three';
import type { SceneContext } from '../scene';
import { parseMolBlock } from '../mol-parser';
import { fillMissingHydrogens } from '../hydrogens';
import { place3D } from '../embedder';
import { fetch3D } from '../services/resolve3d';
import { renderAtoms, renderBonds, renderOrbitals } from '../scene';

declare global {
  interface Window {
    jsmeApplet: any;
  }
}

export function mountJsmePanel(_container: HTMLElement, ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')! as HTMLButtonElement;
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

      const sdf = await fetch3D(smiles);
      if (sdf) {
        const fetched = parseMolBlock(sdf);
        if (fetched.atoms.length > 0) {
          molecule = fetched;
        }
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

      const clearGroup = (g: THREE.Group) => {
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
      };
      clearGroup(ctx.moleculeGroup);
      clearGroup(ctx.orbitalGroup);

      renderAtoms(ctx.moleculeGroup, molecule.atoms);
      renderBonds(ctx.moleculeGroup, molecule.atoms, molecule.bonds);
      renderOrbitals(ctx.orbitalGroup, molecule);

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
    } finally {
      renderBtn.textContent = 'Render Molecule';
      renderBtn.disabled = false;
    }
  };
}
