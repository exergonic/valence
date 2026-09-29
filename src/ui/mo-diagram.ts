/**
 * The MO panel: the extended-Hückel orbital ladder, and clicking a level
 * draws that MO over the molecule.
 *
 * The diagram is the textbook one — energy up the side, one line per orbital,
 * the occupied ones filled with their α/β pair — but it only ever shows what
 * the calculation actually produced, and it says so: the caption reads
 * "extended Hückel (semiempirical)", and a molecule the model refuses (an
 * element outside the parameter table, or an open shell) gets a note instead
 * of a ladder.
 *
 * Three rendering choices worth knowing:
 *  - The axis is WINDOWED around the occupied ladder (deep σ levels and very
 *    high virtuals sit tens of eV away and would flatten everything between).
 *    Levels outside the window are drawn as edge markers with their energy,
 *    never dropped silently.
 *  - The levels come straight from the solver; the occupancy comes from
 *    `closedShellOccupations`, which refuses an odd electron count. A radical
 *    therefore shows its ladder with no occupancy and a warning — the levels
 *    are real, the filling would be a lie.
 *  - The panel is sized by CSS and the ladder is drawn to whatever room it
 *    has, so it stays legible when the panel is resized or collapsed.
 */
import type { SceneContext } from '../render';
import { closedShellOccupations } from '../chem/extended-huckel/solve';
import { MO_SIGNIFICANT } from '../render/mo-lobes';

const PAD = { top: 16, bottom: 20, left: 44, right: 58 };

/** Levels this far outside the occupied ladder still get axis room. */
const BELOW_OCCUPIED = 4;
const ABOVE_OCCUPIED = 6;

/** How many coefficients the composition line lists. */
const TOP_CONTRIBUTORS = 6;

export function setupMoPanel(ctx: SceneContext) {
  const panel = document.getElementById('mo-panel')!;
  const diagram = document.getElementById('mo-diagram')!;
  const readout = document.getElementById('mo-readout')!;
  const composition = document.getElementById('mo-composition')!;
  const note = document.getElementById('mo-note')!;
  const clear = document.getElementById('ctrl-mo-clear') as HTMLButtonElement | null;
  const collapse = document.getElementById('mo-collapse') as HTMLButtonElement | null;

  const select = (index: number | null) => {
    ctx.display.moIndex = ctx.display.moIndex === index ? null : index;
    draw();
    ctx.rerender();
  };

  clear?.addEventListener('click', () => select(null));
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
    const width = diagram.clientWidth;
    const height = diagram.clientHeight;
    if (Math.abs(width - drawn.width) > 1 || Math.abs(height - drawn.height) > 1) draw();
  });
  observer.observe(diagram);

  function draw(): void {
    const result = ctx.ehResult;
    const selected = ctx.display.moIndex;
    diagram.innerHTML = '';
    note.textContent = '';
    readout.textContent = '';
    composition.textContent = '';
    if (panel.classList.contains('collapsed')) return;

    if (!result) {
      note.textContent = ctx.currentMolecule
        ? 'No orbitals: an element here is outside the extended-Hückel parameter table.'
        : 'Load a molecule to see its orbitals.';
      return;
    }

    const width = Math.max(240, diagram.clientWidth || 340);
    const height = Math.max(200, diagram.clientHeight || 300);
    drawn = { width: diagram.clientWidth, height: diagram.clientHeight };
    const occupations = closedShellOccupations(result.electronCount, result.energies.length);
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
    for (const level of levels) {
      const clipped = level.energy < lo || level.energy > hi;
      const ly = clipped ? (level.energy > hi ? PAD.top : height - PAD.bottom) : y(level.energy);
      const classes = ['mo-level'];
      if (level.occupied) classes.push('occupied');
      if (level.index === selected) classes.push('selected');
      if (clipped) classes.push('clipped');
      const marker = clipped
        ? `<text class="mo-edge" x="${x1}" y="${(ly + 4).toFixed(1)}">${level.energy.toFixed(1)}</text>`
        : level.occupied
          ? `<text class="mo-arrows" x="${x1 + 6}" y="${(ly + 5).toFixed(1)}">↑↓</text>`
          : '';
      const tag = level.homo ? 'HOMO' : level.lumo ? 'LUMO' : '';
      parts.push(
        `<g class="${classes.join(' ')}" data-index="${level.index}">`
        + `<line class="mo-hit" stroke-width="${hit}" x1="${x0}" y1="${ly.toFixed(1)}" x2="${x1}" y2="${ly.toFixed(1)}"/>`
        + `<line class="mo-bar" x1="${x0}" y1="${ly.toFixed(1)}" x2="${x1}" y2="${ly.toFixed(1)}"/>`
        + marker
        + (tag ? `<text class="mo-tag" x="${x1 + 24}" y="${(ly + 5).toFixed(1)}">${tag}</text>` : '')
        + `<title>MO ${level.index + 1}: ${level.energy.toFixed(3)} eV</title>`
        + '</g>',
      );
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
      readout.textContent = `MO ${selected + 1} · ${energy.toFixed(3)} eV`
        + (occupancy === null ? '' : occupancy > 0 ? ' · occupied' : ' · empty')
        + ' — click it again to hide';
      composition.textContent = describeComposition(result, selected);
    } else {
      readout.textContent = `${result.energies.length} MOs · click a level to draw it`;
    }

    if (occupations === null) {
      note.textContent = `Open shell (${result.electronCount} electrons): extended Hückel as built here has no spin, so occupancies are not shown.`;
    } else {
      const hidden = levels.filter((l) => l.energy < lo || l.energy > hi).length;
      if (hidden > 0) {
        note.textContent = `${hidden} level${hidden === 1 ? '' : 's'} outside the window (marked at the edge with its energy).`;
      }
    }
  }

  draw();
}

/** "C2 2pz −0.46 · C3 2pz −0.46 · …" — the biggest contributors to an MO,
 *  which is what a chemist compares against another program's output. */
function describeComposition(result: { basis: Array<{ label: string }>; coefficients: number[][] }, mo: number): string {
  const coefficients = result.coefficients[mo];
  if (!coefficients) return '';
  const largest = Math.max(...coefficients.map(Math.abs));
  const ranked = coefficients
    .map((c, i) => ({ c, label: result.basis[i].label }))
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

/** Tick values at 5 eV steps inside [lo, hi]. */
function axisTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(lo / 5) * 5;
  for (let v = first; v <= hi; v += 5) ticks.push(v);
  return ticks;
}
