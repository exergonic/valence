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
 * The X atom also carries the charges JSME refuses (x-atom-labels.ts): the
 * charge tool falls back to it. And it carries a radical, which JSME has no
 * tool for: our radical tool puts the dot on an atom as an X atom, "C•".
 *
 * An element or a drawing tool can also be dragged onto the sketch; the drop
 * does what a click with it does there (setupDragFromToolbar).
 *
 * The codes, keys and the X box were mapped against jsme-editor 2024.04.29
 * (NOTES.md); a JSME upgrade must re-check them.
 */
import { setupPeriodicTable } from './periodic-table';
import { groupByCode, setupGroupPalette, type FunctionalGroup } from './functional-groups';
import { implicitHydrogenCounts, takesImplicitHydrogens } from '../chem/fill-hydrogens';
import { parseMolBlock } from '../mol-parser';
import { jmeAtomLabel, parseXAtomLabel, xAtomLabels } from './x-atom-labels';

/** setAction() codes for our tools. */
const TOOL_ACTIONS: Record<string, number> = {
  delete: 104,
  // JSME's "Move atom" (its tooltip table, 2026-10-20): drag an atom and only
  // that atom moves; a drag on empty space does nothing. JSME has no lasso —
  // one atom at a time, and Shift-drag on empty space turns the whole molecule
  // whatever the tool.
  move: 113,
  charge: 108, // cycles the charge of the atom clicked
  // JSME has no radical: the toolbar's own (toggleRadical), its press kept
  // from JSME. Underneath, the action an element uses (PLACE_CARBON), under
  // which JSME outlines the atom under the pointer and takes its keys; under
  // "Move atom" it did neither.
  radical: 253,
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
 * Change JSME's drawing at the zoom the user had. JSME puts its zoom (its
 * "molecular area scale": 2 on a fresh page, the mouse wheel changes it) back
 * to 1 on every read and on its own Undo and Redo, so a Clean, an example
 * drawn, an Undo, or any of the rewrites below would shrink the drawing on
 * screen (asked for 2026-10-30).
 */
function keepingZoom(applet: Window['jsmeApplet'], change: () => void): void {
  const zoom = applet.getMolecularAreaScale();
  change();
  applet.setMolecularAreaScale(zoom);
}

function readMolFile(applet: Window['jsmeApplet'], molFile: string): void {
  keepingZoom(applet, () => applet.readMolFile(molFile));
}

/** A JME string, as tokens. */
function readJme(applet: Window['jsmeApplet'], jme: string[]): void {
  keepingZoom(applet, () => applet.readMolecule(jme.join(' ')));
}

/**
 * Lay the drawing out afresh: JSME's own MOL block read back with every
 * coordinate zeroed, which makes JSME compute 2D coordinates. JSME's "Compute
 * 2D coordinates" sits in a menu we cannot reach (its molecule menu, behind a
 * deferred internal command), so this is the public road to the same layout.
 * It keeps everything the drawing says — the atoms in order, drawn
 * hydrogens (H–Ni–H keeps its three atoms; a SMILES round trip folds them
 * away), charges, the X box's elements, ring and E/Z stereo, chirality
 * (trans-2-methylcyclohexanol reads back the same SMILES). A charged X atom
 * is the exception — a MOL read makes it a plain neutral atom — so those are
 * put back after (restoreXAtoms). Returns the drawing before (to undo to)
 * and the MOL block after, or null for an empty sketch.
 */
function cleanLayout(applet: Window['jsmeApplet']): { before: Drawing; after: string } | null {
  if (!applet.smiles()) return null;
  const before = drawingNow(applet);
  const zeroed = withCoordinatesZeroed(before.molFile);
  if (!zeroed) return null;
  readMolFile(applet, zeroed);
  restoreXAtoms(applet, before.xAtoms);
  return { before, after: applet.molFile() };
}

/** A V2000 MOL block with every atom at the origin, which JSME reads by
 *  laying the molecule out in 2D itself; null if it has no counts line. */
function withCoordinatesZeroed(molFile: string): string | null {
  const lines = molFile.split('\n');
  const atomCount = parseInt(lines[3]?.slice(0, 3) ?? '', 10);
  if (!Number.isFinite(atomCount)) return null;
  return lines
    .map((line, i) => (i >= 4 && i < 4 + atomCount ? `    0.0000    0.0000    0.0000${line.slice(30)}` : line))
    .join('\n');
}

/**
 * Draw a structure in the sketcher, an example's: its MOL block carries 3D
 * coordinates, so it goes in laid out afresh, as Clean lays a drawing out.
 * An atom JSME gives a charge other than the block's then goes in as an X
 * atom with the block's: the charges JSME refuses (Ni²⁺, its Cl⁻ and C⁻
 * ligands read neutral) and the ones it imposes (diborane's four-bonded B
 * read B⁻, its bridging H H⁺). A neutral one is bracketed too, "[B]", or
 * JSME's own atom would take the charge again. So the drawing is the
 * molecule on screen, and Build reads the same molecule back.
 */
export function drawInSketcher(applet: Window['jsmeApplet'], molFile: string): void {
  const zeroed = withCoordinatesZeroed(molFile);
  if (!zeroed) return;
  readMolFile(applet, zeroed);
  const drawn = parseMolBlock(molFile).atoms;
  const read = parseMolBlock(applet.molFile()).atoms;
  const jme = jmeTokens(applet);
  let relabelled = false;
  drawn.forEach((atom, i) => {
    const charge = atom.charge ?? 0;
    if (charge === (read[i]?.charge ?? 0)) return;
    jme[jmeLabel(i)] = charge === 0 ? `[${atom.element}]` : jmeAtomLabel(atom.element, charge);
    relabelled = true;
  });
  if (relabelled) readJme(applet, jme);
}

/** A drawing as Clean keeps it to undo to: its MOL block, and the charged X
 *  atoms the block cannot carry. */
interface Drawing {
  molFile: string;
  xAtoms: Map<number, string>;
}

function drawingNow(applet: Window['jsmeApplet']): Drawing {
  return { molFile: applet.molFile(), xAtoms: xAtomLabels(applet.molFile(true)) };
}

function readDrawing(applet: Window['jsmeApplet'], drawing: Drawing): void {
  readMolFile(applet, drawing.molFile);
  restoreXAtoms(applet, drawing.xAtoms);
}

/**
 * Give atoms back their X-atom charges after a MOL read: JSME's JME string
 * with each such atom's label bracketed ("[I-]"), which JSME reads as the X
 * atom again. A JME read keeps the coordinates, wedges and drawn hydrogens,
 * and every format JSME writes lists the atoms in the same order.
 */
function restoreXAtoms(applet: Window['jsmeApplet'], xAtoms: Map<number, string>): void {
  if (xAtoms.size === 0) return;
  const jme = jmeTokens(applet);
  for (const [index, label] of xAtoms) jme[jmeLabel(index)] = `[${label}]`;
  readJme(applet, jme);
}

/**
 * Give one atom a charge JSME refused it, by reading the drawing back as a
 * JME string with that atom's label set (x-atom-labels.ts). Not the X key
 * on the atom: that keeps the charge JSME had inferred and adds the label's
 * to it — I₃'s I⁺ became "[I-+]". A radical keeps its dot. The other X atoms
 * go in bracketed, so they stay. Returns the drawing before, to undo to.
 */
function setRefusedCharge(applet: Window['jsmeApplet'], atom: { index: number; element: string }, charge: number): Drawing {
  const before = drawingNow(applet);
  const jme = jmeTokens(applet);
  for (const [index, label] of before.xAtoms) jme[jmeLabel(index)] = `[${label}]`;
  const radical = parseXAtomLabel(before.xAtoms.get(atom.index) ?? '')?.radical ?? false;
  jme[jmeLabel(atom.index)] = jmeAtomLabel(atom.element, charge, radical);
  readJme(applet, jme);
  return before;
}

/** A JME atom label's charge: "N+" 1, "O-" −1, "C-2" −2, "C" 0. */
function labelCharge(label: string): number {
  const match = /([+-])(\d*)\]?$/.exec(label);
  if (!match) return 0;
  const size = match[2] ? Number(match[2]) : 1;
  return match[1] === '-' ? -size : size;
}

/** A JME string's bonds: "a-b" (0-based, the lower first) → bond order. */
function bondOrders(jme: string[]): Map<string, number> {
  const atomCount = Number(jme[0]);
  const orders = new Map<string, number>();
  for (let k = 2 + 3 * atomCount; k + 2 < jme.length; k += 3) {
    const a = Number(jme[k]) - 1;
    const b = Number(jme[k + 1]) - 1;
    orders.set(a < b ? `${a}-${b}` : `${b}-${a}`, Number(jme[k + 2]));
  }
  return orders;
}

/**
 * Where each atom of the drawing before an edit is after it: the same place
 * when atoms were only added (JSME puts a new atom last); one place lower past
 * a deleted atom, which is the one whose removal leaves the other bonds where
 * they were. Null for anything else.
 */
function atomPlaces(before: string[], after: string[]): number[] | null {
  const count = Number(before[0]);
  const countAfter = Number(after[0]);
  if (countAfter >= count) return Array.from({ length: count }, (_, i) => i);
  if (countAfter !== count - 1) return null;
  const bondsAfter = new Set(bondOrders(after).keys());
  for (let deleted = 0; deleted < count; deleted++) {
    const place = (i: number) => (i < deleted ? i : i === deleted ? -1 : i - 1);
    const kept = [...bondOrders(before).keys()]
      .map((key) => key.split('-').map((i) => place(Number(i))))
      .filter(([a, b]) => a >= 0 && b >= 0)
      .map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`));
    if (kept.length === bondsAfter.size && kept.every((key) => bondsAfter.has(key))) {
      return Array.from({ length: count }, (_, i) => place(i));
    }
  }
  return null;
}

/** A pairing JSME made, and what undoes it: the bond (atoms in the drawing
 *  after the edit, 0-based), its order before, and its atoms' charges. */
export interface ChargePairing {
  atoms: [number, number];
  order: number;
  charges: [number, number];
}

/**
 * The opposite charges JSME paired in an edit. On every edit, not only a
 * charge click, JSME turns two neighbouring opposite charges into a bond: a C⁻
 * beside an N⁺ becomes C=N, both neutral — nitro's N then five-bonded, and an
 * ammonium ylide's too (NOTES.md, 2026-10-26). The chemist drew the
 * zwitterion on purpose (a resonance form, an ylide, a nitronate), so the
 * toolbar undoes each pairing. Read off the JME strings before and after the
 * edit: a bond one order higher whose two atoms are now neutral, at least one
 * of them charged before. Two opposite charges get their charges back; where
 * the charge tool made the pair, the atom clicked (`clicked`, or the bond's
 * neutral atom — a plain carbon has no label to find it by) gets the opposite
 * of its partner's.
 */
export function chargePairings(before: string[], after: string[], clicked: number | null): ChargePairing[] {
  const places = atomPlaces(before, after);
  if (!places) return [];
  const ordersAfter = bondOrders(after);
  const pairings: ChargePairing[] = [];
  for (const [key, order] of bondOrders(before)) {
    const [a, b] = key.split('-').map(Number);
    const [a2, b2] = [places[a], places[b]];
    if (a2 < 0 || b2 < 0 || order < 1) continue;
    if (ordersAfter.get(a2 < b2 ? `${a2}-${b2}` : `${b2}-${a2}`) !== order + 1) continue;
    const [qa, qb] = [labelCharge(before[jmeLabel(a)]), labelCharge(before[jmeLabel(b)])];
    if (labelCharge(after[jmeLabel(a2)]) !== 0 || labelCharge(after[jmeLabel(b2)]) !== 0) continue;
    if (qa === 0 && qb === 0) continue;
    let charges: [number, number];
    if (qa === -qb) charges = [qa, qb];
    else if (qa === 0) charges = [-qb, qb];
    else if (qb === 0) charges = [qa, -qa];
    // the same sign on both: the clicked one was cycled past zero to pair
    else if (clicked === a) charges = [-qb, qb];
    else if (clicked === b) charges = [qa, -qa];
    else continue;
    pairings.push({ atoms: [a2, b2], order, charges });
  }
  return pairings;
}

/**
 * Undo JSME's pairings (chargePairings): read the drawing back with each bond
 * at its order before and its atoms charged — JSME's own charged atom ("C-",
 * which a JME read keeps beside an N⁺), or the X atom where the atom is one.
 * The X atoms go in bracketed, so they stay.
 */
function unpairCharges(applet: Window['jsmeApplet'], pairings: ChargePairing[]): void {
  const jme = jmeTokens(applet);
  const xAtoms = xAtomLabels(applet.molFile(true));
  for (const [index, label] of xAtoms) jme[jmeLabel(index)] = `[${label}]`;
  const bondStart = 2 + 3 * Number(jme[0]);
  for (const { atoms: [a, b], order, charges } of pairings) {
    for (let k = bondStart; k + 2 < jme.length; k += 3) {
      const [i, j] = [Number(jme[k]) - 1, Number(jme[k + 1]) - 1];
      if ((i === a && j === b) || (i === b && j === a)) jme[k + 2] = String(order);
    }
    [a, b].forEach((atom, n) => {
      const label = xAtoms.get(atom) ?? jme[jmeLabel(atom)];
      const xAtom = parseXAtomLabel(label);
      const element = xAtom?.element ?? /^[A-Z][a-z]?/.exec(label)?.[0] ?? 'C';
      jme[jmeLabel(atom)] = xAtom ? jmeAtomLabel(element, charges[n], xAtom.radical) : ownAtomLabel(element, charges[n]);
    });
  }
  readJme(applet, jme);
}

/** A JME string's bonds, atoms 0-based: [a, b, order]. */
function jmeBonds(jme: string[]): Array<[number, number, string]> {
  const bonds: Array<[number, number, string]> = [];
  for (let k = 2 + 3 * Number(jme[0]); k + 2 < jme.length; k += 3) bonds.push([Number(jme[k]) - 1, Number(jme[k + 1]) - 1, jme[k + 2]]);
  return bonds;
}

/**
 * A group in the place of the atom clicked, as an element button replaces
 * it: ethane with NO₂ on one methyl is nitromethane, toluene's methyl gives
 * nitrobenzene, a lone carbon gives the group alone. JSME's substituent
 * action bonds the group to the atom instead (functional-groups.ts), so after
 * it the atom is taken out and the group moved so its first atom stands
 * where the atom was, bonded to the atom's neighbour by the group's own bond
 * (=O's is double: =O on ethane's methyl gives formaldehyde). Only an end
 * atom has a place to give; a ring or chain atom does not, and there the
 * group is not drawn (the toolbar reads the drawing back) — a substituent on
 * a ring is a bond drawn first, then the group on its end. One rule, as the
 * elements have (asked for 2026-10-30). Takes the JME strings before and
 * after JSME's action; returns the drawing's JME tokens, or null where there
 * is no end atom to replace.
 */
export function groupInPlaceOfAtom(before: string[], after: string[]): string[] | null {
  const count = Number(before[0]);
  const countAfter = Number(after[0]);
  if (countAfter <= count) return null;
  const bondsAfter = jmeBonds(after);
  // the bond JSME drew from the atom clicked to the group's first atom
  const link = bondsAfter.find(([a, b]) => (a < count) !== (b < count));
  if (!link) return null;
  const [clicked, first] = link[0] < count ? [link[0], link[1]] : [link[1], link[0]];
  const own = jmeBonds(before).filter(([a, b]) => a === clicked || b === clicked);
  if (own.length > 1) return null;
  const neighbour = own.length === 1 ? (own[0][0] === clicked ? own[0][1] : own[0][0]) : null;

  const xy = (i: number) => [Number(after[jmeLabel(i) + 1]), Number(after[jmeLabel(i) + 2])];
  const [dx, dy] = [xy(clicked)[0] - xy(first)[0], xy(clicked)[1] - xy(first)[1]];
  const atoms: string[] = [];
  for (let i = 0; i < countAfter; i++) {
    if (i === clicked) continue;
    const [x, y] = xy(i);
    const shift = i >= count ? 1 : 0;
    atoms.push(after[jmeLabel(i)], (x + shift * dx).toFixed(2), (y + shift * dy).toFixed(2));
  }
  const place = (i: number) => (i > clicked ? i - 1 : i);
  const bonds: string[] = [];
  for (const bond of bondsAfter) {
    if (bond === link) continue;
    // the atom's bond to its neighbour becomes the group's
    const [a, b, order] = bond[0] === clicked || bond[1] === clicked ? [neighbour!, first, link[2]] : bond;
    bonds.push(String(place(a) + 1), String(place(b) + 1), order);
  }
  return [String(countAfter - 1), String(bonds.length / 3), ...atoms, ...bonds];
}

/** An atom's label in a JME string as JSME's own atom, not the X atom: "C",
 *  "C-", "N+". */
function ownAtomLabel(element: string, charge: number): string {
  if (charge === 0) return element;
  const size = Math.abs(charge);
  return `${element}${charge < 0 ? '-' : '+'}${size > 1 ? size : ''}`;
}

/** What the X box holds while the radical tool finds its atom: an element a
 *  lesson does not draw, so the atom that becomes it is the one under the
 *  pointer. One JSME knows: "[Og]", past its table, changed nothing. */
const RADICAL_PLACEHOLDER = '[Rn]';

/**
 * Put a radical's dot on the atom under the pointer, or take it off. JSME
 * draws no label on a plain carbon, so the hover cannot name the atom; its X
 * key can — it turns the atom under the pointer into whatever the X box
 * holds. So the box holds a placeholder for the moment of the key press, and
 * the atom that became it is the one; the drawing is then read back from
 * before, that atom relabelled. A radical centre is one hydrogen short of its
 * usual valence, so only an atom the filler would give a hydrogen takes the
 * dot. Returns the drawing before, to undo to, or null when nothing changed.
 */
function toggleRadical(applet: Window['jsmeApplet'], stage: HTMLElement, box: HTMLInputElement): Drawing | null {
  const before = drawingNow(applet);
  const jme = jmeTokens(applet);
  const kept = box.value;
  box.value = RADICAL_PLACEHOLDER;
  pressKey(stage, X_ATOM_KEY);
  box.value = kept;
  const after = jmeTokens(applet);
  // the atom that became the placeholder — not any atom that changed: the
  // edit also sets JSME pairing a C⁻ beside an N⁺ again (pairedCharge)
  const placeholder = RADICAL_PLACEHOLDER.replace(/[[\]]/g, '');
  const atomCount = Number(jme[0]);
  let index = -1;
  for (let i = 0; i < atomCount; i++) if (after[jmeLabel(i)] === placeholder && jme[jmeLabel(i)] !== placeholder) index = i;
  if (index < 0) return null; // a bond, or JSME missed the press

  for (const [i, label] of before.xAtoms) jme[jmeLabel(i)] = `[${label}]`;
  const label = before.xAtoms.get(index) ?? jme[jmeLabel(index)];
  const xAtom = parseXAtomLabel(label);
  const element = xAtom?.element ?? /^[A-Z][a-z]?/.exec(label)?.[0] ?? 'C';
  const charge = xAtom?.charge ?? labelCharge(label);
  const radical = !xAtom?.radical;
  const molecule = parseMolBlock(before.molFile);
  molecule.atoms[index] = { ...molecule.atoms[index], element, charge };
  const hasHydrogenToGive = takesImplicitHydrogens(element) && implicitHydrogenCounts(molecule)[index] > 0;
  if (radical && !hasHydrogenToGive) {
    readJme(applet, jme); // the placeholder out again
    return null;
  }
  // off again: back to JSME's own atom where JSME holds the charge, the X
  // atom where it does not (a charge JSME refused stays refused)
  jme[jmeLabel(index)] = radical ? jmeAtomLabel(element, charge, true)
    : element in ELEMENT_KEYS ? ownAtomLabel(element, charge)
      : jmeAtomLabel(element, charge);
  readJme(applet, jme);
  return before;
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

/**
 * The atom under JSME's hover box: its index, and the element and charge its
 * label draws — "I+", "Si2+", "NH4+", "-O", or an X atom's "Si-2". JSME
 * labels every atom but a plain carbon, in atom order, so the label's place
 * among the drawing's labels is the atom's place among the JME string's
 * atoms not labelled "C". Null over a bond, an unlabelled carbon (never a
 * centre JSME refuses a charge that it could hold) or if the two disagree.
 */
function hoveredAtom(stage: HTMLElement, jme: string[]): { index: number; element: string; charge: number } | null {
  const parts = jsmeParts(stage);
  const hover = parts?.drawing.querySelector('rect[stroke="blue"]')?.getBoundingClientRect();
  if (!parts || !hover) return null;
  const x = hover.left + hover.width / 2;
  const y = hover.top + hover.height / 2;
  const labels = Array.from(parts.drawing.querySelectorAll('text'));
  const k = labels.findIndex((text) => {
    const box = text.getBoundingClientRect();
    return x >= box.left - 3 && x <= box.right + 3 && y >= box.top - 3 && y <= box.bottom + 3;
  });
  const labelled: number[] = [];
  for (let i = 0; i < Number(jme[0]); i++) if (jme[jmeLabel(i)] !== 'C') labelled.push(i);
  if (k < 0 || labelled.length !== labels.length) return null;
  const text = labels[k].textContent ?? '';
  // the element is the label's first symbol that is not a hydrogen count ("HO" is an O)
  const symbols = text.match(/[A-Z][a-z]?/g) ?? [];
  const element = symbols.find((symbol) => symbol !== 'H') ?? symbols[0];
  if (!element || !jme[jmeLabel(labelled[k])].replace(/[[\]]/g, '').startsWith(element)) return null;
  const charge = /(\d*)([+-])(\d*)/.exec(text);
  const size = charge ? Number(charge[1] || charge[3] || 1) : 0;
  return { index: labelled[k], element, charge: charge?.[2] === '-' ? -size : size };
}

/** JSME's JME string as tokens: "<atoms> <bonds> <label> <x> <y> … <atom>
 *  <atom> <order> …". Atom i's label is token jmeLabel(i). */
function jmeTokens(applet: Window['jsmeApplet']): string[] {
  return applet.jmeFile().trim().split(/\s+/);
}

function jmeLabel(index: number): number {
  return 2 + 3 * index;
}

/** Did JSME just refuse a charge? It says so on its status line: "Charge
 *  change not possible on the halogen !", "… on multibonded N or P !", and on
 *  an X atom "Use X button to change charge on the X atom !". */
function chargeRefused(stage: HTMLElement): boolean {
  return Array.from(stage.querySelectorAll('svg text'))
    .some((text) => /Charge change not possible|Use X button to change charge/.test(text.textContent ?? ''));
}

/** Elements JSME's charge tool has no rule for: a click does nothing, and
 *  says nothing (its table covers H, B, C, N, O, P, S, Se and the halogens,
 *  and the metals; Si falls through). */
const NO_CHARGE_RULE = new Set(['Si']);

/**
 * The charge tool's next step where JSME refuses one. On one of JSME's own
 * atoms the charge it shows is its inference from the bond count, and for a
 * cation it is the wrong sign of the ion drawn — I₃ reads I⁺, SiF₆ Si²⁺ — so
 * the first click turns it to the anion; an uncharged one (ICl₄, BrF₄, SF₅)
 * becomes the anion too, as the hypervalent ions a lesson draws mostly are.
 * On our X atom it cycles anion → cation (IF₆⁺) → neutral. Neutral hands the
 * atom back to JSME, which may infer its cation again.
 */
function nextCharge(charge: number, onXAtom: boolean): number {
  if (!onXAtom) return charge > 0 ? -charge : charge === 0 ? -1 : 0;
  if (charge === 0) return -1;
  if (charge === -1) return 1;
  return 0;
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
 *
 * A group can be dragged straight out of the "Groups…" list too (asked for
 * 2026-10-20): as the drag starts, `fromGroupList` picks it as a click would —
 * the list closes and the group gets its button in the row — and the drag
 * carries that button, so a drop that adds nothing sends the chip there.
 */
function setupDragFromToolbar(
  stage: HTMLElement,
  choose: (button: HTMLButtonElement) => void,
  fromGroupList: (cell: HTMLButtonElement) => HTMLButtonElement | null,
): void {
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

  const begin = (pressedButton: HTMLButtonElement, x: number, y: number) => {
    const button = pressedButton.dataset.code ? fromGroupList(pressedButton) : pressedButton;
    if (!button) return;
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
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '#sketch-tools [data-tool], #sketch-elements [data-element], #sketch-elements [data-group], #group-palette .fg-cell',
    );
    // the move tool acts by dragging an atom already drawn: dropped, it would do nothing
    const draggable = !!button?.dataset.element || !!button?.dataset.group || !!button?.dataset.code
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
      if (!dragged) {
        pressed = null;
        return;
      }
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
  const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>(
    '#sketch-tools [data-tool], #sketch-elements [data-element], #sketch-elements [data-group]',
  ));
  const groupsButton = document.getElementById('sketch-groups') as HTMLButtonElement | null;
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

  // A functional group is one of JSME's substituent actions: a click on an
  // atom bonds the group to it (functional-groups.ts)
  const chooseGroup = (code: number, button: HTMLButtonElement) => {
    element = null;
    window.jsmeApplet?.setAction?.(code);
    markSelected(button);
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
    else if (button.dataset.group) chooseGroup(Number(button.dataset.group), button);
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

  // A pick from the functional groups: a button for it at the end of the row,
  // before "Groups…" (the three most recent kept), chosen at once, so the
  // next click on an atom attaches it — or drag the button onto one.
  const GROUPS_KEPT = 3;
  const pickGroup = (group: FunctionalGroup): HTMLButtonElement | null => {
    if (!elementRow || !groupsButton) return null;
    let button = elementRow.querySelector<HTMLButtonElement>(`[data-group="${group.code}"]`);
    if (!button) {
      button = document.createElement('button');
      button.className = 'sketch-element sketch-group';
      button.dataset.group = String(group.code);
      button.title = `${group.label} — ${group.name}: click or drag onto an end atom to put it in that atom's place`;
      button.textContent = group.label;
      button.setAttribute('aria-pressed', 'false');
      elementRow.insertBefore(button, groupsButton);
      const picked = elementRow.querySelectorAll('[data-group]');
      if (picked.length > GROUPS_KEPT) picked[0].remove();
    }
    chooseGroup(group.code, button);
    return button;
  };
  const closeGroupList = groupsButton ? setupGroupPalette(groupsButton, pickGroup) : () => {};
  // a group dragged out of the list: picked, as a click on it would
  const fromGroupList = (cell: HTMLButtonElement) => {
    const group = groupByCode(Number(cell.dataset.code));
    if (!group) return null;
    closeGroupList();
    return pickGroup(group);
  };

  // A clean replaces JSME's molecule, and so does a charge JSME refused
  // (below); JSME's own undo cannot step back over either (measured: Ctrl+Z
  // after a clean leaves the clean layout). So the drawing from before is
  // kept, and Undo puts it back — while the result is still what is drawn;
  // any edit since, and Undo is JSME's again. JSME rescales a drawing it reads
  // to its standard bond length, so a drawing with a stretched bond comes back
  // uniformly smaller (×0.78 after one long drag): the same picture, at
  // JSME's scale.
  let readBack: { before: Drawing; after: string } | null = null;

  for (const bar of [document.getElementById('sketch-tools'), elementRow]) {
    bar?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool], [data-element], [data-group]');
      const applet = window.jsmeApplet;
      if (!button || !applet) return;
      const tool = button.dataset.tool;
      if (tool === 'undo' && readBack && drawingOf(applet.molFile()) === drawingOf(readBack.after)) {
        readDrawing(applet, readBack.before);
        readBack = null;
        reselect();
      } else if (tool === 'undo' || tool === 'redo') {
        keepingZoom(applet, () => pressKey(stage, tool === 'undo' ? 'z' : 'y', true));
      } else if (tool === 'clean') {
        readBack = cleanLayout(applet) ?? readBack;
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
  setupDragFromToolbar(stage, choose, fromGroupList);

  /** Reading a MOL block can reset JSME's action: set the chosen tool or
   *  element again. */
  function reselect(): void {
    const selected = buttons().find((b) => b.getAttribute('aria-pressed') === 'true');
    if (selected) choose(selected);
  }

  // Any press on the sketch can end in an edit, and in any edit JSME may pair
  // two opposite charges into a bond (chargePairings). So the drawing is kept
  // at the press — registered first, ahead of the element and radical tools,
  // which edit on the press — and after the release a pairing is undone, Undo
  // taking it back (readBack). Then the charge tool where JSME refuses
  // (x-atom-labels.ts): when the drawing is unchanged and its status line says
  // the charge was not possible, the atom clicked gets the next charge as an
  // X atom. A press with a group chosen is settled before the release
  // (putGroupInPlace).
  let press: { atom: { index: number; element: string; charge: number } | null; drawing: Drawing; before: string; tool?: string; group?: FunctionalGroup } | null = null;
  stage.addEventListener('mousedown', (event) => {
    press = null;
    const applet = window.jsmeApplet;
    if (event.button !== 0 || !applet) return;
    const before: string = applet.jmeFile();
    const selected = buttons().find((b) => b.getAttribute('aria-pressed') === 'true');
    const group = selected?.dataset.group ? groupByCode(Number(selected.dataset.group)) : undefined;
    press = { atom: hoveredAtom(stage, before.trim().split(/\s+/)), drawing: drawingNow(applet), before, tool: selected?.dataset.tool, group };
    if (group) {
      const drawing = press.drawing;
      requestAnimationFrame(() => putGroupInPlace(before, drawing));
    }
  }, true);
  stage.addEventListener('mouseup', () => {
    const click = press;
    press = null;
    if (!click || click.group) return;
    setTimeout(() => {
      const applet = window.jsmeApplet;
      const pairings = chargePairings(click.before.trim().split(/\s+/), jmeTokens(applet), click.atom?.index ?? null);
      if (pairings.length > 0) {
        unpairCharges(applet, pairings);
        readBack = { before: click.drawing, after: applet.molFile() };
        reselect();
        return;
      }
      const atom = click.atom;
      if (click.tool !== 'charge' || !atom) return;
      const refused = chargeRefused(stage) || NO_CHARGE_RULE.has(atom.element);
      if (!refused || applet.jmeFile() !== click.before) return;
      const drawn = setRefusedCharge(applet, atom, nextCharge(atom.charge, click.drawing.xAtoms.has(atom.index)));
      readBack = { before: drawn, after: applet.molFile() };
      reselect();
    }, 0);
  }, true); // capture, ahead of the tools that keep the release from JSME

  // A group from "Groups…": JSME draws it on the press, bonded to the atom
  // clicked, and it is put in that atom's place (groupInPlaceOfAtom) or taken
  // out again before the next frame is painted — so the bonded group, there
  // for the length of the press, is never seen (2026-10-30).
  function putGroupInPlace(before: string, drawing: Drawing): void {
    const applet = window.jsmeApplet;
    const beforeJme = before.trim().split(/\s+/);
    const jme = jmeTokens(applet);
    if (Number(jme[0]) <= Number(beforeJme[0])) return; // JSME drew nothing
    for (const [index, label] of xAtomLabels(applet.molFile(true))) jme[jmeLabel(index)] = `[${label}]`;
    const placed = groupInPlaceOfAtom(beforeJme, jme);
    if (placed) {
      readJme(applet, placed);
      readBack = { before: drawing, after: applet.molFile() };
    } else {
      // the drawing from the press, whole: JSME also charged the atom it
      // bonded the group to (pyridine's N read N⁺)
      readDrawing(applet, drawing);
    }
    reselect();
  }

  // JSME's Undo and Redo typed on the keyboard reach JSME directly: the zoom
  // is put back before the next frame (keepingZoom does it for our buttons)
  stage.addEventListener('keydown', (event) => {
    const applet = window.jsmeApplet;
    if (!applet || !event.isTrusted || !(event.ctrlKey || event.metaKey) || !/^[zy]$/i.test(event.key)) return;
    const zoom = applet.getMolecularAreaScale();
    requestAnimationFrame(() => applet.setMolecularAreaScale(zoom));
  }, true);

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
  // The radical tool: every press is kept from JSME, and one on an atom puts
  // the dot on or takes it off (toggleRadical); Undo can take it back
  stage.addEventListener('mousedown', (event) => {
    const tool = buttons().find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.tool;
    const applet = window.jsmeApplet;
    if (tool !== 'radical' || event.button !== 0 || !applet) return;
    event.stopPropagation();
    event.preventDefault();
    swallowRelease = true;
    if (!xAtomBox || !pointerIsOnStructure(stage)) return;
    const before = toggleRadical(applet, stage, xAtomBox);
    if (before) {
      readBack = { before, after: applet.molFile() };
      reselect();
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
          if (selected) choose(selected);
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
