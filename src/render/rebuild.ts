import * as THREE from 'three';
import type { SceneContext } from './setup';
import { renderAtoms } from './atoms';
import { renderBonds } from './bonds';
import { renderOrbitals } from './orbitals';
import { renderLabels } from './labels';
import { hsvToHex } from './color-schemes';

// Remove every mesh from a group, disposing GPU resources.  The molecule,
// orbital, and label groups are rebuilt wholesale whenever a molecule loads
// or a display setting changes.
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

// Rebuild all molecule meshes from ctx.currentMolecule without touching the
// camera.  Used for display settings (atom size, orbital style, colors).
export function rebuildDisplay(ctx: SceneContext) {
  if (!ctx.currentMolecule) return;
  clearGroup(ctx.moleculeGroup);
  clearGroup(ctx.orbitalGroup);
  clearGroup(ctx.labelGroup);

  const { atoms, bonds } = ctx.currentMolecule;
  const c = ctx.display.colors;
  const scheme = {
    scheme: c.scheme,
    sigma: hsvToHex(c.sigma[0], c.sigma[1], c.sigma[2]),
    pi: hsvToHex(c.pi[0], c.pi[1], c.pi[2]),
    lonePair: hsvToHex(c.lonePair[0], c.lonePair[1], c.lonePair[2]),
  };
  renderAtoms(ctx.moleculeGroup, atoms, ctx.display);
  renderBonds(ctx.moleculeGroup, atoms, bonds, ctx.display);
  renderOrbitals(ctx.orbitalGroup, ctx.currentMolecule, ctx.display.orbitalPreset, scheme);
  renderLabels(ctx.labelGroup, ctx.currentMolecule);
  ctx.labelGroup.visible = ctx.display.showLabels;
}

// Full build: rebuildDisplay plus frame the camera on the new molecule.
export function buildScene(ctx: SceneContext) {
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
