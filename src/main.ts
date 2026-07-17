import * as THREE from 'three';
import type { SceneContext } from './scene';
import { initScene, renderAtoms, renderBonds, renderOrbitals, renderLabels } from './scene';
import { mountJsmePanel } from './ui/jsme-panel';
import { setupControls } from './ui/controls';
import { setupTooltip } from './ui/tooltip';
import { parseMolBlock } from './mol-parser';
import { EXAMPLES } from './data/examples';

function setupSplitter() {
  const splitter = document.getElementById('splitter')!;
  const jsmePanel = document.getElementById('jsme-panel')!;
  let dragging = false;

  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    splitter.classList.add('active');
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  });

  splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const w = Math.max(280, Math.min(e.clientX, window.innerWidth - 200));
    jsmePanel.style.width = w + 'px';
    window.dispatchEvent(new Event('resize'));
    if ((window as any).jsmeApplet) (window as any).jsmeApplet.repaint();
  });

  splitter.addEventListener('pointerup', () => {
    dragging = false;
    splitter.classList.remove('active');
    if ((window as any).jsmeApplet) {
      setTimeout(() => (window as any).jsmeApplet.repaint(), 50);
    }
  });
}

function loadMolecule(ctx: SceneContext, molBlock: string) {
  const molecule = parseMolBlock(molBlock);
  if (molecule.atoms.length === 0) return;

  ctx.currentMolecule = molecule;

  // Clear and rebuild
  const clearGroup = (g: THREE.Group) => {
    while (g.children.length > 0) {
      const child = g.children[0];
      g.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) { child.material.forEach(m => m.dispose()); }
        else { child.material.dispose(); }
      }
    }
  };
  clearGroup(ctx.moleculeGroup);
  clearGroup(ctx.orbitalGroup);
  clearGroup(ctx.labelGroup);

  const { atoms, bonds } = molecule;
  renderAtoms(ctx.moleculeGroup, atoms, ctx.display);
  renderBonds(ctx.moleculeGroup, atoms, bonds, ctx.display);
  renderOrbitals(ctx.orbitalGroup, molecule, ctx.display.orbitalPreset);
  renderLabels(ctx.labelGroup, molecule);
  ctx.labelGroup.visible = ctx.display.showLabels;

  // Frame camera
  const center = new THREE.Vector3();
  ctx.moleculeGroup.children.forEach((child) => {
    if (child instanceof THREE.Mesh) center.add(child.position);
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

function setupExamples(ctx: SceneContext) {
  const dropdown = document.getElementById('examples-dropdown') as HTMLSelectElement;

  // Populate from EXAMPLES array — single source of truth
  for (let i = 0; i < EXAMPLES.length; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = EXAMPLES[i].name;
    dropdown.appendChild(opt);
  }

  dropdown.addEventListener('change', () => {
    const idx = parseInt(dropdown.value);
    if (isNaN(idx)) return;
    const ex = EXAMPLES[idx];
    if (!ex) return;

    loadMolecule(ctx, ex.mol);
    // Reset dropdown to the placeholder label after selecting
    dropdown.selectedIndex = 0;
  });
}

async function main() {
  const scene = initScene(document.getElementById('canvas-container')!);
  mountJsmePanel(document.getElementById('jsme-panel')!, scene);
  setupControls(scene);
  setupSplitter();
  setupExamples(scene);
  setupTooltip(
    document.getElementById('canvas-container')!,
    scene.camera,
    scene.orbitalGroup,
  );
}

main();
