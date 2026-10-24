/**
 * Does an optimised structure still have the bonds the sketch draws?
 *
 * GFN2-xTB knows nothing of the drawing's bonds — it moves nuclei on an
 * energy surface — so a bad start can come back "converged" as a different
 * molecule. It happened: a hexan-2-amine whose start had clashing hydrogens
 * converged with C–H bonds of 3.7 A and two H2 molecules formed from them
 * (NOTES.md, 2026-10-06), and the app called it optimised. The embedder that
 * caused it is fixed; this is the guard that keeps any such result from being
 * shown as the molecule drawn.
 *
 * But a drawn bond that lengthens is not always an artifact. A bromonium ion
 * drawn on 2-phenylbut-2-ene opens toward the benzylic carbon: GFN2 (and the
 * Fortran xtb oracle) put that C–Br at 2.60 A with a Wiberg order of 0.20 —
 * an unsymmetrical bridge, the textbook picture of Markovnikov opening, not a
 * broken molecule (NOTES.md, 2026-10-23). So the guard grades what it finds:
 *
 * - a drawn bond is stretched when it is longer than 1.3 × the covalent radii
 *   sum (Cordero 2008, radii.ts) — generous, so a long hypervalent or metal
 *   bond (PCl5's axial 2.16 A against a 2.09 A sum) is not; every drawn bond
 *   in the examples is under 1.15 ×, diborane's bridges the longest;
 * - a stretched bond across which GFN2 still shares electrons (Wiberg order
 *   at least PARTIAL_WIBERG) is a partial bond: shown, drawn dashed;
 * - a stretched bond with less, or with no bond orders to read, came apart:
 *   the result is set aside, and shown only when the user asks;
 * - an undrawn bond has formed when two atoms not bonded, and not sharing a
 *   neighbour, are closer than the radii sum + 0.4 A, the tolerance
 *   bond-perception programs use. H2 (0.74 A against 1.02 A) is caught; a
 *   1,3 pair is exempt because its distance is set by the angle between two
 *   real bonds — diborane's B···B, 1.77 A across the bridging hydrogens, is
 *   one, and so is every geminal H···H. A formed bond still sets the result
 *   aside: it is the signature of a bad start.
 */
import type { Molecule } from '../mol-parser';
import { getCovalentRadius } from '../chem/radii';

const STRETCHED = 1.3;
const NEW_BOND_TOLERANCE = 0.4; // Å

/** The distance (Å) under which two atoms the sketch does not bond count as
 *  bonded: their covalent radii plus the bond-perception tolerance. The one
 *  rule for a new bond — read by the guard, the held structure's wall, and
 *  the embedder's ring turning (place3d.ts). */
export function newBondLimit(element1: string, element2: string): number {
  return getCovalentRadius(element1) + getCovalentRadius(element2) + NEW_BOND_TOLERANCE;
}
/**
 * The Wiberg order below which a stretched drawn bond has come apart. Measured
 * 2026-10-23 on GFN2's minima, each checked against the Fortran xtb oracle:
 * the 2-phenylbut-2-ene bromonium's C–Br 0.20 at 2.60 A (a weak bridge, kept),
 * the 1,1-diphenylethylene bromonium's Ph2C···Br 0.085 at 2.75 A (the open
 * benzhydryl cation). The examples' drawn bonds are all 0.49 or more, and xtb
 * itself lists no bond below 0.10.
 */
const PARTIAL_WIBERG = 0.1;

export interface BondingVerdict {
  /** Every drawn bond longer than a full bond, by index into `bonds` — the
   *  partial ones, and any that came apart. The renderer dashes them. */
  stretched: number[];
  /** A sentence for each partial bond, for the Info log. */
  partial: string[];
  /** A sentence naming the first drawn bond that came apart, or null. */
  broken: string | null;
  /** A sentence naming the first undrawn bond that formed, or null. */
  formed: string | null;
  /** Every undrawn pair that formed a bond, atom indices — drawn dashed as
   *  contacts, never added to the bonds. */
  formedPairs: [number, number][];
}

/**
 * Grade the optimised `molecule` (the sketch's bonds, GFN2's coordinates)
 * against the bonds drawn. `bondOrders` are GFN2's Wiberg orders, one per
 * bond in `molecule.bonds`, or null when the run could not give them. Atoms
 * are numbered from 1 in the sentences, as in the export files.
 */
export function assessBonding(molecule: Molecule, bondOrders: number[] | null): BondingVerdict {
  const { atoms, bonds } = molecule;
  const label = (i: number) => `${atoms[i].element}${i + 1}`;
  const distance = (i: number, j: number) =>
    Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z);
  const radii = (i: number, j: number) => getCovalentRadius(atoms[i].element) + getCovalentRadius(atoms[j].element);

  const verdict: BondingVerdict = { stretched: [], partial: [], broken: null, formed: null, formedPairs: [] };

  bonds.forEach((b, index) => {
    const r = distance(b.atom1Index, b.atom2Index);
    const full = radii(b.atom1Index, b.atom2Index);
    if (r <= STRETCHED * full) return;
    verdict.stretched.push(index);
    const name = `${label(b.atom1Index)}–${label(b.atom2Index)}`;
    const wiberg = bondOrders?.[index];
    if (wiberg !== undefined && wiberg >= PARTIAL_WIBERG) {
      verdict.partial.push(`${name} is ${r.toFixed(2)} Å, longer than a full bond (${full.toFixed(2)} Å from the `
        + `covalent radii), with a Wiberg order of ${wiberg.toFixed(2)}: a partial bond, drawn dashed.`);
    } else if (!verdict.broken) {
      verdict.broken = `the ${name} bond came apart (${r.toFixed(2)} Å`
        + `${wiberg !== undefined ? `, Wiberg ${wiberg.toFixed(2)}` : ''})`;
    }
  });

  const neighbours: Set<number>[] = atoms.map(() => new Set());
  for (const b of bonds) {
    neighbours[b.atom1Index].add(b.atom2Index);
    neighbours[b.atom2Index].add(b.atom1Index);
  }
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      if (neighbours[i].has(j)) continue;
      if ([...neighbours[i]].some((k) => neighbours[j].has(k))) continue;
      const r = distance(i, j);
      if (r < newBondLimit(atoms[i].element, atoms[j].element)) {
        verdict.formedPairs.push([i, j]);
        verdict.formed ??= `${label(i)} and ${label(j)}, not bonded in the sketch, are ${r.toFixed(2)} Å apart — a new bond`;
      }
    }
  }
  return verdict;
}

/** Is this still the molecule drawn, strictly — every drawn bond within a
 *  full bond's length and no new one? (A partial bond does not pass.) */
export function isMoleculeDrawn(molecule: Molecule): boolean {
  const verdict = assessBonding(molecule, null);
  return verdict.stretched.length === 0 && !verdict.formed;
}

/** How far inside the guard's limits the held structure's wall sits, and its
 *  stiffness (see heldRestraint). */
const HELD = 0.98;
const HELD_STIFFNESS = 1.0; // Eh/bohr²
const BOHR = 0.529177210903; // Å

/**
 * The held structure's restraint (decided with the user 2026-10-24): when
 * GFN2's free result is set aside, the drawn molecule is relaxed again with
 * its bonding held at the guard's own limits, so the picture shown is the
 * molecule as drawn, relaxed, rather than the embedder's start. Zero while
 * every drawn bond is within HELD × its full-bond limit and every pair the
 * guard watches for a new bond is outside HELD⁻¹ × its limit; past that, a
 * stiff harmonic wall. HELD keeps the wall a little inside the guard, so a
 * held structure passes it: a bond pushing on the wall overshoots by about
 * its force over 2k — 0.01 Å for 0.03 Eh/bohr, against a 0.05 Å margin.
 * Energy in Eh and gradient in Eh/bohr, per atom, from coordinates in Å.
 */
export function heldRestraint(molecule: Molecule): { energy: number; gradient: number[][] } {
  const { atoms, bonds } = molecule;
  const gradient = atoms.map(() => [0, 0, 0]);
  let energy = 0;
  const radii = (i: number, j: number) => getCovalentRadius(atoms[i].element) + getCovalentRadius(atoms[j].element);
  // a wall at `limit` Å on the distance i–j: 'below' holds a drawn bond
  // under it, 'above' holds a pair that must not bond beyond it
  const wall = (i: number, j: number, limit: number, side: 'below' | 'above') => {
    const d = [atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z];
    const r = Math.hypot(d[0], d[1], d[2]);
    const over = side === 'below' ? r - limit : limit - r; // Å past the wall
    if (over <= 0 || r === 0) return;
    const overBohr = over / BOHR;
    energy += HELD_STIFFNESS * overBohr * overBohr;
    // dE/dr in Eh/bohr, along the unit vector i←j
    const dEdr = (side === 'below' ? 1 : -1) * 2 * HELD_STIFFNESS * overBohr;
    for (let c = 0; c < 3; c++) {
      gradient[i][c] += (dEdr * d[c]) / r;
      gradient[j][c] -= (dEdr * d[c]) / r;
    }
  };

  const neighbours: Set<number>[] = atoms.map(() => new Set());
  for (const b of bonds) {
    neighbours[b.atom1Index].add(b.atom2Index);
    neighbours[b.atom2Index].add(b.atom1Index);
    wall(b.atom1Index, b.atom2Index, HELD * STRETCHED * radii(b.atom1Index, b.atom2Index), 'below');
  }
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      if (neighbours[i].has(j)) continue;
      if ([...neighbours[i]].some((k) => neighbours[j].has(k))) continue;
      wall(i, j, newBondLimit(atoms[i].element, atoms[j].element) / HELD, 'above');
    }
  }
  return { energy, gradient };
}

/** `molecule` marked with a verdict's changes — its stretched bonds, and its
 *  formed pairs as contacts — and nothing else: a mark left by an earlier
 *  structure is cleared. */
export function markBondingChanges(
  molecule: Molecule,
  changes: Pick<BondingVerdict, 'stretched' | 'formedPairs'>,
): Molecule {
  const stretched = new Set(changes.stretched);
  const { formedContacts: _, ...rest } = molecule;
  return {
    ...rest,
    bonds: molecule.bonds.map((b, i) => {
      const { stretched: _s, ...bond } = b;
      return stretched.has(i) ? { ...bond, stretched: true } : bond;
    }),
    ...(changes.formedPairs.length > 0 ? { formedContacts: changes.formedPairs } : {}),
  };
}
