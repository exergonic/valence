/**
 * The MO panel: the extended-Hückel orbital ladder, and clicking a level
 * draws that MO over the molecule.
 *
 * The diagram is the textbook one — energy up the side, one line per orbital,
 * the occupied ones filled with their α/β pair — but it only ever shows what
 * the calculation actually produced, and it says so: the caption reads
 * "extended Hückel (semiempirical)". An element outside the parameter table
 * gets a note instead of a ladder. An open shell still gets the ladder — the
 * levels are real — with no occupancy arrows and a note saying why.
 *
 * Three rendering choices worth knowing:
 *  - The axis is WINDOWED around the occupied ladder (deep σ levels and very
 *    high virtuals sit tens of eV away and would flatten everything between).
 *    Levels outside the window are drawn as edge markers with their energy,
 *    never dropped silently.
 *  - The levels come straight from the solver; the occupancy comes from
 *    `closedShellOccupations`, which refuses an odd electron count and a
 *    degenerate set that the electron count would only partly fill (O₂'s π*
 *    pair). Either one shows the ladder with no occupancy and a warning —
 *    the levels are real, the filling would be a lie.
 *  - The panel is sized by CSS and the ladder is drawn to whatever room it
 *    has, so it stays legible when the panel is resized or collapsed.
 */
import type { SceneContext } from '../render';
import { activeIsovalue } from '../render';
import type { Molecule } from '../mol-parser';
import { closedShellOccupations } from '../chem/extended-huckel/solve';
import { CANONICAL_TOLERANCE_EV, DEGENERATE_TOLERANCE_EV } from '../chem/extended-huckel/canonicalize-degenerate';
import { labelIrreps } from '../chem/extended-huckel/irrep-labels';
import { MO_PHASE_PAIRS, MO_SIGNIFICANT } from '../render/mo-lobes';
import type { LocalizedCharacter, LocalizedOrbital } from '../chem/localized-orbitals/order-localized';
import { SP_ONLY_METALS } from '../chem/extended-huckel/parameters';

const PAD = { top: 16, bottom: 20, left: 44, right: 58 };

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
/** Levels this far outside the occupied ladder still get axis room. */
const BELOW_OCCUPIED = 4;
const ABOVE_OCCUPIED = 6;

/** How many coefficients the composition line lists. */
const TOP_CONTRIBUTORS = 6;

// Wider than the solver's exactness cut, on purpose: two levels a few meV
// apart would land on the same pixel and only the last would be clickable.
// The canonicalization note below is gated on the solver's own tolerance,
// so a near-miss is not described as a symmetry degeneracy.
const DEGENERATE_TOLERANCE = DEGENERATE_TOLERANCE_EV;

export function setupMoPanel(ctx: SceneContext) {
  const panel = document.getElementById('mo-panel')!;
  const diagram = document.getElementById('mo-diagram')!;
  const list = document.getElementById('mo-list')!;
  const readout = document.getElementById('mo-readout')!;
  const composition = document.getElementById('mo-composition')!;
  const note = document.getElementById('mo-note')!;
  const clear = document.getElementById('ctrl-mo-clear') as HTMLButtonElement | null;
  const collapse = document.getElementById('mo-collapse') as HTMLButtonElement | null;
  const ladderTab = document.getElementById('mo-view-ladder') as HTMLButtonElement | null;
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

  const setView = (view: 'ladder' | 'localized') => {
    if (ctx.display.orbitalView === view) return;
    ctx.display.orbitalView = view;
    // one picture at a time: the other view's selection stops drawing
    if (view === 'localized') ctx.display.moIndex = null;
    else ctx.display.localizedSelection = [];
    syncIsovalue();
    draw();
    ctx.rerender();
  };
  ladderTab?.addEventListener('click', () => setView('ladder'));
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

  const isovalue = document.getElementById('ctrl-mo-isovalue') as HTMLSelectElement | null;
  // Each view keeps its own level (see activeIsovalue): switching tabs shows
  // the level that view was last drawn at rather than the other one's. The
  // option is matched by VALUE, not by string: the control's labels are
  // 2-decimal ("0.10") while a default written as 0.1 stringifies to "0.1",
  // which matches nothing and blanks the control.
  const syncIsovalue = () => {
    if (!isovalue) return;
    const level = activeIsovalue(ctx.display);
    const option = Array.from(isovalue.options).find((o) => parseFloat(o.value) === level);
    if (option) isovalue.value = option.value;
  };
  if (isovalue) {
    syncIsovalue();
    isovalue.addEventListener('change', () => {
      const field = ctx.display.orbitalView === 'localized' ? 'localizedIsovalue' : 'moIsovalue';
      ctx.display[field] = parseFloat(isovalue.value);
      // every cached surface was extracted at the old level
      ctx.moSurfaces.clear();
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
  collapse?.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    collapse.textContent = collapsed ? '+' : '−';
    collapse.title = collapsed ? 'Expand' : 'Collapse';
    draw();
  });

  // The panel is always on screen, so it has to follow the molecule: redraw
  // when a new scene is built (a new molecule means new orbitals).
  ctx.onSceneBuilt = () => draw();

  // The ladder is drawn at whatever size the panel has, and the panel's size
  // follows the dock (the controls panel above it changes height with its
  // tab), so redraw when it actually changes — guarded by the last drawn size
  // so a redraw cannot feed the observer its own trigger.
  let drawn = { width: 0, height: 0 };
  const observer = new ResizeObserver(() => {
    // hidden in the localized view: a zero-size SVG would redraw forever
    if (!diagram.clientWidth && !diagram.clientHeight) return;
    const width = diagram.clientWidth;
    const height = diagram.clientHeight;
    if (Math.abs(width - drawn.width) > 1 || Math.abs(height - drawn.height) > 1) draw();
  });
  observer.observe(diagram);

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
        html += `<div class="lmo-group">${header}</div>`;
      }
      const slot = selection.indexOf(index);
      const classes = slot >= 0 ? 'lmo-item selected' : 'lmo-item';
      // the dot carries the phase colour the orbital is drawn in, so the list
      // and the picture say the same thing when two orbitals are up at once
      const dot = slot >= 0
        ? `<span class="lmo-dot" style="background:#${MO_PHASE_PAIRS[slot % MO_PHASE_PAIRS.length][0].toString(16).padStart(6, '0')}"></span>`
        : '<span class="lmo-dot"></span>';
      // one Type column, as avo_ibo's table has — the class IS the type's tail
      return html + `<button class="${classes}" data-index="${index}">`
        + dot
        + `<span class="lmo-type">${localizedType(molecule, orbital)}</span>`
        + '</button>';
    }).join('');
    list.querySelectorAll<HTMLButtonElement>('button.lmo-item').forEach((node) => {
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
    diagram.innerHTML = '';
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
    ladderTab?.classList.toggle('active', view === 'ladder');
    localizedTab?.classList.toggle('active', view === 'localized');
    diagram.classList.toggle('hidden', view === 'localized');
    list.classList.toggle('hidden', view !== 'localized');
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

    const width = Math.max(240, diagram.clientWidth || 340);
    const height = Math.max(200, diagram.clientHeight || 300);
    drawn = { width: diagram.clientWidth, height: diagram.clientHeight };
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

    // The energy window: the occupied ladder plus a margin, so a deep σ level
    // or a very high virtual does not squash the frontier into one line.
    const occupiedEnergies = levels.filter((l) => l.occupied).map((l) => l.energy);
    const anchor = occupiedEnergies.length > 0 ? occupiedEnergies : levels.map((l) => l.energy);
    const lo = Math.min(...anchor) - BELOW_OCCUPIED;
    const hi = Math.max(...anchor) + ABOVE_OCCUPIED;
    const y = (energy: number) => PAD.top + ((hi - energy) / (hi - lo)) * (height - PAD.top - PAD.bottom);

    const parts: string[] = [];
    parts.push(`<line class="mo-axis" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${height - PAD.bottom}"/>`);
    for (const tick of axisTicks(lo, hi)) {
      const ty = y(tick);
      parts.push(`<line class="mo-tick" x1="${PAD.left - 5}" y1="${ty.toFixed(1)}" x2="${PAD.left}" y2="${ty.toFixed(1)}"/>`);
      parts.push(`<text class="mo-tick-label" x="${PAD.left - 8}" y="${(ty + 4).toFixed(1)}">${tick}</text>`);
    }

    const x0 = PAD.left + 12;
    const x1 = width - PAD.right;
    // a generous click target, but never wider than the row spacing or a
    // click could land on the neighbouring orbital
    const spacing = (height - PAD.top - PAD.bottom) / Math.max(1, levels.length);
    const hit = Math.max(6, Math.min(16, spacing)).toFixed(1);

    /** One clickable bar — a segment of a degenerate group, or a lone level. */
    const bar = (
      level: (typeof levels)[number], sx0: number, sx1: number, ly: number,
      opts: { clipped: boolean; tag: string; hitWidth: number },
    ) => {
      const classes = ['mo-level'];
      if (level.occupied) classes.push('occupied');
      if (level.index === selected) classes.push('selected');
      if (opts.clipped) classes.push('clipped');
      const arrows = level.occupied && !opts.clipped
        ? `<text class="mo-arrows" x="${(sx1 + 4).toFixed(1)}" y="${(ly + 5).toFixed(1)}">↑↓</text>`
        : '';
      parts.push(
        `<g class="${classes.join(' ')}" data-index="${level.index}">`
        + `<line class="mo-hit" stroke-width="${opts.hitWidth.toFixed(1)}" x1="${sx0.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${sx1.toFixed(1)}" y2="${ly.toFixed(1)}"/>`
        + `<line class="mo-bar" x1="${sx0.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${sx1.toFixed(1)}" y2="${ly.toFixed(1)}"/>`
        + arrows
        + (opts.tag ? `<text class="mo-tag" x="${x1 + 24}" y="${(ly + 5).toFixed(1)}">${opts.tag}</text>` : '')
        + `<title>MO ${level.index + 1}: ${level.energy.toFixed(3)} eV</title>`
        + '</g>',
      );
    };

    // In the window: one row per energy, and degenerate orbitals as
    // side-by-side bars — each its own click target, the way a textbook
    // orbital diagram shows them. Drawn as a single line, all but the last are
    // unreachable, which is what the reporter hit.
    const inWindow = levels.filter((l) => l.energy >= lo && l.energy <= hi);
    const groups: typeof levels[] = [];
    for (const level of inWindow) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(last[0].energy - level.energy) < DEGENERATE_TOLERANCE) last.push(level);
      else groups.push([level]);
    }
    for (const group of groups) {
      const first = group[0];
      const ly = y(first.energy);
      const tag = first.homo ? 'HOMO' : first.lumo ? 'LUMO' : '';
      const gap = 4;
      const segmentWidth = (x1 - x0 - (group.length - 1) * gap) / group.length;
      group.forEach((level, k) => {
        const sx0 = x0 + k * (segmentWidth + gap);
        bar(level, sx0, sx0 + segmentWidth, ly, {
          clipped: false,
          tag: k === group.length - 1 ? tag : '',
          hitWidth: Number(hit),
        });
      });
    }

    // Outside the window: stacked in a compact band at the edge, off-scale but
    // still clickable (the readout names the energy). Grouping these by energy
    // would be wrong — they are not degenerate, just far away.
    const band = Math.min(30, (height - PAD.top - PAD.bottom) / 5);
    const outside: Array<[typeof levels, boolean]> = [
      [levels.filter((l) => l.energy > hi), true],
      [levels.filter((l) => l.energy < lo), false],
    ];
    for (const [list, atTop] of outside) {
      const step = band / Math.max(1, list.length);
      list.forEach((level, i) => {
        const ly = atTop
          ? PAD.top + 2 + i * step
          : height - PAD.bottom - 2 - (list.length - 1 - i) * step;
        bar(level, x0 + 12, x1 - 12, ly, {
          clipped: true,
          tag: '',
          // the band is tight: cap the target to the band's own spacing so
          // each off-scale level is still reachable
          hitWidth: Math.max(3, Math.min(Number(hit), step)),
        });
      });
    }

    diagram.innerHTML =
      `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="mo-svg">${parts.join('')}</svg>`;
    diagram.querySelectorAll<SVGGElement>('g.mo-level').forEach((node) => {
      node.addEventListener('click', () => select(Number(node.dataset.index)));
    });

    // readout + composition of the selected orbital
    if (selected !== null && result.energies[selected] !== undefined) {
      const energy = result.energies[selected];
      const occupancy = occupations ? occupations[selected] : null;
      const partners = result.energies
        .map((e, i) => ({ e, i }))
        .filter(({ e, i }) => i !== selected && Math.abs(e - energy) < DEGENERATE_TOLERANCE)
        .map(({ i }) => i + 1);
      const irrep = irreps()[selected];
      readout.textContent = `MO ${selected + 1} · ${energy.toFixed(3)} eV`
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
    } else {
      const hidden = levels.filter((l) => l.energy < lo || l.energy > hi).length;
      if (hidden > 0) {
        note.textContent = `${hidden} level${hidden === 1 ? '' : 's'} outside the window, stacked at the edge — click one to read its energy.`;
      }
    }
  }

  draw();
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

/** Tick values at 5 eV steps inside [lo, hi]. */
function axisTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(lo / 5) * 5;
  for (let v = first; v <= hi; v += 5) ticks.push(v);
  return ticks;
}
