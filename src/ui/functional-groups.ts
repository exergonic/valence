/**
 * The functional groups behind the sketcher's "Groups…" button: a group is
 * put on by clicking (or dropping onto) an end atom of the sketch, and like
 * an element it takes that atom's place (the toolbar's groupInPlaceOfAtom).
 * A ring or chain atom has no place to give: draw a bond from it first.
 *
 * Each is one of JSME's own substituent actions — `setAction(code)`, then a
 * click on an atom bonds the group to it. The codes were read off JSME's
 * tooltip table and each checked by attaching it to methanol's O
 * (2026-10-20). JSME's `setTemplate`, which would take any SMILES, attached
 * nothing on click, so the list is JSME's. NO₂ comes in charge-separated,
 * N⁺–O⁻, under JSME's polarnitro option (index.html). One gap: it has no
 * phenyl substituent — its benzene tool on an atom builds the ring through
 * that atom.
 */

export interface FunctionalGroup {
  /** JSME's setAction() code. */
  code: number;
  /** How the button reads: the group as a chemist abbreviates it. */
  label: string;
  /** Its name, for the tooltip. */
  name: string;
}

/** By family, in the order a course meets them. */
export const GROUP_FAMILIES: Array<{ family: string; groups: FunctionalGroup[] }> = [
  {
    family: 'Oxygen and nitrogen',
    groups: [
      { code: 259, label: 'OH', name: 'hydroxyl' },
      { code: 250, label: '=O', name: 'oxo: double-bonded where the atom clicked was' },
      { code: 258, label: 'NH₂', name: 'amino' },
      { code: 243, label: 'NMe₂', name: 'dimethylamino' },
    ],
  },
  {
    family: 'Carbonyl',
    groups: [
      { code: 249, label: 'CHO', name: 'formyl (an aldehyde)' },
      { code: 235, label: 'COOH', name: 'carboxyl (a carboxylic acid)' },
      { code: 240, label: 'CO₂Me', name: 'methoxycarbonyl (a methyl ester)' },
      { code: 260, label: 'CONH₂', name: 'carbamoyl (a primary amide)' },
      { code: 241, label: 'OAc', name: 'acetoxy (an acetate ester)' },
      { code: 261, label: 'NHCHO', name: 'formamido' },
    ],
  },
  {
    family: 'Nitrogen, sulfur, phosphorus',
    groups: [
      { code: 242, label: 'CN', name: 'cyano (a nitrile)' },
      { code: 234, label: 'NO₂', name: 'nitro (built as N⁺–O⁻)' },
      { code: 239, label: 'SO₃H', name: 'sulfo (a sulfonic acid)' },
      { code: 252, label: 'SO₂NH₂', name: 'sulfamoyl (a sulfonamide)' },
      { code: 244, label: 'NHSO₂Me', name: 'methanesulfonamido' },
      { code: 251, label: 'PO₃H₂', name: 'phosphono (a phosphonic acid)' },
    ],
  },
  {
    family: 'Carbon',
    groups: [
      { code: 246, label: 'Et', name: 'ethyl' },
      { code: 247, label: 'Pr', name: 'propyl' },
      { code: 248, label: 'Bu', name: 'butyl' },
      { code: 233, label: 'tBu', name: 'tert-butyl' },
      { code: 238, label: 'C≡CH', name: 'ethynyl' },
      { code: 245, label: 'C≡CMe', name: 'prop-1-ynyl' },
      { code: 236, label: 'CF₃', name: 'trifluoromethyl' },
      { code: 237, label: 'CCl₃', name: 'trichloromethyl' },
    ],
  },
  {
    family: 'Rings',
    groups: [
      { code: 221, label: '2-Furyl', name: 'furan-2-yl' },
      { code: 223, label: '3-Furyl', name: 'furan-3-yl' },
    ],
  },
];

export function groupByCode(code: number): FunctionalGroup | undefined {
  for (const { groups } of GROUP_FAMILIES) {
    const found = groups.find((group) => group.code === code);
    if (found) return found;
  }
  return undefined;
}

/**
 * Build the popover and wire it to its button, as the periodic table is: a
 * pick closes it and hands the group to `onPick`; Escape or a click
 * elsewhere closes it unpicked. Returns its close, for a group dragged out
 * of it (sketcher-toolbar.ts).
 */
export function setupGroupPalette(trigger: HTMLButtonElement, onPick: (group: FunctionalGroup) => void): () => void {
  const panel = document.createElement('div');
  panel.id = 'group-palette';
  panel.className = 'hidden';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Functional groups');
  for (const { family, groups } of GROUP_FAMILIES) {
    const heading = document.createElement('div');
    heading.className = 'fg-family';
    heading.textContent = family;
    panel.appendChild(heading);
    const row = document.createElement('div');
    row.className = 'fg-row';
    for (const group of groups) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'fg-cell';
      cell.textContent = group.label;
      cell.dataset.code = String(group.code);
      cell.title = `${group.label} — ${group.name}`;
      row.appendChild(cell);
    }
    panel.appendChild(row);
  }
  const note = document.createElement('p');
  note.className = 'pt-legend';
  note.textContent = 'Drag a group onto an end atom of the sketch, or pick it and click the atom: the group takes its place. For a group on a ring, draw a bond from the ring first. A group used gets a button in the element row, to click or drag again.';
  panel.appendChild(note);
  document.body.appendChild(panel);

  const isOpen = () => !panel.classList.contains('hidden');
  const close = (refocus: boolean) => {
    if (!isOpen()) return;
    panel.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    if (refocus) trigger.focus();
  };
  const open = () => {
    panel.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    // below the button, kept inside the window
    const t = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(t.left, window.innerWidth - panel.offsetWidth - 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${t.bottom + 6}px`;
    panel.querySelector<HTMLButtonElement>('.fg-cell')?.focus();
  };

  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => (isOpen() ? close(false) : open()));
  panel.addEventListener('click', (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLButtonElement>('.fg-cell');
    const group = cell?.dataset.code ? groupByCode(Number(cell.dataset.code)) : undefined;
    if (!group) return;
    close(false);
    onPick(group);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close(true);
  });
  document.addEventListener('mousedown', (event) => {
    const target = event.target as Node;
    if (isOpen() && !panel.contains(target) && !trigger.contains(target)) close(false);
  });
  return () => close(false);
}
