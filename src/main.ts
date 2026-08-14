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
    // Reset dropdown to the placeholder label after selecting
    dropdown.selectedIndex = 0;
  });
}

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
}

main();
