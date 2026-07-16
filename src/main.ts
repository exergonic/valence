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
    window.dispatchEvent(new Event('resize'));
    // Repaint JSME so it picks up the new container size
    if ((window as any).jsmeApplet) {
      (window as any).jsmeApplet.repaint();
    }
  });

  splitter.addEventListener('pointerup', () => {
    dragging = false;
    splitter.classList.remove('active');
    // Give JSME time to settle, then repaint at the new size
    if ((window as any).jsmeApplet) {
      setTimeout(() => (window as any).jsmeApplet.repaint(), 50);
    }
  });
}

async function main() {
  const scene = initScene(document.getElementById('canvas-container')!);
  mountJsmePanel(document.getElementById('jsme-panel')!, scene);
  setupControls(scene);
  setupSplitter();
}

main();
