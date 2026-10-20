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
 * Any element past the nine buttons is JSME's X atom: "More…" opens our
 * periodic table, and the pick goes into JSME's X box and gets a button.
 *
 * An element or a drawing tool can also be dragged onto the sketch; the drop
 * does what a click with it does there (setupDragFromToolbar).
 *
 * The codes, keys and the X box were mapped against jsme-editor 2024.04.29
 * (NOTES.md); a JSME upgrade must re-check them.
 */
import { setupPeriodicTable } from './periodic-table';
import { takesImplicitHydrogens } from '../chem/fill-hydrogens';

/** setAction() codes for our tools. */
const TOOL_ACTIONS: Record<string, number> = {
  delete: 104,
  // JSME's "Move atom" (its tooltip table, 2026-10-20): drag an atom and only
  // that atom moves; a drag on empty space does nothing. JSME has no lasso —
  // one atom at a time, and Shift-drag on empty space turns the whole molecule
  // whatever the tool.
  move: 113,
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

/**
 * Lay the drawing out afresh: JSME's own MOL block read back with every
 * coordinate zeroed, which makes JSME compute 2D coordinates. JSME's "Compute
 * 2D coordinates" sits in a menu we cannot reach (its molecule menu, behind a
 * deferred internal command), so this is the public road to the same layout.
 * It keeps everything the drawing says — the atoms in order, drawn
 * hydrogens (H–Ni–H keeps its three atoms; a SMILES round trip folds them
 * away), charges, the X box's elements, ring and E/Z stereo, chirality
 * (trans-2-methylcyclohexanol reads back the same SMILES). Returns the MOL
 * blocks before and after, or null for an empty sketch.
 */
function cleanLayout(applet: Window['jsmeApplet']): { before: string; after: string } | null {
  if (!applet.smiles()) return null;
  const before: string = applet.molFile();
  const lines = before.split('\n');
  const atomCount = parseInt(lines[3]?.slice(0, 3) ?? '', 10);
  if (!Number.isFinite(atomCount)) return null;
  const zeroed = lines.map((line, i) => (i >= 4 && i < 4 + atomCount ? `    0.0000    0.0000    0.0000${line.slice(30)}` : line));
  applet.readMolFile(zeroed.join('\n'));
  return { before, after: applet.molFile() };
}

/** A MOL block from its counts line on: the header carries a timestamp, so two
 *  reads of one drawing differ there and nowhere else. */
function drawingOf(molFile: string): string {
  return molFile.split('\n').slice(3).join('\n');
}

/** setAction() code that places a lone carbon on empty space. */
const PLACE_CARBON = 253;

/** JSME's key for each element: the atom under the pointer becomes it. */
const ELEMENT_KEYS: Record<string, string> = {
  C: 'c', N: 'n', O: 'o', S: 's', P: 'p', F: 'f', Cl: 'l', Br: 'b', I: 'i',
};

/** Every other element is JSME's "X" atom, whose key turns the atom under
 *  the pointer into whatever atomic SMILES its text box holds. */
const X_ATOM_KEY = 'x';

function elementKey(element: string): string {
  return ELEMENT_KEYS[element] ?? X_ATOM_KEY;
}

/**
 * What goes in JSME's X box for an element. A metal or a noble gas goes in
 * bracketed, "[Ni]", which pins its hydrogens at none; a bare "Ni" got
 * JSME's own guess, which changed with what the atom had been before
 * (NOTES.md). A nonmetal goes in bare, so JSME's SMILES carries its usual
 * hydrogens (Si → SiH₃ on a methyl) as the local pipeline does.
 */
export function atomicSmilesForXBox(element: string): string {
  return takesImplicitHydrogens(element) ? element : `[${element}]`;
}

/**
 * JSME's X box. The dialog that holds it ("Nonstandard atom") opens only
 * from JSME's own X button, so the hidden button is pressed once, out of
 * sight, and the box kept: JSME reads it live at every use, even after the
 * dialog has closed (NOTES.md). The first press never opens it; the second
 * does, a moment later.
 */
async function openXAtomBox(stage: HTMLElement): Promise<HTMLInputElement | null> {
  const label = Array.from(stage.querySelectorAll('svg text')).find((t) => t.textContent === 'X');
  const svg = label?.closest('svg');
  if (!label || !svg) return null;
  const b = label.getBoundingClientRect();
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;
  document.documentElement.classList.add('jsme-x-hidden');
  try {
    for (let press = 0; press < 3; press++) {
      for (const type of ['mousemove', 'mousedown', 'mouseup']) {
        svg.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window, button: 0,
          buttons: type === 'mousedown' ? 1 : 0, clientX: x, clientY: y, screenX: x, screenY: y,
        }));
      }
      for (let wait = 0; wait < 10; wait++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const dialog = document.querySelector('.mosaic-WindowPanel');
        const box = dialog?.querySelector<HTMLInputElement>('input.gwt-TextBox');
        if (dialog && box) {
          Array.from(dialog.querySelectorAll('button')).find((el) => el.textContent === 'Close')?.click();
          return box;
        }
      }
    }
    return null;
  } finally {
    document.documentElement.classList.remove('jsme-x-hidden');
  }
}

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

/** Where JSME drew the atom of a one-atom sketch: the centre of the first
 *  letter of its label — the element symbol ("CH4" begins with its C). */
function loneAtomPoint(stage: HTMLElement): { x: number; y: number } | null {
  const label = jsmeParts(stage)?.drawing.querySelector('text');
  const frame = label?.getScreenCTM();
  if (!label?.textContent || !frame) return null;
  const letter = label.getExtentOfChar(0);
  const centre = new DOMPoint(letter.x + letter.width / 2, letter.y + letter.height / 2).matrixTransform(frame);
  return { x: centre.x, y: centre.y };
}

/** A pointer move as JSME reads it, at a point on the page. */
function movePointer(x: number, y: number): void {
  document.elementFromPoint(x, y)?.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y,
  }));
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

/** Tools that draw something when clicked on an empty sketch (measured: a
 *  bond or the chain gives ethane, a ring its ring). Erase, stereo and charge
 *  act only on an atom or bond already drawn. */
const DRAWS_ON_EMPTY = new Set(['single', 'double', 'triple', 'chain', 'ring3', 'ring4', 'ring5', 'ring6', 'benzene']);

/** How far a press on a button must move before it is a drag, not a click. */
const DRAG_START_PX = 5;

/**
 * Drag an element or a drawing tool from our toolbar onto the sketch: the
 * drop does what a click with that tool does there. A student reached for
 * this unprompted (2026-10-14), so a drag and a click both work and mix
 * freely — the dragged tool stays chosen.
 *
 * JSME follows the drag on its own: a mouse has no implicit capture, so the
 * real moves reach its drawing and its hover box shows the atom or bond the
 * drop will land on. What it never sees is a press — that happened on our
 * button — so on the release a press is dispatched on the drawing at the drop
 * point, and the real release follows it. Unlike a press on JSME's hidden
 * menus, a press on its drawing leaves it responsive (NOTES.md). The press is
 * sent from the document's capture phase, ahead of the toolbar's own
 * listeners on the stage, which then treat it as any click.
 *
 * A drop that would add nothing — beside the molecule (one molecule at a
 * time), off the sketch, or Esc — sends the chip back to its button.
 */
function setupDragFromToolbar(stage: HTMLElement, choose: (button: HTMLButtonElement) => void): void {
  let pressed: { button: HTMLButtonElement; x: number; y: number } | null = null;
  let dragged: HTMLButtonElement | null = null;
  let chip: HTMLElement | null = null;
  let sketchWasEmpty = false;
  let pointer = { target: null as EventTarget | null, x: 0, y: 0 };
  let frame = 0;

  const dropWillAct = (target: EventTarget | null) => {
    if (!dragged || !(target instanceof Node) || !stage.contains(target)) return false;
    if (pointerIsOnStructure(stage)) return true;
    return sketchWasEmpty && (!!dragged.dataset.element || DRAWS_ON_EMPTY.has(dragged.dataset.tool ?? ''));
  };

  // The chip sits below and right of the pointer, clear of JSME's hover box.
  const placeChip = (x: number, y: number) => {
    if (chip) chip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  };

  const begin = (button: HTMLButtonElement, x: number, y: number) => {
    dragged = button;
    choose(button);
    sketchWasEmpty = !window.jsmeApplet?.smiles?.();
    chip = button.cloneNode(true) as HTMLElement;
    chip.removeAttribute('id');
    chip.removeAttribute('title');
    chip.removeAttribute('aria-pressed');
    chip.setAttribute('aria-hidden', 'true');
    chip.classList.add('sketch-drag-chip');
    document.body.appendChild(chip);
    placeChip(x, y);
    document.documentElement.classList.add('sketch-dragging');
  };

  const finish = (snapBack: boolean) => {
    const leaving = chip;
    const home = dragged;
    pressed = null;
    dragged = null;
    chip = null;
    cancelAnimationFrame(frame);
    document.documentElement.classList.remove('sketch-dragging');
    if (!leaving) return;
    if (snapBack && home) {
      const r = home.getBoundingClientRect();
      leaving.classList.add('returning');
      leaving.style.transform = `translate(${r.left}px, ${r.top}px)`;
      setTimeout(() => leaving.remove(), 200);
    } else {
      leaving.remove();
    }
  };

  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('#sketch-tools [data-tool], #sketch-elements [data-element]');
    // the move tool acts by dragging an atom already drawn: dropped, it would do nothing
    const draggable = !!button?.dataset.element
      || ((button?.dataset.tool ?? '') in TOOL_ACTIONS && button?.dataset.tool !== 'move');
    pressed = button && draggable && !button.disabled ? { button, x: event.clientX, y: event.clientY } : null;
  });

  document.addEventListener('mousemove', (event) => {
    if (!pressed) return;
    // The button was let go outside the window: no release ever came.
    if ((event.buttons & 1) === 0) {
      finish(true);
      return;
    }
    if (!dragged) {
      if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_START_PX) return;
      begin(pressed.button, event.clientX, event.clientY);
    }
    placeChip(event.clientX, event.clientY);
    // JSME moves its hover box in its own handler for this move; read it after.
    pointer = { target: event.target, x: event.clientX, y: event.clientY };
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => chip?.classList.toggle('will-drop', dropWillAct(pointer.target)));
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button !== 0 || !pressed) return;
    if (!dragged) {
      pressed = null; // a click: the button's own handler chooses it
      return;
    }
    const { target, clientX, clientY, screenX, screenY } = event;
    if (dropWillAct(target)) {
      finish(false);
      target!.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, clientX, clientY, screenX, screenY,
      }));
    } else {
      finish(true);
      // A release with no press before it means nothing to JSME; keep it out.
      if (target instanceof Node && stage.contains(target)) event.stopPropagation();
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dragged) finish(true);
  });
  window.addEventListener('blur', () => {
    if (dragged) finish(true);
  });
}

export function setupSketcherToolbar(): void {
  const container = document.getElementById('jsme_container');
  const stage = document.getElementById('jsme-stage');
  if (!container || !stage) return;
  const elementRow = document.getElementById('sketch-elements');
  const moreButton = document.getElementById('sketch-more') as HTMLButtonElement | null;
  // Live, not captured once: a pick from the periodic table adds a button.
  const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('#sketch-tools [data-tool], #sketch-elements [data-element]'));
  let element: string | null = null;
  let xAtomBox: HTMLInputElement | null = null;

  const markSelected = (selected: HTMLButtonElement) => {
    for (const button of buttons()) button.setAttribute('aria-pressed', String(button === selected));
  };

  const chooseTool = (tool: string, button?: HTMLButtonElement) => {
    element = null;
    window.jsmeApplet?.setAction?.(TOOL_ACTIONS[tool]);
    if (button) markSelected(button);
  };

  const chooseElement = (symbol: string, button: HTMLButtonElement) => {
    if (!(symbol in ELEMENT_KEYS)) {
      if (!xAtomBox) return;
      xAtomBox.value = atomicSmilesForXBox(symbol);
    }
    element = symbol;
    window.jsmeApplet?.setAction?.(PLACE_CARBON);
    markSelected(button);
  };

  // An element or a drawing tool; undo, redo, clean and clear are commands,
  // handled where they are clicked.
  const choose = (button: HTMLButtonElement) => {
    const tool = button.dataset.tool;
    if (button.dataset.element) chooseElement(button.dataset.element, button);
    else if (tool && tool in TOOL_ACTIONS) chooseTool(tool, button);
  };

  // A pick from the periodic table: one of the nine selects its own button;
  // any other gets a button at the end of the row (the four most recent are
  // kept) and is chosen at once, so the next click on the sketch places it.
  const PICKED_KEPT = 4;
  const pickElement = (symbol: string) => {
    if (!elementRow || !moreButton) return;
    let button = elementRow.querySelector<HTMLButtonElement>(`[data-element="${symbol}"]`);
    if (!button) {
      button = document.createElement('button');
      button.className = 'sketch-element';
      button.dataset.element = symbol;
      button.dataset.picked = '';
      button.title = `${symbol}: click or drag onto an atom to change it, or onto empty space to place one`;
      button.textContent = symbol;
      button.setAttribute('aria-pressed', 'false');
      elementRow.insertBefore(button, moreButton);
      const picked = elementRow.querySelectorAll('[data-picked]');
      if (picked.length > PICKED_KEPT) picked[0].remove();
    }
    chooseElement(symbol, button);
  };
  if (moreButton) setupPeriodicTable(moreButton, pickElement);

  // A clean replaces JSME's molecule, and JSME's own undo cannot step back
  // over it (measured: Ctrl+Z after a clean leaves the clean layout). So the
  // drawing from before is kept, and Undo puts it back — while the clean
  // layout is still what is drawn; any edit since, and Undo is JSME's again.
  // JSME rescales a drawing it reads to its standard bond length, so a drawing
  // with a stretched bond comes back uniformly smaller (×0.78 after one long
  // drag): the same picture, at JSME's scale.
  let cleaned: { before: string; after: string } | null = null;

  for (const bar of [document.getElementById('sketch-tools'), elementRow]) {
    bar?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool], [data-element]');
      const applet = window.jsmeApplet;
      if (!button || !applet) return;
      const tool = button.dataset.tool;
      if (tool === 'undo' && cleaned && drawingOf(applet.molFile()) === drawingOf(cleaned.after)) {
        applet.readMolFile(cleaned.before);
        cleaned = null;
        reselect();
      } else if (tool === 'undo' || tool === 'redo') {
        pressKey(stage, tool === 'undo' ? 'z' : 'y', true);
      } else if (tool === 'clean') {
        cleaned = cleanLayout(applet) ?? cleaned;
        reselect();
      } else if (tool === 'clear') {
        // JSME's clear() empties the molecule but does not redraw, so the old
        // structure stayed on screen and Clear looked dead. And right after
        // an undo or redo the first call is ignored (measured; the second
        // always takes). Clear until empty, then redraw.
        applet.clear();
        if (applet.smiles()) applet.clear();
        applet.repaint();
      } else {
        choose(button);
      }
    });
  }
  setupDragFromToolbar(stage, choose);

  /** Reading a MOL block can reset JSME's action: set the chosen tool or
   *  element again. */
  function reselect(): void {
    const selected = buttons().find((b) => b.getAttribute('aria-pressed') === 'true');
    if (selected) choose(selected);
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
      pressKey(stage, elementKey(element));
    } else {
      // JSME places a carbon only on an empty sketch (beside a structure its
      // action adds nothing); the release below makes it the element
      placing = !window.jsmeApplet?.smiles?.();
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
    const key = elementKey(element);
    const { clientX, clientY } = event;
    // The new carbon is not always under the pointer: on a fresh page JSME
    // draws the first atom at the centre of the drawing whatever the click,
    // and it draws it only on its next pointer event. Typing the key at the
    // click point found nothing there, and the first atom of every session
    // stayed CH4 (2026-10-06). So: a move where the click was, so JSME draws
    // the atom; a move onto the atom where it was drawn; then the key, once
    // JSME shows the atom under the pointer. A few frames' grace for the
    // drawing to catch up.
    const convert = (triesLeft: number) => {
      movePointer(clientX, clientY);
      const atom = loneAtomPoint(stage);
      if (atom) movePointer(atom.x, atom.y);
      if (pointerIsOnStructure(stage)) {
        pressKey(stage, key);
      } else if (triesLeft > 0) {
        setTimeout(() => convert(triesLeft - 1), 50);
      }
    };
    setTimeout(() => convert(5), 0);
  });

  // JSME builds its menus asynchronously after the applet exists; clip them as
  // soon as they are there, and start on the single bond. Then fetch the X
  // box for "More…" — pressing JSME's X button makes the X atom its action,
  // so the chosen tool is set again once the box is in hand.
  if (moreButton) moreButton.disabled = true;
  const start = () => {
    let tries = 0;
    const attempt = () => {
      if (clipJsmeMenus(container, stage)) {
        const single = buttons().find((b) => b.dataset.tool === 'single');
        chooseTool('single', single);
        void openXAtomBox(stage).then((box) => {
          xAtomBox = box;
          const selected = buttons().find((b) => b.getAttribute('aria-pressed') === 'true');
          if (selected?.dataset.element) chooseElement(selected.dataset.element, selected);
          else if (selected?.dataset.tool) chooseTool(selected.dataset.tool, selected);
          if (moreButton) {
            moreButton.disabled = !box;
            if (!box) moreButton.title = 'More elements: unavailable — the sketcher did not open its atom box';
          }
        });
      } else if (tries++ < 50) {
        setTimeout(attempt, 100);
      }
    };
    attempt();
  };
  if (window.jsmeApplet) start();
  else window.addEventListener('jsme-ready', start, { once: true });
}
