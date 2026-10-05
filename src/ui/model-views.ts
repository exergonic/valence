/**
 * The four model views: one button per model of bonding the app can draw, and
 * the inspector on the right that holds that model's controls and nothing
 * else.
 *
 *   VSEPR        — the hybrid orbitals and lone pairs alone, element labels
 *                  (the view the app opens on)
 *   Charge Model — the atoms, their partial charges, the ESP surface, the dipole
 *   Localized    — the atoms, element labels, the Pipek–Mezey orbital list
 *                  with its highest occupied orbital drawn
 *   Delocalized  — the atoms, element labels, the extended-Hückel MO ladder
 *                  with the HOMO drawn
 *
 * A view is a mode, not a one-off preset: it stays selected while the user
 * adjusts its controls, because the inspector shows that view's controls —
 * clearing the selection would leave the panel naming nothing. Choosing a view
 * sets its picture by driving the existing controls (the same checkboxes and
 * menu entries a user would pick, their own handlers doing the rest), so there
 * is one code path per setting. A new molecule under an orbital view gets its
 * own HOMO drawn.
 */
import type { SceneContext } from '../render';
import type { MoPanel } from './mo-diagram';

export type ModelView = 'vsepr' | 'charge' | 'localized' | 'delocalized';

interface Preset {
  /** Atoms & bonds */
  atoms: boolean;
  /** The VSEPR hybrid lobes and lone pairs */
  vseprOrbitals: boolean;
  labels: 'atom' | 'charge';
  esp: boolean;
  dipole: boolean;
  /** Which orbital list is on stage, if any */
  orbitals: 'none' | 'delocalized' | 'localized';
  title: string;
  blurb: string;
}

const PRESETS: Record<ModelView, Preset> = {
  vsepr: {
    atoms: false, vseprOrbitals: true, labels: 'atom', esp: false, dipole: false, orbitals: 'none',
    title: 'VSEPR',
    blurb: 'Count electron domains, choose a hybridization, read off the shape.',
  },
  charge: {
    atoms: true, vseprOrbitals: false, labels: 'charge', esp: true, dipole: true, orbitals: 'none',
    title: 'Charge model',
    blurb: 'Where the electrons sit: partial charges, the potential they make, and the dipole.',
  },
  localized: {
    atoms: true, vseprOrbitals: false, labels: 'atom', esp: false, dipole: false, orbitals: 'localized',
    title: 'Localized orbitals',
    blurb: 'The calculated orbitals rearranged into bonds and lone pairs (Pipek–Mezey).',
  },
  delocalized: {
    atoms: true, vseprOrbitals: false, labels: 'atom', esp: false, dipole: false, orbitals: 'delocalized',
    title: 'Delocalized orbitals',
    blurb: 'Extended-Hückel molecular orbitals, the canonical picture: each spread over the molecule.',
  },
};

function setChecked(id: string, checked: boolean): void {
  const box = document.getElementById(id) as HTMLInputElement | null;
  if (!box || box.checked === checked) return;
  box.checked = checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelected(id: string, value: string): void {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (!select || select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

export function setupModelViews(ctx: SceneContext, moPanel: MoPanel): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#model-views [data-model]'));
  const inspector = document.getElementById('inspector')!;
  const title = document.getElementById('inspector-title')!;
  const railLabel = document.getElementById('inspector-rail-label')!;
  const blurb = document.getElementById('inspector-blurb')!;

  let active: ModelView = 'vsepr';

  const apply = (view: ModelView) => {
    const preset = PRESETS[view];
    active = view;
    // the inspector switches first: the orbital list scrolls its drawn row into
    // view, and a row in a hidden section cannot be scrolled to
    inspector.dataset.view = view;
    title.textContent = preset.title;
    railLabel.textContent = preset.title;
    blurb.textContent = preset.blurb;
    setChecked('ctrl-show-mol', preset.atoms);
    setChecked('ctrl-show-orb', preset.vseprOrbitals);
    setSelected('ctrl-label-mode', preset.labels);
    setChecked('ctrl-show-esp', preset.esp);
    setChecked('ctrl-show-dipole', preset.dipole);
    if (preset.orbitals === 'none') {
      // a drawn MO takes the stage over everything else, so it goes too
      moPanel.clearSelections();
      moPanel.setOnStage(false);
    } else {
      moPanel.setOnStage(true);
      moPanel.setView(preset.orbitals);
      moPanel.selectHomo();
    }
    for (const button of buttons) button.classList.toggle('active', button.dataset.model === view);
    ctx.rerender();
  };

  for (const button of buttons) {
    button.addEventListener('click', () => apply(button.dataset.model as ModelView));
  }

  // The inspector folds to a rail on the right edge (the O key), the mirror of
  // the sketcher's Build rail; the scene takes the room, so it is told.
  const setFolded = (folded: boolean) => {
    inspector.classList.toggle('collapsed', folded);
    window.dispatchEvent(new Event('resize'));
  };
  document.getElementById('inspector-collapse')!.addEventListener('click', () => setFolded(true));
  document.getElementById('inspector-rail')!.addEventListener('click', () => setFolded(false));

  // A new molecule clears the drawn orbital; under an orbital view, draw the
  // new molecule's HOMO in its place.
  const sceneBuilt = ctx.onSceneBuilt;
  ctx.onSceneBuilt = () => {
    sceneBuilt();
    if (active === 'localized' || active === 'delocalized') moPanel.selectHomo();
  };

  apply('vsepr');
}
