/**
 * The four model views: one button per model of bonding the app can draw, each
 * setting the display to that model's picture.
 *
 *   VSEPR        — the hybrid orbitals and lone pairs alone, element labels
 *   Charge Model — the atoms, their partial charges, the ESP surface
 *   Localized    — the atoms, element labels, the Pipek–Mezey orbital list
 *   Delocalized  — the atoms, element labels, the extended-Hückel MO ladder
 *
 * A preset drives the existing controls — it ticks the same checkboxes and
 * picks the same menu entries a user would, and their own handlers do the
 * rest — so the View tab always shows what is on screen and there is one code
 * path per setting. The button stays lit until the user changes one of those
 * controls by hand; a highlight that outlived the picture would misname it.
 */
import type { SceneContext } from '../render';
import type { MoPanel } from './mo-diagram';

export type ModelView = 'vsepr' | 'charge' | 'localized' | 'delocalized';

interface Preset {
  /** Show → Atoms & Bonds */
  atoms: boolean;
  /** Show → Orbitals (the VSEPR hybrid lobes) */
  vseprOrbitals: boolean;
  labels: 'atom' | 'charge';
  esp: boolean;
  /** The MO panel: collapsed, or open on one of its views */
  moPanel: 'collapsed' | 'delocalized' | 'localized';
}

const PRESETS: Record<ModelView, Preset> = {
  vsepr: { atoms: false, vseprOrbitals: true, labels: 'atom', esp: false, moPanel: 'collapsed' },
  charge: { atoms: true, vseprOrbitals: false, labels: 'charge', esp: true, moPanel: 'collapsed' },
  localized: { atoms: true, vseprOrbitals: false, labels: 'atom', esp: false, moPanel: 'localized' },
  delocalized: { atoms: true, vseprOrbitals: false, labels: 'atom', esp: false, moPanel: 'delocalized' },
};

/** The controls a preset sets — a hand change to any of them ends the preset. */
const CONTROL_IDS = ['ctrl-show-mol', 'ctrl-show-orb', 'ctrl-label-mode', 'ctrl-show-esp'];

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

  const highlight = (view: ModelView | null) => {
    for (const button of buttons) button.classList.toggle('active', button.dataset.model === view);
  };

  const apply = (view: ModelView) => {
    const preset = PRESETS[view];
    setChecked('ctrl-show-mol', preset.atoms);
    setChecked('ctrl-show-orb', preset.vseprOrbitals);
    setSelected('ctrl-label-mode', preset.labels);
    setChecked('ctrl-show-esp', preset.esp);
    if (preset.moPanel === 'collapsed') {
      // a drawn MO takes the stage over everything else, so it goes too
      moPanel.clearSelections();
      moPanel.setCollapsed(true);
    } else {
      moPanel.setCollapsed(false);
      moPanel.setView(preset.moPanel);
    }
    highlight(view);
    ctx.rerender();
  };

  for (const button of buttons) {
    button.addEventListener('click', () => apply(button.dataset.model as ModelView));
  }

  // The presets' own changes are dispatched events (isTrusted false); only a
  // user's hand on a control ends the highlight.
  for (const id of CONTROL_IDS) {
    document.getElementById(id)?.addEventListener('change', (event) => {
      if (event.isTrusted) highlight(null);
    });
  }
  for (const id of ['mo-view-delocalized', 'mo-view-localized', 'mo-collapse']) {
    document.getElementById(id)?.addEventListener('click', (event) => {
      if (event.isTrusted) highlight(null);
    });
  }
}
