import { initScene } from './scene';
import { mountJsmePanel } from './ui/jsme-panel';
import { setupControls } from './ui/controls';

async function main() {
  const scene = initScene(document.getElementById('canvas-container')!);
  mountJsmePanel(document.getElementById('jsme-panel')!, scene);
  setupControls(scene);
}

main();
