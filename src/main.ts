import type { SceneContext } from './render';
import { initScene, buildScene } from './render';
import { mountJsmePanel } from './ui/jsme-panel';
import { setupControls } from './ui/controls';
import { setupTooltip } from './ui/tooltip';
import { parseMolBlock } from './mol-parser';
import { EXAMPLES } from './ui/examples';

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
    if (window.jsmeApplet) window.jsmeApplet.repaint();
  });

  splitter.addEventListener('pointerup', () => {
    dragging = false;
    splitter.classList.remove('active');
    if (window.jsmeApplet) {
      setTimeout(() => window.jsmeApplet.repaint(), 50);
    }
  });
}

function loadMolecule(ctx: SceneContext, molBlock: string) {
  const molecule = parseMolBlock(molBlock);
  if (molecule.atoms.length === 0) return;
  ctx.currentMolecule = molecule;
  buildScene(ctx);
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

    // Populate the molecule info header for examples
    const molecule = parseMolBlock(ex.mol);
    const counts: Record<string, number> = {};
    for (const a of molecule.atoms) counts[a.element] = (counts[a.element] || 0) + 1;
    const rest = Object.keys(counts).filter((e) => e !== 'C' && e !== 'H').sort();
    let formula = '';
    if (counts['C']) formula += `C${counts['C'] > 1 ? counts['C'] : ''}`;
    if (counts['H']) formula += `H${counts['H'] > 1 ? counts['H'] : ''}`;
    for (const el of rest) formula += `${el}${counts[el] > 1 ? counts[el] : ''}`;

    const container = document.getElementById('molecule-info')!;
    container.classList.remove('hidden');
    document.getElementById('mol-formula')!.textContent = formula;
    document.getElementById('mol-name')!.textContent = ` · ${ex.name}`;
    document.getElementById('mol-weight')!.textContent = '';
    const sourceEl = document.getElementById('mol-source')!;
    sourceEl.textContent = 'Example';
    sourceEl.className = 'pubchem';
    document.getElementById('mol-link')!.style.display = 'none';
    document.getElementById('mol-warnings')!.classList.add('hidden');
  });
}

function setupKeyboardShortcuts(ctx: SceneContext) {
  document.addEventListener('keydown', (e) => {
    // Don't capture when typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    if (e.key === 'Enter') {
      // Trigger render
      document.getElementById('render-btn')?.click();
    } else if (e.key === 'r' || e.key === 'R') {
      // Reset view
      document.getElementById('reset-view-btn')?.click();
    } else if (e.key === 'Escape') {
      // Close any open dialogs
      document.getElementById('cite-dialog')?.classList.add('hidden');
      document.getElementById('help-dialog')?.classList.add('hidden');
    } else if (e.key >= '1' && e.key <= '9') {
      // Jump to example by number
      const idx = parseInt(e.key) - 1;
      if (idx < EXAMPLES.length) {
        loadMolecule(ctx, EXAMPLES[idx].mol);
      }
    }
  });
}

function setupMeasureMode(ctx: SceneContext) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const container = document.getElementById('canvas-container')!;

  container.addEventListener('click', (e) => {
    const measureState = (ctx as any)._measureState;
    if (!measureState?.mode) return;

    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, ctx.camera);

    // Collect all meshes from molecule and orbital groups
    const objects: THREE.Object3D[] = [];
    ctx.moleculeGroup.children.forEach((c) => objects.push(c));
    ctx.orbitalGroup.children.forEach((c) => objects.push(c));

    const hits = raycaster.intersectObjects(objects, true);
    if (hits.length > 0) {
      const hit = hits[0].object;
      const atomIndex = hit.userData?.atomIndex;
      if (atomIndex !== undefined) {
        measureState.addPoint(atomIndex);
      }
    }
  });
}

// Need THREE for raycaster
import * as THREE from 'three';

async function main() {
  const scene = initScene(document.getElementById('canvas-container')!);
  mountJsmePanel(scene);
  setupControls(scene);
  setupSplitter();
  setupExamples(scene);
  setupTooltip(
    document.getElementById('canvas-container')!,
    scene.camera,
    scene.orbitalGroup,
  );
  setupKeyboardShortcuts(scene);
  setupMeasureMode(scene);
}

main();
