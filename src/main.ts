import { initScene } from './scene';
import { mountJsmePanel } from './ui/jsme-panel';
import { setupControls } from './ui/controls';

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
    // Trigger resize on the Three.js canvas indirectly
    window.dispatchEvent(new Event('resize'));
  });

  splitter.addEventListener('pointerup', () => {
    dragging = false;
    splitter.classList.remove('active');
  });
}

async function main() {
  const scene = initScene(document.getElementById('canvas-container')!);
  mountJsmePanel(document.getElementById('jsme-panel')!, scene);
  setupControls(scene);
  setupSplitter();
}

main();
