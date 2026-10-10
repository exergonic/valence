/**
 * The periodic table behind the sketcher's "More…" button: every element
 * GFN2-xTB is parameterised for, hydrogen through radon (Z = 1–86).
 */
import { GFN2_ELEMENTS, elementKind } from '../chem/elements';

/** Element symbols in order of atomic number, Z = 1 to 86. */
export const SYMBOLS = GFN2_ELEMENTS;

/**
 * Where an element sits: its period's row and its group's column. The
 * lanthanides La–Lu sit in their own row (8) below the table, under groups
 * 3–17, with row 7 left empty as the gap; period 6 keeps a marker in group 3.
 */
export function placeInTable(z: number): { row: number; column: number } {
  if (z <= 2) return { row: 1, column: z === 1 ? 1 : 18 };
  if (z <= 10) return { row: 2, column: z <= 4 ? z - 2 : z + 8 };
  if (z <= 18) return { row: 3, column: z <= 12 ? z - 10 : z };
  if (z <= 36) return { row: 4, column: z - 18 };
  if (z <= 54) return { row: 5, column: z - 36 };
  if (z <= 56) return { row: 6, column: z - 54 };
  if (z <= 71) return { row: 8, column: z - 54 };
  return { row: 6, column: z - 68 };
}

/**
 * Build the popover and wire it to its button. A pick closes it and hands
 * the symbol to `onPick`; Escape or a click elsewhere closes it unpicked.
 */
export function setupPeriodicTable(trigger: HTMLButtonElement, onPick: (symbol: string) => void): void {
  const panel = document.createElement('div');
  panel.id = 'periodic-table';
  panel.className = 'hidden';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Periodic table');

  const grid = document.createElement('div');
  grid.className = 'pt-grid';
  SYMBOLS.forEach((symbol, i) => {
    const z = i + 1;
    const { row, column } = placeInTable(z);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `pt-cell pt-${elementKind(symbol)}`;
    cell.textContent = symbol;
    cell.dataset.symbol = symbol;
    cell.title = `${symbol} (${z})`;
    cell.style.gridRow = String(row);
    cell.style.gridColumn = String(column);
    grid.appendChild(cell);
  });
  // The lanthanides' place in period 6, group 3; the row below holds them.
  const marker = document.createElement('span');
  marker.className = 'pt-marker';
  marker.textContent = 'La–Lu';
  marker.style.gridRow = '6';
  marker.style.gridColumn = '3';
  marker.setAttribute('aria-hidden', 'true');
  grid.appendChild(marker);
  panel.appendChild(grid);

  const legend = document.createElement('p');
  legend.className = 'pt-legend';
  legend.innerHTML =
    '<span class="pt-swatch pt-nonmetal"></span>Nonmetals get hydrogens to their usual valence. ' +
    '<span class="pt-swatch pt-metal"></span>Metals and <span class="pt-swatch pt-noble-gas"></span>noble gases ' +
    'carry only the hydrogens you draw.';
  panel.appendChild(legend);
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
    // Below the button, kept inside the window.
    const t = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;
    const left = Math.max(8, Math.min(t.left, window.innerWidth - width - 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${t.bottom + 6}px`;
    grid.querySelector<HTMLButtonElement>('.pt-cell')?.focus();
  };

  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => (isOpen() ? close(false) : open()));
  grid.addEventListener('click', (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLButtonElement>('.pt-cell');
    if (!cell?.dataset.symbol) return;
    close(false);
    onPick(cell.dataset.symbol);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close(true);
  });
  document.addEventListener('mousedown', (event) => {
    const target = event.target as Node;
    if (isOpen() && !panel.contains(target) && !trigger.contains(target)) close(false);
  });
}
