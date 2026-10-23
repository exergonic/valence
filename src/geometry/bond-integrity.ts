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

  const verdict: BondingVerdict = { stretched: [], partial: [], broken: null, formed: null };

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
  for (let i = 0; i < atoms.length && !verdict.formed; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      if (neighbours[i].has(j)) continue;
      if ([...neighbours[i]].some((k) => neighbours[j].has(k))) continue;
      const r = distance(i, j);
      if (r < radii(i, j) + NEW_BOND_TOLERANCE) {
        verdict.formed = `${label(i)} and ${label(j)}, not bonded in the sketch, are ${r.toFixed(2)} Å apart — a new bond`;
        break;
      }
    }
  }
  return verdict;
}

/** `molecule` with exactly the bonds at `indices` marked stretched — a mark
 *  left by an earlier structure is cleared. */
export function markStretchedBonds(molecule: Molecule, indices: number[]): Molecule {
  const stretched = new Set(indices);
  return {
    ...molecule,
    bonds: molecule.bonds.map((b, i) => {
      const { stretched: _, ...bond } = b;
      return stretched.has(i) ? { ...bond, stretched: true } : bond;
    }),
  };
}
