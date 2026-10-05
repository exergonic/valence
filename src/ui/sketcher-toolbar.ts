/**
 * Our toolbar for the JSME sketcher.
 *
 * JSME draws its own menus as SVG beside its drawing area. They are clipped
 * out of view (main.css, #jsme-stage), and each of our buttons presses the
 * matching hidden JSME button — a synthetic click at that button's place in
 * JSME's grid — so every tool behaves exactly as JSME's own does: elements,
 * the charge cycle, the stereo bond's wedge/hash cycle, undo and redo.
 *
 * The grid was mapped by behaviour (press, click, read back the molfile),
 * against jsme-editor 2024.04.29 with options "newlook" — see NOTES.md. A
 * JSME upgrade, or a different option string, must re-check these cells.
 * Clear is JSME's own clear() call rather than a button.
 */

type Cell = { bar: 'top' | 'left'; row: number; col: number };

/** Our tools, each a JSME button. `mode` tools stay selected (they set what a
 *  click on the drawing does); the others are one-off commands. */
const TOOLS: Record<string, Cell & { mode: boolean }> = {
  delete: { bar: 'top', row: 0, col: 3, mode: true },
  charge: { bar: 'top', row: 0, col: 7, mode: true },
  undo: { bar: 'top', row: 0, col: 9, mode: false },
  redo: { bar: 'top', row: 0, col: 10, mode: false },
  stereo: { bar: 'top', row: 1, col: 0, mode: true },
  single: { bar: 'top', row: 1, col: 1, mode: true },
  double: { bar: 'top', row: 1, col: 2, mode: true },
  triple: { bar: 'top', row: 1, col: 3, mode: true },
  chain: { bar: 'top', row: 1, col: 4, mode: true },
  ring3: { bar: 'top', row: 1, col: 5, mode: true },
  ring4: { bar: 'top', row: 1, col: 6, mode: true },
  ring5: { bar: 'top', row: 1, col: 7, mode: true },
  benzene: { bar: 'top', row: 1, col: 8, mode: true },
  ring6: { bar: 'top', row: 1, col: 9, mode: true },
};

/** JSME's element column, top to bottom. */
const ELEMENTS = ['C', 'N', 'O', 'S', 'F', 'Cl', 'Br', 'I', 'P'];

/** JSME's pieces, told apart by where they sit around the drawing area (the
 *  largest one): the button bar above it, the element column to its left. */
function jsmeParts(stage: HTMLElement) {
  const svgs = Array.from(stage.querySelectorAll('svg'));
  if (svgs.length === 0) return null;
  const box = (el: Element) => el.getBoundingClientRect();
  const area = (el: Element) => box(el).width * box(el).height;
  const drawing = svgs.reduce((a, b) => (area(a) >= area(b) ? a : b));
  const d = box(drawing);
  const top = svgs.find((s) => s !== drawing && box(s).bottom <= d.top + 1 && box(s).width > d.width / 2);
  const left = svgs.find((s) => s !== drawing && box(s).right <= d.left + 1 && box(s).height > d.height / 2);
  const bottom = svgs.find((s) => s !== drawing && box(s).top >= d.bottom - 1 && box(s).width > d.width / 2);
  const right = svgs.find((s) => s !== drawing && box(s).left >= d.right - 1);
  if (!top || !left) return null;
  return { drawing, top, left, bottom, right };
}

/** Clip JSME's own menus out of the well: the stage is moved up and left by
 *  their size and made that much larger, so only the drawing area shows. */
function clipJsmeMenus(container: HTMLElement, stage: HTMLElement): boolean {
  const parts = jsmeParts(stage);
  if (!parts) return false;
  const px = (n: number | undefined) => `${Math.ceil(n ?? 0)}px`;
  container.style.setProperty('--jsme-top', px(parts.top.getBoundingClientRect().height));
  container.style.setProperty('--jsme-left', px(parts.left.getBoundingClientRect().width));
  container.style.setProperty('--jsme-bottom', px(parts.bottom?.getBoundingClientRect().height));
  container.style.setProperty('--jsme-right', px(parts.right?.getBoundingClientRect().width));
  container.classList.add('menus-clipped');
  window.jsmeApplet?.repaint?.();
  return true;
}

/** Press a hidden JSME button: the events JSME listens for, at the button's
 *  centre. Its button pitch is the top bar's height over its two rows; the
 *  element column starts a hair (3 of 37.5 units) below its top edge. */
function pressJsmeButton(stage: HTMLElement, cell: Cell): void {
  const parts = jsmeParts(stage);
  if (!parts) return;
  const bar = cell.bar === 'top' ? parts.top : parts.left;
  const b = bar.getBoundingClientRect();
  const pitch = parts.top.getBoundingClientRect().height / 2;
  const x = b.left + (cell.col + 0.5) * pitch;
  const y = b.top + (cell.bar === 'left' ? (3 / 37.5) * pitch : 0) + (cell.row + 0.5) * pitch;
  for (const type of ['mousemove', 'mousedown', 'mouseup']) {
    bar.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, button: 0,
      buttons: type === 'mousedown' ? 1 : 0, clientX: x, clientY: y, screenX: x, screenY: y,
    }));
  }
}

export function setupSketcherToolbar(): void {
  const container = document.getElementById('jsme_container');
  const stage = document.getElementById('jsme-stage');
  if (!container || !stage) return;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#sketch-tools [data-tool], #sketch-elements [data-element]'));

  const markSelected = (selected: HTMLButtonElement) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button === selected));
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      if (button.dataset.tool === 'clear') {
        window.jsmeApplet?.clear?.();
        return;
      }
      const element = button.dataset.element;
      const tool = element ? null : TOOLS[button.dataset.tool ?? ''];
      const cell: Cell | null = element
        ? { bar: 'left', row: ELEMENTS.indexOf(element), col: 0 }
        : tool ?? null;
      if (!cell || cell.row < 0) return;
      pressJsmeButton(stage, cell);
      if (element || tool?.mode) markSelected(button);
    });
  }

  // JSME builds its menus asynchronously after the applet exists; clip them as
  // soon as they are there. Single bond is JSME's starting tool.
  const start = () => {
    let tries = 0;
    const attempt = () => {
      if (clipJsmeMenus(container, stage)) {
        const single = buttons.find((b) => b.dataset.tool === 'single');
        if (single) markSelected(single);
      } else if (tries++ < 50) {
        setTimeout(attempt, 100);
      }
    };
    attempt();
  };
  if (window.jsmeApplet) start();
  else window.addEventListener('jsme-ready', start, { once: true });
}
