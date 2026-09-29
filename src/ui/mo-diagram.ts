/**
 * The MO tab: the extended-Hückel orbital ladder, and clicking a level draws
 * that MO over the molecule.
 *
 * The diagram is the textbook one — energy up the side, one line per orbital,
 * the occupied ones filled with their α/β pair — but it only ever shows what
 * the calculation actually produced, and it says so: the caption reads
 * "extended Hückel MO (semiempirical)", and a molecule the model refuses
 * (an element outside the parameter table, or an open shell) gets a note
 * instead of a ladder.
 *
 * Two rendering choices worth knowing:
 *  - The axis is WINDOWED around the occupied ladder (deep σ levels and very
 *    high virtuals sit tens of eV away and would flatten everything between).
 *    Levels outside the window are drawn as edge markers with their energy,
 *    never dropped silently.
 *  - The levels come straight from the solver; the occupancy comes from
 *    `closedShellOccupations`, which refuses an odd electron count. A radical
 *    therefore shows its ladder with no occupancy and a warning — the levels
 *    are real, the filling would be a lie.
 */
import type { SceneContext } from '../render';
import { closedShellOccupations } from '../chem/extended-huckel/solve';

const WIDTH = 258;
const HEIGHT = 232;
const PAD = { top: 14, bottom: 18, left: 34, right: 44 };

/** Levels this far outside the occupied ladder still get axis room. */
const BELOW_OCCUPIED = 4;
const ABOVE_OCCUPIED = 6;

interface Level {
  index: number;
  energy: number;
  occupied: boolean;
  homo: boolean;
  lumo: boolean;
}

export function setupMoPanel(ctx: SceneContext) {
  const diagram = document.getElementById('mo-diagram')!;
  const readout = document.getElementById('mo-readout')!;
  const note = document.getElementById('mo-note')!;
  const clear = document.getElementById('ctrl-mo-clear') as HTMLButtonElement | null;

  const select = (index: number | null) => {
    ctx.display.moIndex = ctx.display.moIndex === index ? null : index;
    draw();
    ctx.rerender();
  };

  clear?.addEventListener('click', () => select(null));

  function draw(): void {
    const result = ctx.ehResult;
    const selected = ctx.display.moIndex;
    diagram.innerHTML = '';
    note.textContent = '';
    readout.textContent = '';

    if (!result) {
      note.textContent = ctx.currentMolecule
        ? 'No orbitals: an element here is outside the extended-Hückel parameter table.'
        : 'Load a molecule to see its orbitals.';
      return;
    }

    const occupations = closedShellOccupations(result.electronCount, result.energies.length);
    const levels: Level[] = result.energies.map((energy, index) => ({
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
    const y = (energy: number) => PAD.top + ((hi - energy) / (hi - lo)) * (HEIGHT - PAD.top - PAD.bottom);

    const parts: string[] = [];
    // axis
    parts.push(`<line class="mo-axis" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}"/>`);
    for (const tick of axisTicks(lo, hi)) {
      const ty = y(tick);
      parts.push(`<line class="mo-tick" x1="${PAD.left - 4}" y1="${ty.toFixed(1)}" x2="${PAD.left}" y2="${ty.toFixed(1)}"/>`);
      parts.push(`<text class="mo-tick-label" x="${PAD.left - 7}" y="${(ty + 3).toFixed(1)}">${tick}</text>`);
    }

    const x0 = PAD.left + 10;
    const x1 = WIDTH - PAD.right;
    for (const level of levels) {
      const clipped = level.energy < lo || level.energy > hi;
      const ly = clipped ? (level.energy > hi ? PAD.top : HEIGHT - PAD.bottom) : y(level.energy);
      const classes = ['mo-level'];
      if (level.occupied) classes.push('occupied');
      if (level.index === selected) classes.push('selected');
      if (clipped) classes.push('clipped');
      const marker = clipped
        ? `<text class="mo-edge" x="${x1}" y="${(ly + 3).toFixed(1)}">${level.energy.toFixed(1)}</text>`
        : level.occupied
          ? `<text class="mo-arrows" x="${x1 + 4}" y="${(ly + 4).toFixed(1)}">↑↓</text>`
          : '';
      const tag = level.homo ? 'HOMO' : level.lumo ? 'LUMO' : '';
      parts.push(
        `<g class="${classes.join(' ')}" data-index="${level.index}">`
        + `<line class="mo-hit" x1="${x0}" y1="${ly.toFixed(1)}" x2="${x1}" y2="${ly.toFixed(1)}"/>`
        + `<line class="mo-bar" x1="${x0}" y1="${ly.toFixed(1)}" x2="${x1}" y2="${ly.toFixed(1)}"/>`
        + marker
        + (tag ? `<text class="mo-tag" x="${x1 + 18}" y="${(ly + 4).toFixed(1)}">${tag}</text>` : '')
        + `<title>${level.energy.toFixed(3)} eV</title>`
        + '</g>',
      );
    }

    diagram.innerHTML =
      `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" class="mo-svg">${parts.join('')}</svg>`;
    diagram.querySelectorAll<SVGGElement>('g.mo-level').forEach((node) => {
      node.addEventListener('click', () => select(Number(node.dataset.index)));
    });

    // readout
    if (selected !== null && result.energies[selected] !== undefined) {
      const energy = result.energies[selected];
      const occupancy = occupations ? occupations[selected] : null;
      readout.textContent = `MO ${selected + 1} · ${energy.toFixed(3)} eV`
        + (occupancy === null ? '' : occupancy > 0 ? ' · occupied' : ' · empty')
        + ' — click it again to hide';
    } else {
      readout.textContent = `${result.energies.length} MOs · click a level to draw it`;
    }

    if (occupations === null) {
      note.textContent = `Open shell (${result.electronCount} electrons): extended Hückel as built here has no spin, so occupancies are not shown.`;
    } else if (levels.some((l) => l.energy < lo || l.energy > hi)) {
      const hidden = levels.filter((l) => l.energy < lo || l.energy > hi).length;
      note.textContent = `${hidden} level${hidden === 1 ? '' : 's'} outside the window (marked at the edge with its energy).`;
    }
  }

  // The diagram is cheap and self-contained, so it redraws when its tab is
  // opened — which is also the only time it is visible.
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'mo') draw();
    });
  });

  draw();
}

/** Tick values at 5 eV steps inside [lo, hi]. */
function axisTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(lo / 5) * 5;
  for (let v = first; v <= hi; v += 5) ticks.push(v);
  return ticks;
}
