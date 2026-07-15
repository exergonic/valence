import * as THREE from 'three';
import type { SceneContext } from '../scene';
import { parseMolBlock } from '../mol-parser';
import { renderAtoms, renderBonds } from '../scene';

declare global {
  interface Window {
    jsmeApplet: any;
  }
}

export function mountJsmePanel(_container: HTMLElement, ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')!;
  renderBtn.onclick = () => {
    const applet = window.jsmeApplet;
    if (!applet) return;

    const molBlock = applet.molFile();
    const molecule = parseMolBlock(molBlock);
    if (molecule.atoms.length === 0) return;

    while (ctx.moleculeGroup.children.length > 0) {
      const child = ctx.moleculeGroup.children[0];
      ctx.moleculeGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    renderAtoms(ctx.moleculeGroup, molecule.atoms);
    renderBonds(ctx.moleculeGroup, molecule.atoms, molecule.bonds);

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
    ctx.controls.target.copy(center);
    ctx.controls.update();
  };
}
