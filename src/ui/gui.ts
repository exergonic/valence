import GUI from 'lil-gui';
import type { SceneContext } from '../scene';

export function setupGui(ctx: SceneContext): GUI {
  const gui = new GUI();
  const params = {
    showMolecule: true,
    showOrbitals: false,
  };

  gui.add(params, 'showMolecule').name('Show Atoms & Bonds').onChange((v: boolean) => {
    ctx.moleculeGroup.visible = v;
  });
  gui.add(params, 'showOrbitals').name('Show Orbitals').onChange((v: boolean) => {
    ctx.orbitalGroup.visible = v;
  });

  return gui;
}
