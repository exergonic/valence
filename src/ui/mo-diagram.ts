/**
 * The MO panel, in two views of the same calculation. **Delocalized** lists the
 * canonical orbitals — one row per level, ascending, lowest at the bottom —
 * and clicking a row draws that MO over the molecule. **Localized** lists the
 * Pipek–Mezey orbitals, also ascending by ⟨φ|H|φ⟩. Both are rows of the same
 * kind, because they describe the same electrons.
 *
 * The delocalized rows are RANKED, not placed by energy: true spacing is
 * didactic but squashes a dense virtual block into a single line, and a line is
 * a poor click target. Each row carries its energy and irrep instead, and
 * degenerate sets are marked (×2, ×3) with their members adjacent.
 *
 * The rows only ever show what the calculation produced, and say so: the
 * caption reads "extended Hückel (semiempirical)". An element outside the
 * parameter table gets a note instead of a list. An open shell still gets the
 * levels — they are real — with no occupancy and a note saying why: the
 * occupation comes from `closedShellOccupations`, which refuses an odd electron
 * count and a degenerate set the count would only partly fill (O₂'s π* pair).
 * The levels are real; the filling would be a lie.
 */
import type { SceneContext } from '../render';
import { activeIsoValue, setActiveIsoValue } from '../render';
import { MO_SURFACE_ISOVALUES, MO_SURFACE_PERCENTILES } from '../chem/extended-huckel/mo-surface';
import type { Molecule } from '../mol-parser';
import { closedShellOccupations } from '../chem/extended-huckel/solve';
import { CANONICAL_TOLERANCE_EV, DEGENERATE_TOLERANCE_EV } from '../chem/extended-huckel/canonicalize-degenerate';
import { labelIrreps } from '../chem/extended-huckel/irrep-labels';
import { MO_PHASE_PAIRS, MO_SIGNIFICANT } from '../render/mo-lobes';
import type { LocalizedCharacter, LocalizedOrbital } from '../chem/localized-orbitals/order-localized';
import { SP_ONLY_METALS } from '../chem/extended-huckel/parameters';
import { ENERGY_UNIT, formatEnergy } from './units';

/** How each localized-orbital class reads in the list — avo_ibo's own tokens,
 *  so our rows can be read beside an ibos.txt. */
const CHARACTER_LABEL: Record<LocalizedCharacter, string> = {
  'lone pair': 'LP',
  'lone pair s': 'LP-s',
  sigma: 'σ',
  pi: 'π',
  delta: 'δ',
  'three-centre': '2e3c',
  delocalized: 'Deloc',
  'sigma antibond': 'σ*',
  'pi antibond': 'π*',
  'delta antibond': 'δ*',
  antibond: 'anti*',
  virtual: 'virt',
};
/** How many coefficients the composition line lists. */
const TOP_CONTRIBUTORS = 6;

// Wider than the solver's exactness cut, on purpose: two levels a few meV
// apart would land on the same pixel and only the last would be clickable.
// The canonicalization note below is gated on the solver's own tolerance,
// so a near-miss is not described as a symmetry degeneracy.
const DEGENERATE_TOLERANCE = DEGENERATE_TOLERANCE_EV;

/** localStorage key for the MO panel's collapsed state (see setupMoPanel). */
const MO_COLLAPSED_KEY = 'valence:mo-collapsed';

/** What the rest of the UI may ask of the MO panel (the model-view presets). */
export interface MoPanel {
  setCollapsed(collapsed: boolean): void;
  setView(view: 'delocalized' | 'localized'): void;
  clearSelections(): void;
  selectHomo(): void;
}

export function setupMoPanel(ctx: SceneContext): MoPanel {
  const panel = document.getElementById('mo-panel')!;
  const list = document.getElementById('mo-list')!;
  const readout = document.getElementById('mo-readout')!;
  const composition = document.getElementById('mo-composition')!;
  const note = document.getElementById('mo-note')!;
  const clear = document.getElementById('ctrl-mo-clear') as HTMLButtonElement | null;
  const collapse = document.getElementById('mo-collapse') as HTMLButtonElement | null;
  const delocalizedTab = document.getElementById('mo-view-delocalized') as HTMLButtonElement | null;
  const localizedTab = document.getElementById('mo-view-localized') as HTMLButtonElement | null;

  const select = (index: number | null) => {
    ctx.display.moIndex = ctx.display.moIndex === index ? null : index;
    draw();
    ctx.rerender();
  };

  /** Picking a localized orbital adds it to the picture, or removes it if it
   *  was already there: several at once is the hyperconjugation view (a filled
   *  orbital and the empty one it reaches into). */
  const toggleLocalized = (index: number) => {
    const selected = ctx.display.localizedSelection;
    ctx.display.localizedSelection = selected.includes(index)
      ? selected.filter((i) => i !== index)
      : [...selected, index];
    draw();
    ctx.rerender();
  };

  const setView = (view: 'delocalized' | 'localized') => {
    if (ctx.display.orbitalView === view) return;
    ctx.display.orbitalView = view;
    // one picture at a time: the other view's selection stops drawing
    if (view === 'localized') ctx.display.moIndex = null;
    else ctx.display.localizedSelection = [];
    syncIsovalue();
    draw();
    ctx.rerender();
  };
  delocalizedTab?.addEventListener('click', () => setView('delocalized'));
  localizedTab?.addEventListener('click', () => setView('localized'));

  clear?.addEventListener('click', () => {
    if (ctx.display.orbitalView === 'localized') {
      ctx.display.localizedSelection = [];
      draw();
      ctx.rerender();
    } else {
      select(null);
    }
  });

  const opacity = document.getElementById('ctrl-mo-opacity') as HTMLInputElement | null;
  if (opacity) {
    opacity.value = String(ctx.display.moOpacity);
    opacity.addEventListener('input', () => {
      ctx.display.moOpacity = parseFloat(opacity.value);
      ctx.rerender();
    });
  }

  const isoMode = document.getElementById('ctrl-mo-isomode') as HTMLSelectElement | null;
  const isovalue = document.getElementById('ctrl-mo-isovalue') as HTMLSelectElement | null;
  // Each view keeps its own level in each mode, and switching tabs or modes
  // shows the value that belongs to what is now on stage. The option list is
  // rebuilt from the constants when the mode changes, so the labels and the
  // state cannot drift; the selection is then matched by VALUE, not by string,
  // because a constant written 0.1 stringifies to "0.1" while a label may
  // read "0.10".
  const valueList = () =>
    (ctx.display.isoMode === 'percentile' ? MO_SURFACE_PERCENTILES : MO_SURFACE_ISOVALUES).map(String);
  const syncIsovalue = () => {
    if (isoMode) isoMode.value = ctx.display.isoMode;
    if (!isovalue) return;
    const list = valueList();
    if (Array.from(isovalue.options).map((o) => o.value).join(',') !== list.join(',')) {
      isovalue.innerHTML = list.map((v) => `<option value="${v}">${v}</option>`).join('');
    }
    const level = activeIsoValue(ctx.display);
    const option = Array.from(isovalue.options).find((o) => parseFloat(o.value) === level);
    if (option) isovalue.value = option.value;
  };
  if (isoMode) {
    syncIsovalue();
    isoMode.addEventListener('change', () => {
      ctx.display.isoMode = isoMode.value === 'absolute' ? 'absolute' : 'percentile';
      // a percentile and an amplitude are different quantities; this shows the
      // value this mode already holds for this view rather than carrying one
      // across, which would mean something else on arrival
      syncIsovalue();
      ctx.rerender();
    });
  }
  if (isovalue) {
    syncIsovalue();
    isovalue.addEventListener('change', () => {
      setActiveIsoValue(ctx.display, parseFloat(isovalue.value));
      // nothing to clear: the field is level-independent, and the mesh cache is
      // keyed by the level, so the new one simply misses (see rebuildDisplay)
      ctx.rerender();
    });
  }

  const smooth = document.getElementById('ctrl-smooth-mo') as HTMLInputElement | null;
  if (smooth) {
    smooth.checked = ctx.display.smoothMo;
    smooth.addEventListener('change', () => {
      ctx.display.smoothMo = smooth.checked;
      ctx.rerender();
    });
  }
  const setCollapsed = (collapsed: boolean) => {
    panel.classList.toggle('collapsed', collapsed);
    try {
      localStorage.setItem(MO_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // private mode or no storage: the panel just won't remember
    }
    if (collapse) {
      collapse.textContent = collapsed ? '+' : '−';
      collapse.title = collapsed ? 'Expand' : 'Collapse';
    }
    draw();
  };
  collapse?.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));

  // A collapsed panel survives reloads — it is a workspace preference,
  // not a per-molecule state.
  try {
    if (localStorage.getItem(MO_COLLAPSED_KEY) === '1' && collapse) {
      panel.classList.add('collapsed');
      collapse.textContent = '+';
      collapse.title = 'Expand';
    }
  } catch {
    // no storage: open every time
  }

  // The panel is always on screen, so it has to follow the molecule: redraw
  // when a new scene is built (a new molecule means new orbitals).
  ctx.onSceneBuilt = () => draw();

  // The irrep labels cost a symmetry detection (~10 ms), so they are computed
  // once per solved molecule rather than per redraw.
  let labelled: { result: unknown; labels: (string | null)[] } | null = null;
  function irreps(): (string | null)[] {
    const result = ctx.ehResult;
    if (!result || !ctx.currentMolecule) return [];
    if (!labelled || labelled.result !== result) {
      labelled = {
        result,
        labels: labelIrreps(ctx.currentMolecule, result.basis, result.coefficients, result.energies, result.overlap),
      };
    }
    return labelled.labels;
  }

  /**
   * The localized list: one row per orbital, ordered as an energy ladder —
   * lowest at the bottom of the panel, rising as you read up, which is how the
   * Ladder tab and other programs draw an orbital list. The order is ⟨φ|H|φ⟩
   * within each section (see orderLocalizedOrbitals); the number itself is not
   * printed, because a localized orbital is not an eigenstate and a number
   * here would inherit the extended-Hückel parameters (PLAN.md Phase 4).
   */
  function drawLocalized(): void {
    const orbitals = ctx.localizedOrbitals;
    const molecule = ctx.currentMolecule;
    const basis = ctx.ehResult?.basis;
    if (!orbitals || !molecule || !basis) {
      note.textContent = ctx.currentMolecule
        ? 'No localized orbitals: the shell is not closed — an odd electron count, a degenerate set the '
          + 'count would only partly fill, or a molecule known to be open-shell.'
        : 'Load a molecule to see its orbitals.';
      return;
    }

    const selection = ctx.display.localizedSelection;
    const occupiedCount = orbitals.filter((o) => o.occupied).length;
    let section: 'occupied' | 'empty' | null = null;
    // bottom-up: the array ascends, the panel descends, so the highest-lying
    // orbital (the empties) sits at the top and the deepest at the bottom. The
    // rows are walked by INDEX, reversed — `data-index` must stay the array
    // index, which is what the selection and the click handler speak.
    list.innerHTML = orbitals.map((_, i) => i).reverse().map((index) => {
      const orbital = orbitals[index];
      let html = '';
      const tag = orbital.occupied ? 'occupied' : 'empty';
      if (tag !== section) {
        section = tag;
        const header = orbital.occupied
          ? `Occupied · ${occupiedCount}`
          : `Empty — valence-virtual · ${orbitals.length - occupiedCount}`;
        html += `<div class="orb-group">${header}</div>`;
      }
      const slot = selection.indexOf(index);
      const classes = slot >= 0 ? 'orb-item selected' : 'orb-item';
      // the dot carries the phase colour the orbital is drawn in, so the list
      // and the picture say the same thing when two orbitals are up at once
      const dot = slot >= 0
        ? `<span class="orb-dot" style="background:#${MO_PHASE_PAIRS[slot % MO_PHASE_PAIRS.length][0].toString(16).padStart(6, '0')}"></span>`
        : '<span class="orb-dot"></span>';
      // one Type column, as avo_ibo's table has — the class IS the type's tail
      return html + `<button class="${classes}" data-index="${index}">`
        + dot
        + `<span class="orb-type">${localizedType(molecule, orbital)}</span>`
        + '</button>';
    }).join('');
    list.querySelectorAll<HTMLButtonElement>('button.orb-item').forEach((node) => {
      node.addEventListener('click', () => toggleLocalized(Number(node.dataset.index)));
    });

    if (selection.length > 0) {
      const described = selection
        .map((index) => orbitals[index])
        .filter((orbital): orbital is LocalizedOrbital => !!orbital);
      readout.textContent = described
        .map((orbital) => `${localizedType(molecule, orbital)}${orbital.occupied ? '' : ' (empty)'}`)
        .join('  +  ')
        + (selection.length > 1 ? ' — click either again to drop it' : ' — click it again to hide');
      // the composition line describes the LAST orbital picked: two orbitals
      // have no joint composition, and the latest pick is the one being read
      const latest = orbitals[selection[selection.length - 1]];
      if (latest) {
        composition.textContent = `${localizedType(molecule, latest)}: `
          + compositionText(basis, latest.coefficients);
      }
    } else {
      readout.textContent = `${orbitals.length} localized orbitals · click one to draw it, another to compare`;
    }
    note.textContent = 'Pipek–Mezey localization of the extended-Hückel orbitals (semiempirical): the delocalized MOs rearranged into bonds and lone pairs, occupied space and valence-virtual space alike, listed as an energy ladder — lowest at the bottom. Pick one from each section to see a hyperconjugation interaction. No energies are printed: a localized orbital is not an eigenstate, so the order uses the one-electron expectation ⟨φ|H|φ⟩ while the numbers themselves would inherit the parameter sensitivity.';
  }

  function draw(): void {
    const result = ctx.ehResult;
    const view = ctx.display.orbitalView;
    list.innerHTML = '';
    note.textContent = '';
    readout.textContent = '';
    composition.textContent = '';
    // The picture controls only mean something with an orbital selected — say
    // so rather than letting a drag do nothing.
    const hasSelection = view === 'localized'
      ? !!ctx.localizedOrbitals && ctx.display.localizedSelection.length > 0
      : result !== null && ctx.display.moIndex !== null;
    for (const control of [smooth, opacity, isovalue]) if (control) control.disabled = !hasSelection;
    delocalizedTab?.classList.toggle('active', view === 'delocalized');
    localizedTab?.classList.toggle('active', view === 'localized');
    if (panel.classList.contains('collapsed')) return;

    if (view === 'localized') {
      drawLocalized();
      return;
    }

    const selected = ctx.display.moIndex;
    if (!result) {
      note.textContent = ctx.currentMolecule
        ? 'No orbitals: an element here is outside the extended-Hückel parameter table.'
        : 'Load a molecule to see its orbitals.';
      return;
    }
    const spOnly = spOnlyMetals(ctx.currentMolecule);

    const occupations = closedShellOccupations(
      result.electronCount, result.energies.length, result.energies, ctx.currentMolecule?.multiplicity ?? 1,
    );
    const levels = result.energies.map((energy, index) => ({
      index,
      energy,
      occupied: occupations ? occupations[index] > 0 : false,
      homo: false,
      lumo: false,
    }));
    if (occupations) {
      const filled = occupations.filter((o) => o > 0).length;
      if (filled > 0) levels[filled - 1].homo = true;
      if (filled < levels.length) levels[filled].lumo = true;
    }

    // One button per level, styled exactly like the localized list — same row,
    // same dot, same selected state — because two views of the same orbitals
    // should not need two visual languages. Rows are RANKED rather than placed
    // by energy: the true spacing is didactic but squashes a dense virtual
    // block into one line, and a line is a poor click target. The energy moves
    // onto the row, where it reads as well as it did on an axis. Ascending,
    // lowest at the bottom, matching the localized ladder — which means the DOM
    // runs the other way round, since a column starts at the top.
    const groups: typeof levels[] = [];
    for (const level of levels) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(last[0].energy - level.energy) < DEGENERATE_TOLERANCE) last.push(level);
      else groups.push([level]);
    }
    const labels = irreps();
    const rows: string[] = [];
    const emptyCount = occupations ? levels.filter((l) => !l.occupied).length : 0;
    let section: boolean | null = null;
    for (const group of [...groups].reverse()) {
      // The occupied/empty split, as the localized list has it. Only when the
      // filling is known: an open shell (or a partly-filled degenerate set)
      // has levels but no determined occupancy, and a header would invent one.
      if (occupations) {
        const occupied = group[0].occupied;
        if (occupied !== section) {
          section = occupied;
          rows.push(
            `<div class="orb-group">${occupied
              ? `Occupied · ${levels.length - emptyCount}`
              : `Empty · ${emptyCount}`}</div>`,
          );
        }
      }
      // the frontier can sit inside a degenerate set, so the tag belongs to the
      // group rather than to whichever member happens to be listed first.
      // Degenerate partners simply share an energy; a ×n marker beside the
      // number read as a multiplier on the orbital and was dropped.
      const tag = group.some((l) => l.homo) ? 'HOMO' : group.some((l) => l.lumo) ? 'LUMO' : '';
      for (const level of group) {
        const drawn = ctx.display.moIndex === level.index;
        const phase = drawn
          ? ` style="background:#${MO_PHASE_PAIRS[0][0].toString(16).padStart(6, '0')}"`
          : '';
        const irrep = labels[level.index];
        rows.push(
          `<button class="orb-item${drawn ? ' selected' : ''}" data-index="${level.index}">`
          + `<span class="orb-dot"${phase}></span>`
          + `<span class="orb-type">MO ${level.index + 1}`
          + (irrep ? ` · ${irrep}` : '')
          + ` · ${formatEnergy(level.energy)} ${ENERGY_UNIT}</span>`
          + (tag ? `<span class="orb-tag">${tag}</span>` : '')
          + '</button>',
        );
      }
    }
    list.innerHTML = rows.join('');
    list.querySelectorAll<HTMLButtonElement>('button.orb-item').forEach((node) => {
      node.addEventListener('click', () => select(Number(node.dataset.index)));
    });
    // Nothing is clipped away any more, so the frontier is brought into view
    // instead — the level a chemist starts at, or the one already drawn.
    const focus = list.querySelector('button.orb-item.selected')
      ?? Array.from(list.querySelectorAll('button.orb-item')).find((b) => b.querySelector('.orb-tag'));
    focus?.scrollIntoView({ block: 'center' });

    // readout + composition of the selected orbital
    if (selected !== null && result.energies[selected] !== undefined) {
      const energy = result.energies[selected];
      const occupancy = occupations ? occupations[selected] : null;
      const partners = result.energies
        .map((e, i) => ({ e, i }))
        .filter(({ e, i }) => i !== selected && Math.abs(e - energy) < DEGENERATE_TOLERANCE)
        .map(({ i }) => i + 1);
      const irrep = irreps()[selected];
      readout.textContent = `MO ${selected + 1} · ${formatEnergy(energy)} ${ENERGY_UNIT}`
        + (irrep ? ` · ${irrep}` : '')
        + (occupancy === null ? '' : occupancy > 0 ? ' · occupied' : ' · empty')
        + (partners.length > 0 ? ` · degenerate with MO ${partners.join(', ')}` : '')
        + ' — click it again to hide';
      composition.textContent = compositionText(result.basis, result.coefficients[selected])
        // A linear molecule's two non-zero moments of inertia are equal, so
        // the axes perpendicular to the molecular axis are degenerate and the
        // frame's choice between them is arbitrary. That makes the px/py/pz
        // names a statement about the frame rather than about the molecule —
        // most visible on a σ orbital, which is the p *along* the axis
        // whichever name it landed on (N₂'s σ HOMO reads "2py"). Said here,
        // beside the labels, rather than "fixed" in the calculation: they are
        // correct for the frame, and a linear molecule has no chemistry for
        // the frame to align to. Deliberately not solved by re-aligning the
        // oracle fixtures — see NOTES.md.
        + (isLinear(ctx.currentMolecule)
          ? '\u2003(linear molecule: the perpendicular p axes are degenerate, so these px/py/pz names are the calculation frame\'s choice)'
          : '');
      const exactPartners = partners.filter((mo) => Math.abs(result.energies[mo - 1] - energy) < CANONICAL_TOLERANCE_EV);
      if (exactPartners.length > 0) {
        // Worth saying out loud: a degenerate set is *a* subspace, and any
        // orthogonal combination inside it is the same physics. The solver
        // canonicalizes each set against x², y², z², which is what makes it
        // the combination a textbook draws (and another program's, too) —
        // but which member carries the nodes follows the frame's own axes.
        // Only an exact set was rotated. A level merely within the drawing
        // tolerance was not, and saying so would be a false label.
        note.textContent = `Degenerate set of ${exactPartners.length + 1}: canonicalized against x², y², z², so these are the symmetry-adapted orbitals a textbook draws — which member carries the nodal plane follows the molecule's own frame.`;
        return;
      }
    } else {
      readout.textContent = `${result.energies.length} MOs · click a level to draw it`;
    }

    if (spOnly.length > 0) {
      // said out loud rather than silently: these metals carry no d here
      note.textContent = `${spOnly.join(', ')} run on s and p only — the parameter table has no 3d for `
        + `${spOnly.length === 1 ? 'it' : 'them'}, and a d¹⁰ shell is core-like. Their d orbitals are absent, not hidden.`;
      return;
    }
    if (occupations === null) {
      const multiplicity = ctx.currentMolecule?.multiplicity ?? 1;
      note.textContent = multiplicity > 1
        ? `Open shell (a ${SPIN_NAME[multiplicity] ?? `multiplicity-${multiplicity}`}): extended `
          + 'Hückel as built here is closed-shell and has no spin, so no occupancy arrows and no localized orbitals.'
        : `Open shell (${result.electronCount} electrons): extended Hückel as built here has no spin, so occupancies are not shown.`;
    }
  }

  draw();

  return {
    setCollapsed,
    setView,
    /** Stop drawing any MO or localized orbital — the VSEPR lobes and the
     *  plain molecule are then what is on stage. */
    clearSelections: () => {
      ctx.display.moIndex = null;
      ctx.display.localizedSelection = [];
      draw();
      ctx.rerender();
    },
    /** Draw the highest occupied orbital of the current view — the frontier
     *  orbital a chemist starts at. In the localized list that is the top row
     *  of the Occupied section (highest ⟨φ|H|φ⟩); on the ladder, a degenerate
     *  HOMO is a set, and its top row — the lowest-numbered partner — is
     *  drawn. Nothing for an open shell, which has no settled HOMO. */
    selectHomo: () => {
      ctx.display.moIndex = null;
      ctx.display.localizedSelection = [];
      if (ctx.display.orbitalView === 'localized') {
        // the occupied section comes first in the array, ascending in ⟨φ|H|φ⟩,
        // so its last member is the top row of the Occupied list
        const orbitals = ctx.localizedOrbitals ?? [];
        let homo = -1;
        for (let i = 0; i < orbitals.length; i++) if (orbitals[i].occupied) homo = i;
        if (homo >= 0) ctx.display.localizedSelection = [homo];
      } else if (ctx.ehResult) {
        const energies = ctx.ehResult.energies;
        const occupations = closedShellOccupations(
          ctx.ehResult.electronCount, energies.length, energies, ctx.currentMolecule?.multiplicity ?? 1,
        );
        const homo = occupations ? occupations.filter((o) => o > 0).length - 1 : -1;
        // the first member of the HOMO's group, grouped as the ladder groups
        // its rows: a level joins a group within tolerance of its first member
        let first = 0;
        for (let i = 1; i <= homo; i++) {
          if (Math.abs(energies[first] - energies[i]) >= DEGENERATE_TOLERANCE) first = i;
        }
        if (homo >= 0) ctx.display.moIndex = first;
      }
      draw();
      ctx.rerender();
    },
  };
}

/** The spin names a chemist reads, for the open-shell note. */
const SPIN_NAME: Record<number, string> = { 2: 'doublet', 3: 'triplet', 4: 'quartet', 5: 'quintet' };

/** The elements in this molecule the table carries s+p only for (Zn, Cd). */
function spOnlyMetals(molecule: Molecule | null | undefined): string[] {
  if (!molecule) return [];
  const found = new Set<string>();
  for (const atom of molecule.atoms) {
    const element = atom.element.toUpperCase();
    if (SP_ONLY_METALS.has(element)) found.add(atom.element);
  }
  return [...found];
}

/** Is every atom on one line? The frame cannot tell a linear molecule's two
 *  perpendicular axes apart, which is what the note above is about. */
function isLinear(molecule: Molecule | null | undefined): boolean {
  if (!molecule || molecule.atoms.length < 2) return false;
  if (molecule.atoms.length === 2) return true;
  const [first] = molecule.atoms;
  let farthest = molecule.atoms[1];
  for (const atom of molecule.atoms) {
    const d = Math.hypot(atom.x - first.x, atom.y - first.y, atom.z - first.z);
    const f = Math.hypot(farthest.x - first.x, farthest.y - first.y, farthest.z - first.z);
    if (d > f) farthest = atom;
  }
  const axis = [farthest.x - first.x, farthest.y - first.y, farthest.z - first.z];
  const length = Math.hypot(...axis);
  if (length < 1e-9) return false;
  return molecule.atoms.every((atom) => {
    const v = [atom.x - first.x, atom.y - first.y, atom.z - first.z];
    const along = (v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]) / length;
    return Math.hypot(
      v[0] - (along * axis[0]) / length,
      v[1] - (along * axis[1]) / length,
      v[2] - (along * axis[2]) / length,
    ) < 1e-3;
  });
}

/** "C2 2pz −0.46 · C3 2pz −0.46 · …" — the biggest contributors to an orbital,
 *  which is what a chemist compares against another program's output. */
function compositionText(basis: Array<{ label: string }>, coefficients: number[]): string {
  if (!coefficients) return '';
  const largest = Math.max(...coefficients.map(Math.abs));
  const ranked = coefficients
    .map((c, i) => ({ c, label: basis[i].label }))
    // the same threshold the lobes are drawn with: the line describes the
    // picture, so a numerically-tiny coefficient is not listed as a
    // "contribution" (a π MO has 24 of those, all rounding noise)
    .filter((e) => largest > 0 && Math.abs(e.c) / largest >= MO_SIGNIFICANT)
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
  const shown = ranked.slice(0, TOP_CONTRIBUTORS).map((e) => {
    // "C( 2) 2pz" -> "C2 2pz"
    const short = e.label.replace(/\(\s*(\d+)\)/, '$1').replace(/\s+/g, ' ');
    return `${short} ${e.c >= 0 ? '+' : '−'}${Math.abs(e.c).toFixed(2)}`;
  });
  return shown.join('  ·  ') + (ranked.length > shown.length ? `  ·  +${ranked.length - shown.length} more` : '');
}

/**
 * The orbital's Type string, composed the way avo_ibo's table composes it:
 * a lone pair is `O1(LP)`, a two-centre bond `C1-H7 σ` (atoms in index order),
 * a three-centre one `B1-B6-H5 2e3c` (element then index), and a delocalized
 * orbital is just `Deloc` — their table gives it no composition prefix. A
 * virtual that still lives on one atom reads `Cl4(virt)`.
 */
function localizedType(molecule: Molecule, orbital: LocalizedOrbital): string {
  const name = (atom: number) => `${molecule.atoms[atom].element}${atom + 1}`;
  const joined = (atoms: number[]) => atoms.map(name).join('-');
  const kind = CHARACTER_LABEL[orbital.character];

  if (orbital.character === 'lone pair' || orbital.character === 'lone pair s' || orbital.character === 'virtual') {
    return `${joined(orbital.atoms.slice(0, 1))}(${kind})`;
  }
  if (orbital.character === 'delocalized') return kind;
  if (orbital.character === 'three-centre') {
    const sorted = [...orbital.atoms].sort((a, b) => {
      const ea = molecule.atoms[a].element;
      const eb = molecule.atoms[b].element;
      return ea === eb ? a - b : ea.localeCompare(eb);
    });
    return `${joined(sorted)} ${kind}`;
  }
  // a two-centre bond, in index order; a one-atom virtual keeps its own form
  const pair = orbital.atoms.slice(0, 2).sort((a, b) => a - b);
  return pair.length === 1 ? `${joined(pair)} ${kind}` : `${joined(pair)} ${kind}`;
}
