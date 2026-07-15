import type { SceneContext } from '../scene';

export function setupControls(ctx: SceneContext) {
  const panel = document.getElementById('controls-panel')!;
  const rerender = () => setTimeout(() => ctx.rerender(), 10);

  // Show Atoms & Bonds
  const molToggle = panel.querySelector<HTMLInputElement>('#ctrl-show-mol')!;
  molToggle.checked = true;
  molToggle.addEventListener('change', () => {
    ctx.moleculeGroup.visible = molToggle.checked;
  });

  // Show Orbitals
  const orbToggle = panel.querySelector<HTMLInputElement>('#ctrl-show-orb')!;
  orbToggle.checked = false;
  orbToggle.addEventListener('change', () => {
    ctx.orbitalGroup.visible = orbToggle.checked;
  });

  // Atom Scale
  const atomScale = panel.querySelector<HTMLInputElement>('#ctrl-atom-scale')!;
  atomScale.addEventListener('input', () => {
    ctx.display.atomScale = parseFloat(atomScale.value);
    rerender();
  });

  // Bond Scale
  const bondScale = panel.querySelector<HTMLInputElement>('#ctrl-bond-scale')!;
  bondScale.addEventListener('input', () => {
    ctx.display.bondScale = parseFloat(bondScale.value);
    rerender();
  });

  // Atom Labels
  const labelsToggle = panel.querySelector<HTMLInputElement>('#ctrl-show-labels')!;
  labelsToggle.addEventListener('change', () => {
    ctx.display.showLabels = labelsToggle.checked;
  });

  // Orbital Presets
  const presetBtns = panel.querySelectorAll<HTMLButtonElement>('.preset-btn');
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ctx.display.orbitalPreset = btn.dataset.preset as 'glass' | 'glossy' | 'matte';
      rerender();
    });
  });
}
