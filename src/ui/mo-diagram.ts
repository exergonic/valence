/**
 * The MO panel, in two views of the same calculation. **Delocalized** lists the
 * canonical orbitals — GFN2-xTB's by default, extended Hückel's beside them —
 * one row per level, ascending, lowest at the bottom, and clicking a row draws
 * that MO over the molecule. **Localized** lists the Pipek–Mezey orbitals —
 * GFN2-xTB's, or extended Hückel's when GFN2 has none to give — also ascending
 * by ⟨φ|H|φ⟩. Both are rows of the same kind, because they describe the same
 * electrons.
 *
 * The delocalized rows are RANKED, not placed by energy: true spacing is
 * didactic but squashes a dense virtual block into a single line, and a line is
 * a poor click target. Each row carries its energy and irrep instead, with the
 * members of a degenerate set adjacent.
 *
 * The rows only ever show what the calculation produced, and the note says
 * which calculation that was. An element a calculation cannot treat gets a
 * note instead of a list. GFN2-xTB treats an open shell, one spin channel at a
 * time. Extended Hückel as built here has no spin, so an open shell gets its
 * levels — they are real — with no occupancy and a note saying why: its
 * filling, `closedShellOccupations`, refuses an odd electron count and a
 * degenerate set the count would only partly fill (O₂'s π* pair). The levels
 * are real; the filling would be a lie.
 */
import type { SceneContext } from '../render';
import { activeIsoValue, setActiveIsoValue, gfn2LadderOnScreen, localizedOnScreen, type LocalizedList } from '../render';
import type { BasisFunction } from '../chem/extended-huckel/assign-basis';
import { MO_SURFACE_ISOVALUES, MO_SURFACE_PERCENTILES } from '../chem/extended-huckel/mo-surface';
import type { Molecule } from '../mol-parser';
import { closedShellOccupations } from '../chem/extended-huckel/solve';
import { CANONICAL_TOLERANCE_EV, DEGENERATE_TOLERANCE_EV } from '../chem/extended-huckel/canonicalize-degenerate';
import { labelIrreps } from '../chem/extended-huckel/irrep-labels';
import { MO_PHASE_PAIRS, MO_SIGNIFICANT } from '../render/mo-lobes';
import type { LocalizedCharacter, LocalizedOrbital } from '../chem/localized-orbitals/order-localized';
import { SP_ONLY_METALS } from '../chem/extended-huckel/parameters';
import { spinName } from '../chem/elements';
import { ENERGY_UNIT, formatEnergy } from './units';
import { GFN2_NOTE } from '../geometry/gfn2-refine';
import { writeNote } from './info-note';

/** The Localized view's note, naming the calculation it localized. */
function pipekMezeyNote(list: LocalizedList) {
  const source = list.source === 'gfn2'
    ? `GFN2-xTB orbitals (semiempirical, self-consistent)${list.spin ? ` — the ${list.spin === 'alpha' ? 'α' : 'β'} spin channel, one electron per orbital` : ''}`
    : 'extended-Hückel orbitals (semiempirical) — GFN2-xTB had none to give for this structure';
  return {
    text: `Pipek–Mezey localization of the ${source}: the delocalized MOs `
      + 'rearranged into bonds and lone pairs, occupied space and valence-virtual space alike, listed as an energy '
      + 'ladder — lowest at the bottom. A localized orbital is not an eigenstate, so its energy is the expectation '
      + `${list.source === 'gfn2' ? '⟨φ|F|φ⟩ of the Fock operator' : '⟨φ|H|φ⟩ of the Hamiltonian'}: the average of the `
      + 'delocalized energies it is built from, weighted by how much of each it holds. The occupied energies add up to the '
      + 'delocalized ones, but an orbital’s energy is not an ionization energy — Koopmans’ theorem speaks of the '
      + 'delocalized orbitals. With an orbital drawn, a tick marks the ones it mixes with — the brighter, the stronger; '
      + 'hover one for the coupling ⟨φᵢ|F|φⱼ⟩, or draw both. These couplings are what turn the localized orbitals back '
      + 'into the delocalized ones. Filled orbitals mix only with filled '
      + 'ones and empty with empty — a lone pair’s donation into a σ* is already in the lone pair’s own tail.',
    link: {
      label: 'Pipek & Mezey, J. Chem. Phys. 1989',
      href: 'https://pubs.aip.org/aip/jcp/article-abstract/90/9/4916/791853/A-fast-intrinsic-localization-procedure-applicable',
    },
  };
}

const GFN2_ORBITAL_NOTE = {
  text: 'GFN2-xTB orbitals (semiempirical, self-consistent): each electron feels the charge of the others, which '
    + 'extended Hückel’s fixed parameters leave out — so where the two ladders disagree on ORDER, GFN2’s is the one '
    + 'to trust. Its energies are its own: the empty orbitals sit low (formaldehyde’s LUMO near −8 eV), so read the '
    + 'gaps and the order, not the absolute numbers. The Localized view localizes these orbitals.',
  link: GFN2_NOTE.link,
};

/** One delocalized ladder, from whichever calculation the method row picks:
 *  the rows, the readout and the composition line read only this. */
interface Ladder {
  /** What the list was framed on — a new one re-centres on the frontier. */
  identity: unknown;
  energies: number[];
  occupations: number[] | null;
  labels: (string | null)[];
  basis: BasisFunction[];
  coefficients: number[][];
  /** The method's own notes, when nothing more pressing is said. */
  notes: () => void;
}

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

/** The weakest ⟨φᵢ|F|φⱼ⟩ the localized list ticks, eV (2.3 kcal/mol). The
 *  couplings that matter run 0.5–4.6 eV (water's two O–H bonds 0.68,
 *  formaldehyde's n with a C–H bond 1.51, PCl₅'s lone pair with its own
 *  P–Cl bond 4.57); under a tenth of an eV is a ripple. */
const COUPLING_SHOWN_EV = 0.1;

/** Two localized orbitals' coupling, for the readout when both are drawn. A
 *  filled and an empty orbital never mix here, and the readout says why
 *  rather than printing a zero (fock-couplings.ts). */
function pairCoupling(couplings: number[][], i: number, j: number, orbitals: LocalizedOrbital[]): string {
  if (orbitals[i].occupied !== orbitals[j].occupied) return ' · a filled and an empty orbital: no coupling';
  return ` · coupling ${formatEnergy(Math.abs(couplings[i][j]))} ${ENERGY_UNIT}`;
}

/**
 * Split an ascending run of orbitals into degenerate sets: each set is the
 * orbitals within DEGENERATE_TOLERANCE_EV of its first. Both lists group by
 * this — the Delocalized ladder's symmetry-degenerate MOs and the localized
 * list's equivalent bonds and lone pairs — and draw a set's rail from it. The
 * tolerance (5 meV) is avo_ibo's 2×10⁻⁴ Ha, so the two programs agree on what
 * counts as one set.
 */
function degenerateRuns<T>(ascending: T[], energy: (item: T) => number): T[][] {
  const runs: T[][] = [];
  for (const item of ascending) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(energy(last[0]) - energy(item)) < DEGENERATE_TOLERANCE_EV) last.push(item);
    else runs.push([item]);
  }
  return runs;
}

/** What the rest of the UI may ask of the MO panel (the model views, which
 *  own the inspector it sits in). */
export interface MoPanel {
  /** Whether an orbital view is the one on screen. Off stage the list is not
   *  drawn — a ladder of 30 levels per molecule is work nobody would see. */
  setOnStage(onStage: boolean): void;
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

  /** A degenerate set's rail: draw every member, or, when all are already
   *  drawn, take them all away. Members already up keep their colours. */
  const toggleLocalizedSet = (members: number[]) => {
    const selected = ctx.display.localizedSelection;
    ctx.display.localizedSelection = members.every((i) => selected.includes(i))
      ? selected.filter((i) => !members.includes(i))
      : [...selected, ...members.filter((i) => !selected.includes(i))];
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
  // Which calculation the ladder shows, and (open shell, GFN2) which spin.
  // A new list is new orbitals: the old index would name another one.
  const methodButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#mo-method-row [data-mo-method]'));
  const spinRow = document.getElementById('mo-spin-row');
  const spinButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#mo-spin-row [data-mo-spin]'));
  const methodRow = document.getElementById('mo-method-row');
  const methodHint = document.getElementById('mo-method-hint');
  const ehHint = methodHint?.innerHTML ?? '';
  for (const button of methodButtons) {
    button.addEventListener('click', () => {
      const method = button.dataset.moMethod === 'gfn2' ? 'gfn2' : 'eh';
      if (ctx.display.moMethod === method) return;
      ctx.display.moMethod = method;
      ctx.display.moIndex = null;
      draw();
      ctx.rerender();
    });
  }
  for (const button of spinButtons) {
    button.addEventListener('click', () => {
      const spin = button.dataset.moSpin === 'beta' ? 'beta' : 'alpha';
      if (ctx.display.moSpin === spin) return;
      ctx.display.moSpin = spin;
      ctx.display.moIndex = null;
      ctx.display.localizedSelection = [];
      draw();
      ctx.rerender();
    });
  }
  function syncMethodRows(view: 'delocalized' | 'localized'): void {
    const gfn2 = ctx.display.moMethod === 'gfn2';
    methodRow?.classList.toggle('hidden', view !== 'delocalized');
    for (const b of methodButtons) b.classList.toggle('active', b.dataset.moMethod === ctx.display.moMethod);
    // the spin row serves whichever list reads GFN2's orbitals: the ladder
    // with GFN2 picked, the localized list whenever it is GFN2's
    const readsGfn2 = view === 'delocalized' ? gfn2 : ctx.localized?.source === 'gfn2';
    const openShell = readsGfn2 && !!ctx.gfn2Ladders?.ladders?.beta;
    spinRow?.classList.toggle('hidden', !openShell);
    for (const b of spinButtons) b.classList.toggle('active', b.dataset.moSpin === ctx.display.moSpin);
    if (methodHint) {
      // the hint describes the calculation the list on screen reads: the
      // localized list is GFN2's unless GFN2 had none to give
      methodHint.innerHTML = readsGfn2 || (view === 'localized' && !ctx.localized)
        ? 'GFN2-xTB: one self-consistent single point at this geometry, its own parameter set through radon. '
          + 'Blue and orange are the two orbital phases.'
        : ehHint;
    }
  }

  const setOnStage = (onStage: boolean) => {
    panel.classList.toggle('off-stage', !onStage);
    draw();
  };

  // The list has to follow the molecule: redraw when a new scene is built (a
  // new molecule means new orbitals).
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
   * Delocalized ladder and other programs draw an orbital list. The order is
   * ⟨φ|H|φ⟩ within each section (see orderLocalizedOrbitals), and the row
   * prints that number as the Delocalized ladder prints an MO's energy.
   */
  function drawLocalized(): void {
    const shown = localizedOnScreen(ctx);
    const molecule = ctx.currentMolecule;
    if (shown === 'pending') {
      note.textContent = 'Computing the GFN2-xTB orbitals to localize…';
      return;
    }
    const orbitals = shown?.orbitals;
    if (!shown || !orbitals || !molecule) {
      note.textContent = !molecule
        ? 'Load a molecule to see its orbitals.'
        : !shown
          ? 'No localized orbitals: GFN2-xTB could not treat this molecule, and an element here is outside the '
            + 'extended-Hückel parameter table.'
          : shown.source === 'gfn2'
            ? 'No localized orbitals: GFN2-xTB leaves a level at the frontier partly filled — a degenerate set the '
              + 'electrons cannot fill evenly — so which orbitals are occupied is not settled.'
              + (shown.spin ? ' Try the other spin channel.' : '')
            : 'No localized orbitals: the shell is not closed — an odd electron count, a degenerate set the '
              + 'count would only partly fill, or a molecule known to be open-shell.';
      return;
    }
    const basis = shown.basis;

    const selection = ctx.display.localizedSelection;
    const occupiedCount = orbitals.filter((o) => o.occupied).length;
    // The orbitals the latest pick mixes with: ⟨φᵢ|F|φⱼ⟩ above the cut, each
    // row ticked in proportion to the strongest — an invitation to draw it
    // beside the pick. The latest pick, as the composition line reads it. The
    // number is the tooltip's, not the row's: a row is ~220 px and the longest
    // labels ("C5-H11 σ · -316.7 kcal/mol") already fill it.
    const pick = selection.length > 0 ? selection[selection.length - 1] : null;
    const couplingTo = pick !== null && shown.couplings ? shown.couplings[pick] : null;
    const coupled = (index: number) => couplingTo !== null && index !== pick
      && Math.abs(couplingTo[index]) >= COUPLING_SHOWN_EV;
    const strongest = couplingTo
      ? Math.max(0, ...orbitals.map((_, i) => (coupled(i) ? Math.abs(couplingTo[i]) : 0)))
      : 0;
    const row = (index: number) => {
      const orbital = orbitals[index];
      const slot = selection.indexOf(index);
      const mixes = coupled(index);
      const classes = ['orb-item', slot >= 0 ? 'selected' : '', mixes ? 'coupled' : ''].filter(Boolean).join(' ');
      const coupling = mixes ? Math.abs(couplingTo![index]) : 0;
      const cue = mixes
        ? ` style="--coupling:${(0.35 + 0.65 * coupling / strongest).toFixed(2)}"`
          + ` title="Mixes with ${localizedType(molecule, orbitals[pick!])} by ${formatEnergy(coupling)} ${ENERGY_UNIT}`
          + ' (⟨φᵢ|F|φⱼ⟩) — click to draw it too"'
        : '';
      // the dot carries the phase colour the orbital is drawn in, so the list
      // and the picture say the same thing when two orbitals are up at once
      const dot = slot >= 0
        ? `<span class="orb-dot" style="background:#${MO_PHASE_PAIRS[slot % MO_PHASE_PAIRS.length][0].toString(16).padStart(6, '0')}"></span>`
        : '<span class="orb-dot"></span>';
      // one Type column, as avo_ibo's table has — the class IS the type's tail —
      // then the energy, written as the Delocalized ladder writes an MO's
      return `<button class="${classes}" data-index="${index}"${cue}>`
        + dot
        + `<span class="orb-type">${localizedType(molecule, orbital)}`
        + ` · ${formatEnergy(orbital.energy)} ${ENERGY_UNIT}</span>`
        + '</button>';
    };
    // Degenerate sets within each section — the two O–H bonds of water, the
    // four C–H of methane. A set never spans the occupied/empty split.
    const indices = orbitals.map((_, i) => i);
    const energyOf = (i: number) => orbitals[i].energy;
    const runs = [
      ...degenerateRuns(indices.filter((i) => orbitals[i].occupied), energyOf),
      ...degenerateRuns(indices.filter((i) => !orbitals[i].occupied), energyOf),
    ];
    let section: 'occupied' | 'empty' | null = null;
    // bottom-up: the array ascends, the panel descends, so the highest-lying
    // orbital (the empties) sits at the top and the deepest at the bottom. The
    // rows are walked by INDEX, reversed — `data-index` must stay the array
    // index, which is what the selection and the click handler speak.
    list.innerHTML = [...runs].reverse().map((run) => {
      let html = '';
      const tag = orbitals[run[0]].occupied ? 'occupied' : 'empty';
      if (tag !== section) {
        section = tag;
        const spin = shown.spin ? ` (${shown.spin === 'alpha' ? 'α' : 'β'})` : '';
        const header = tag === 'occupied'
          ? `Occupied${spin} · ${occupiedCount}`
          : `Empty${spin} — valence-virtual · ${orbitals.length - occupiedCount}`;
        html += `<div class="orb-group">${header}</div>`;
      }
      const rows = [...run].reverse().map(row).join('');
      if (run.length === 1) return html + rows;
      // the rail draws the whole set at once: the equivalent bonds of a
      // molecule are read together, and one click beats n
      const drawn = run.every((i) => selection.includes(i));
      return html + `<div class="orb-set${drawn ? ' drawn' : ''}">`
        + `<button class="orb-rail" data-members="${run.join(',')}" `
        + `title="${run.length} orbitals at one energy — click to ${drawn ? 'hide' : 'draw'} them together" `
        + `aria-label="${drawn ? 'Hide' : 'Draw'} the ${run.length} orbitals at this energy together"></button>`
        + rows + '</div>';
    }).join('');
    list.querySelectorAll<HTMLButtonElement>('button.orb-item').forEach((node) => {
      node.addEventListener('click', () => toggleLocalized(Number(node.dataset.index)));
    });
    list.querySelectorAll<HTMLButtonElement>('button.orb-rail').forEach((node) => {
      node.addEventListener('click', () => toggleLocalizedSet(node.dataset.members!.split(',').map(Number)));
    });

    if (selection.length > 0) {
      const described = selection
        .map((index) => orbitals[index])
        .filter((orbital): orbital is LocalizedOrbital => !!orbital);
      readout.textContent = described
        .map((orbital) => `${localizedType(molecule, orbital)} · ${formatEnergy(orbital.energy)} ${ENERGY_UNIT}`
          + (orbital.occupied ? '' : ' (empty)'))
        .join('  +  ')
        + (selection.length === 2 && shown.couplings ? pairCoupling(shown.couplings, selection[0], selection[1], orbitals) : '')
        + (selection.length > 2 ? ' — click any again to drop it'
          : selection.length > 1 ? ' — click either again to drop it' : ' — click it again to hide');
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
    writeNote(note, pipekMezeyNote(shown));
  }

  // The ladder the list was last framed on. Every click redraws the list, and
  // centring the selected row each time scrolled the levels under the pointer
  // (reported 2026-10-06: "I thought the MOs were rearranging on me"). So the
  // frontier is brought into view once, when a ladder first appears; after
  // that the list keeps the reader's scroll.
  let framed: { result: unknown; view: string } | null = null;

  function draw(): void {
    const view = ctx.display.orbitalView;
    const gfn2 = view === 'delocalized' && ctx.display.moMethod === 'gfn2';
    const scrolled = list.scrollTop;
    list.innerHTML = '';
    note.textContent = '';
    readout.textContent = '';
    composition.textContent = '';
    syncMethodRows(view);
    // The picture controls only mean something with an orbital selected — say
    // so rather than letting a drag do nothing.
    const hasSelection = view === 'localized'
      ? ctx.display.localizedSelection.length > 0
      : ctx.display.moIndex !== null;
    for (const control of [smooth, opacity, isovalue]) if (control) control.disabled = !hasSelection;
    // GFN2's orbitals are drawn as surfaces only: the atomic-orbital picture
    // draws extended Hückel's Slater lobes, which GFN2's basis is not. The
    // localized list is GFN2's unless GFN2 failed; until it is known, so is
    // the switch.
    if (smooth && (gfn2 || (view === 'localized' && ctx.localized?.source !== 'eh'))) {
      smooth.disabled = true;
      smooth.checked = true;
    } else if (smooth) {
      smooth.checked = ctx.display.smoothMo;
    }
    // the ladder is not on screen, so its scroll is gone: frame it afresh when it is back
    if (panel.classList.contains('off-stage')) {
      framed = null;
      return;
    }
    if (view === 'localized') {
      framed = null;
      drawLocalized();
      syncMethodRows(view); // again: the spin row needs the list, just built
      return;
    }

    const selected = ctx.display.moIndex;
    const ladder = ctx.display.moMethod === 'gfn2' ? gfn2Ladder() : ehLadder();
    syncMethodRows(view); // again: the spin row needs the GFN2 ladder, just built
    if (!ladder) return; // the builder has said why in the note
    const { occupations } = ladder;
    const levels = ladder.energies.map((energy, index) => ({
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
    // Grouped by DEGENERATE_TOLERANCE_EV, wider than the solver's exactness cut
    // on purpose: two levels a few meV apart read as one set. The
    // canonicalization note below is gated on the solver's own tolerance, so a
    // near-miss is not described as a symmetry degeneracy.
    const groups = degenerateRuns(levels, (level) => level.energy);
    const labels = ladder.labels;
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
      const members = group.map((level) => {
        const drawn = ctx.display.moIndex === level.index;
        const phase = drawn
          ? ` style="background:#${MO_PHASE_PAIRS[0][0].toString(16).padStart(6, '0')}"`
          : '';
        const irrep = labels[level.index];
        return `<button class="orb-item${drawn ? ' selected' : ''}" data-index="${level.index}">`
          + `<span class="orb-dot"${phase}></span>`
          + `<span class="orb-type">MO ${level.index + 1}`
          + (irrep ? ` · ${irrep}` : '')
          + ` · ${formatEnergy(level.energy)} ${ENERGY_UNIT}</span>`
          + (tag ? `<span class="orb-tag">${tag}</span>` : '')
          + '</button>';
      }).join('');
      // A degenerate set carries the same rail as the localized list's. It
      // only marks the set here: this view draws one MO at a time.
      rows.push(group.length === 1 ? members
        : `<div class="orb-set"><span class="orb-rail" title="A degenerate set: ${group.length} orbitals at one energy"></span>${members}</div>`);
    }
    list.innerHTML = rows.join('');
    list.querySelectorAll<HTMLButtonElement>('button.orb-item').forEach((node) => {
      node.addEventListener('click', () => select(Number(node.dataset.index)));
    });
    // A new ladder opens on the frontier — the level a chemist starts at, or
    // the one already drawn; a redraw of the same ladder stays where it was.
    if (framed?.result === ladder.identity && framed?.view === view) {
      list.scrollTop = scrolled;
    } else {
      framed = { result: ladder.identity, view };
      const focus = list.querySelector('button.orb-item.selected')
        ?? Array.from(list.querySelectorAll('button.orb-item')).find((b) => b.querySelector('.orb-tag'));
      focus?.scrollIntoView({ block: 'center' });
    }

    // readout + composition of the selected orbital
    if (selected !== null && ladder.energies[selected] !== undefined) {
      const energy = ladder.energies[selected];
      const occupancy = occupations ? occupations[selected] : null;
      const partners = ladder.energies
        .map((e, i) => ({ e, i }))
        .filter(({ e, i }) => i !== selected && Math.abs(e - energy) < DEGENERATE_TOLERANCE_EV)
        .map(({ i }) => i + 1);
      const irrep = labels[selected];
      readout.textContent = `MO ${selected + 1} · ${formatEnergy(energy)} ${ENERGY_UNIT}`
        + (irrep ? ` · ${irrep}` : '')
        + (occupancy === null ? '' : occupancy > 0 ? ' · occupied' : ' · empty')
        + (partners.length > 0 ? ` · degenerate with MO ${partners.join(', ')}` : '')
        + ' — click it again to hide';
      composition.textContent = compositionText(ladder.basis, ladder.coefficients[selected])
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
          ? ' (linear molecule: the perpendicular p axes are degenerate, so these px/py/pz names are the calculation frame\'s choice)'
          : '');
      const exactPartners = partners.filter((mo) => Math.abs(ladder.energies[mo - 1] - energy) < CANONICAL_TOLERANCE_EV);
      if (exactPartners.length > 0) {
        // Worth saying out loud: a degenerate set is *a* subspace, and any
        // orthogonal combination inside it is the same physics. Each set is
        // canonicalized against x², y², z², which is what makes it the
        // combination a textbook draws (and another program's, too) — but
        // which member carries the nodes follows the frame's own axes. Only an
        // exact set was rotated. A level merely within the drawing tolerance
        // was not, and saying so would be a false label.
        note.textContent = `Degenerate set of ${exactPartners.length + 1}: canonicalized against x², y², z², so these are the symmetry-adapted orbitals a textbook draws — which member carries the nodal plane follows the molecule's own frame.`;
        return;
      }
    } else {
      readout.textContent = `${ladder.energies.length} MOs · click a level to draw it`;
    }
    ladder.notes();
  }

  /** Extended Hückel's ladder, or null (with the reason in the note). */
  function ehLadder(): Ladder | null {
    const result = ctx.ehResult;
    if (!result) {
      note.textContent = ctx.currentMolecule
        ? 'No orbitals: an element here is outside the extended-Hückel parameter table.'
        : 'Load a molecule to see its orbitals.';
      return null;
    }
    const occupations = ehOccupations();
    return {
      identity: result,
      energies: result.energies,
      occupations,
      labels: irreps(),
      basis: result.basis,
      coefficients: result.coefficients,
      notes: () => {
        const spOnly = spOnlyMetals(ctx.currentMolecule);
        if (spOnly.length > 0) {
          // said out loud rather than silently: these metals carry no d here
          note.textContent = `${spOnly.join(', ')} run on s and p only — the parameter table has no 3d for `
            + `${spOnly.length === 1 ? 'it' : 'them'}, and a d¹⁰ shell is core-like. Their d orbitals are absent, not hidden.`;
          return;
        }
        if (occupations === null) {
          const multiplicity = ctx.currentMolecule?.multiplicity ?? 1;
          note.textContent = multiplicity > 1
            ? `Open shell (a ${spinName(multiplicity)}): extended `
              + 'Hückel as built here is closed-shell and has no spin, so no occupancy arrows. '
              + 'GFN2-xTB above treats the spin, and the Localized view localizes its orbitals.'
            : `Open shell (${result.electronCount} electrons): extended Hückel as built here has no spin, so occupancies `
              + 'are not shown. GFN2-xTB above treats the spin.';
        }
      },
    };
  }

  /** Extended Hückel's closed-shell filling, or null for an open shell. */
  function ehOccupations(): number[] | null {
    const result = ctx.ehResult;
    if (!result) return null;
    return closedShellOccupations(
      result.electronCount, result.energies.length, result.energies, ctx.currentMolecule?.multiplicity ?? 1,
    );
  }

  /** GFN2-xTB's ladder in the channel the spin row picks, or null (with the
   *  reason in the note) while the single point runs or when it failed. */
  function gfn2Ladder(): Ladder | null {
    const ladder = gfn2LadderOnScreen(ctx);
    if (!ladder) {
      const request = ctx.gfn2PropertiesRequest;
      note.textContent = !ctx.currentMolecule
        ? 'Load a molecule to see its orbitals.'
        : request?.molecule === ctx.currentMolecule && request.status === 'failed'
          ? `No GFN2-xTB orbitals: ${request.reason ?? 'the engine could not treat this molecule'}.`
          : 'Computing the GFN2-xTB orbitals…';
      return null;
    }
    return {
      identity: ladder,
      energies: ladder.energies,
      occupations: ladder.occupations,
      labels: ladder.labels,
      basis: ladder.basis,
      coefficients: ladder.coefficients,
      notes: () => {
        writeNote(note, ladder.spin
          ? `Open shell: the ${ladder.spin === 'alpha' ? 'α (spin-up)' : 'β (spin-down)'} orbitals, each holding at most `
            + 'one electron. The two channels differ by the unpaired electrons — switch with the row above.'
          : GFN2_ORBITAL_NOTE);
      },
    };
  }
  draw();

  const panelApi: MoPanel = {
    setOnStage,
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
        const shown = localizedOnScreen(ctx);
        const orbitals = (shown !== 'pending' && shown?.orbitals) || [];
        let homo = -1;
        for (let i = 0; i < orbitals.length; i++) if (orbitals[i].occupied) homo = i;
        if (homo >= 0) ctx.display.localizedSelection = [homo];
      } else {
        const gfn2 = ctx.display.moMethod === 'gfn2' ? gfn2LadderOnScreen(ctx) : null;
        const energies = gfn2 ? gfn2.energies : ctx.ehResult?.energies ?? [];
        const occupations = gfn2 ? gfn2.occupations : ehOccupations();
        const homo = occupations ? occupations.filter((o) => o > 0).length - 1 : -1;
        // the first member of the HOMO's group, grouped as the ladder groups
        // its rows: a level joins a group within tolerance of its first member
        let first = 0;
        for (let i = 1; i <= homo; i++) {
          if (Math.abs(energies[first] - energies[i]) >= DEGENERATE_TOLERANCE_EV) first = i;
        }
        if (homo >= 0) ctx.display.moIndex = first;
      }
      draw();
      ctx.rerender();
    },
  };

  // The single point landed: its orbitals fill the GFN2 ladder and the
  // localized list, which were waiting on it. Under an orbital view with
  // nothing drawn yet — the HOMO could not be picked from a list not yet
  // there — draw it now, as a new molecule would.
  ctx.onGfn2Orbitals = () => {
    const onStage = !panel.classList.contains('off-stage');
    const nothingDrawn = ctx.display.moIndex === null && ctx.display.localizedSelection.length === 0;
    const waited = ctx.display.orbitalView === 'localized' || ctx.display.moMethod === 'gfn2';
    if (onStage && nothingDrawn && waited) panelApi.selectHomo();
    else draw();
  };

  return panelApi;
}

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
  // a two-centre bond (or antibond), its atoms in index order
  const pair = orbital.atoms.slice(0, 2).sort((a, b) => a - b);
  return `${joined(pair)} ${kind}`;
}
