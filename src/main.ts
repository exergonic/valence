import { initScene } from './scene';
import { mountJsmePanel } from './ui/jsme-panel';
import { setupGui } from './ui/gui';

async function main() {
  const scene = initScene(document.getElementById('canvas-container')!);
  mountJsmePanel(document.getElementById('jsme-panel')!, scene);
  setupGui(scene);
}

main();
