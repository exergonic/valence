import GUI from 'lil-gui';
import type { SceneContext } from '../scene';

export function setupGui(_ctx: SceneContext): GUI {
  const gui = new GUI();
  const params = {
    showAtoms: true,
    showBonds: true,
    showOrbitals: true,
  };
  gui.add(params, 'showAtoms').name('Show Atoms');
  gui.add(params, 'showBonds').name('Show Bonds');
  gui.add(params, 'showOrbitals').name('Show Orbitals');
  return gui;
}
