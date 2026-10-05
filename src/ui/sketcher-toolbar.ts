/**
 * Our toolbar for the JSME sketcher.
 *
 * JSME draws its own menus as SVG beside its drawing area. They are clipped
 * out of view (main.css, #jsme-stage), and our buttons never touch them: a
 * simulated press on a hidden JSME button left JSME holding the press, so it
 * stopped following the pointer over the drawing until a person clicked —
 * the first click after picking a tool did nothing (NOTES.md). Instead each
 * button uses something JSME offers directly:
 *
 * - a drawing tool is a setAction() code;
 * - undo and redo are JSME's Ctrl+Z and Ctrl+Y;
 * - an element is JSME's own keyboard shortcut, which turns the atom under
 *   the pointer into that element: with an element chosen, a click on an atom
 *   becomes that key press, and a click on empty space places a carbon and
 *   then presses it;
 * - clear is clear().
 *
 * The codes and keys were mapped against jsme-editor 2024.04.29 (NOTES.md);
 * a JSME upgrade must re-check them.
 */

/** setAction() codes for our tools. */
const TOOL_ACTIONS: Record<string, number> = {
  delete: 104,
  charge: 108, // cycles the charge of the atom clicked
  stereo: 201, // on an atom: a new wedge; on that bond: wedge → hash → either
  single: 202,
  double: 203,
  triple: 204,
  chain: 205,
  ring3: 206,
  ring4: 207,
  ring5: 208,
  benzene: 209,
  ring6: 210,
};

/** setAction() code that places a lone carbon on empty space. */
const PLACE_CARBON = 253;

/** JSME's key for each element: the atom under the pointer becomes it. */
const ELEMENT_KEYS: Record<string, string> = {
  C: 'c', N: 'n', O: 'o', S: 's', P: 'p', F: 'f', Cl: 'l', Br: 'b', I: 'i',
};

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

/** JSME outlines the atom or bond under the pointer in blue. */
function pointerIsOnStructure(stage: HTMLElement): boolean {
  return !!jsmeParts(stage)?.drawing.querySelector('rect[stroke="blue"]');
}

/** A key press as JSME reads it, on the hidden text area that takes its keys. */
function pressKey(stage: HTMLElement, key: string, ctrlKey = false): void {
  const target = stage.querySelector('textarea');
  if (!target) return;
  const code = key.toUpperCase().charCodeAt(0);
  for (const type of ['keydown', 'keypress', 'keyup']) {
    target.dispatchEvent(new KeyboardEvent(type, {
      key, keyCode: code, which: code, charCode: type === 'keypress' ? key.charCodeAt(0) : 0,
      ctrlKey, bubbles: true, cancelable: true,
    }));
  }
}

export function setupSketcherToolbar(): void {
  const container = document.getElementById('jsme_container');
  const stage = document.getElementById('jsme-stage');
  if (!container || !stage) return;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#sketch-tools [data-tool], #sketch-elements [data-element]'));
  let element: string | null = null;

  const markSelected = (selected: HTMLButtonElement) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button === selected));
  };

  const chooseTool = (tool: string, button?: HTMLButtonElement) => {
    element = null;
    window.jsmeApplet?.setAction?.(TOOL_ACTIONS[tool]);
    if (button) markSelected(button);
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const applet = window.jsmeApplet;
      if (!applet) return;
      const tool = button.dataset.tool;
      if (button.dataset.element) {
        element = button.dataset.element;
        applet.setAction(PLACE_CARBON);
        markSelected(button);
      } else if (tool === 'undo' || tool === 'redo') {
        pressKey(stage, tool === 'undo' ? 'z' : 'y', true);
      } else if (tool === 'clear') {
        // After an undo or redo, JSME can ignore its first clear() (measured;
        // the second always takes), so clear until the sketch is empty.
        applet.clear();
        if (applet.smiles()) applet.clear();
      } else if (tool && tool in TOOL_ACTIONS) {
        chooseTool(tool, button);
      }
    });
  }

  // An element chosen: a click on an atom becomes the element's key, and the
  // click itself is kept from JSME (its action, placing a carbon, would add a
  // methyl to that atom). Capture phase, so this runs before JSME's handlers.
  let swallowRelease = false;
  let placing = false;
  stage.addEventListener('mousedown', (event) => {
    if (!element || event.button !== 0) return;
    if (pointerIsOnStructure(stage)) {
      event.stopPropagation();
      event.preventDefault();
      swallowRelease = true;
      pressKey(stage, ELEMENT_KEYS[element]);
    } else {
      placing = true; // JSME places a carbon here; the release below makes it the element
    }
  }, true);
  stage.addEventListener('mouseup', (event) => {
    if (!swallowRelease) return;
    swallowRelease = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);
  stage.addEventListener('mouseup', (event) => {
    if (!placing) return;
    placing = false;
    if (element === 'C' || !element) return;
    const key = ELEMENT_KEYS[element];
    const { clientX, clientY } = event;
    // after JSME has placed the carbon: show it the pointer on the new atom,
    // then press the key
    setTimeout(() => {
      document.elementFromPoint(clientX, clientY)?.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, view: window, clientX, clientY,
      }));
      pressKey(stage, key);
    }, 0);
  });

  // JSME builds its menus asynchronously after the applet exists; clip them as
  // soon as they are there, and start on the single bond.
  const start = () => {
    let tries = 0;
    const attempt = () => {
      if (clipJsmeMenus(container, stage)) {
        const single = buttons.find((b) => b.dataset.tool === 'single');
        chooseTool('single', single);
      } else if (tries++ < 50) {
        setTimeout(attempt, 100);
      }
    };
    attempt();
  };
  if (window.jsmeApplet) start();
  else window.addEventListener('jsme-ready', start, { once: true });
}
