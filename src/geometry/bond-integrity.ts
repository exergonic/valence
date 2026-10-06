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
 * Two tests, on covalent radii (Cordero 2008, radii.ts):
 * - a drawn bond is broken when it is longer than 1.3 × the radii sum —
 *   generous, so a long hypervalent or metal bond (PCl5's axial 2.16 A against
 *   a 2.09 A sum) passes;
 * - an undrawn bond has formed when two atoms not bonded, and not sharing a
 *   neighbour, are closer than the radii sum + 0.4 A, the tolerance
 *   bond-perception programs use. H2 (0.74 A against 1.02 A) is caught; a
 *   1,3 pair is exempt because its distance is set by the angle between two
 *   real bonds — diborane's B···B, 1.77 A across the bridging hydrogens, is
 *   one, and so is every geminal H···H.
 */
import type { Molecule } from '../mol-parser';
import { getCovalentRadius } from '../chem/radii';

const STRETCHED = 1.3;
const NEW_BOND_TOLERANCE = 0.4; // Å

/** A sentence naming the first bond broken or formed, or null when the bonding
 *  is the sketch's. Atoms are numbered from 1, as in the export files. */
export function bondingChange(molecule: Molecule): string | null {
  const { atoms, bonds } = molecule;
  const label = (i: number) => `${atoms[i].element}${i + 1}`;
  const distance = (i: number, j: number) =>
    Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z);
  const radii = (i: number, j: number) => getCovalentRadius(atoms[i].element) + getCovalentRadius(atoms[j].element);

  const neighbours: Set<number>[] = atoms.map(() => new Set());
  for (const b of bonds) {
    neighbours[b.atom1Index].add(b.atom2Index);
    neighbours[b.atom2Index].add(b.atom1Index);
  }

  for (const b of bonds) {
    const r = distance(b.atom1Index, b.atom2Index);
    if (r > STRETCHED * radii(b.atom1Index, b.atom2Index)) {
      return `the ${label(b.atom1Index)}–${label(b.atom2Index)} bond came apart (${r.toFixed(2)} Å)`;
    }
  }

  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      if (neighbours[i].has(j)) continue;
      if ([...neighbours[i]].some((k) => neighbours[j].has(k))) continue;
      const r = distance(i, j);
      if (r < radii(i, j) + NEW_BOND_TOLERANCE) {
        return `${label(i)} and ${label(j)}, not bonded in the sketch, are ${r.toFixed(2)} Å apart — a new bond`;
      }
    }
  }
  return null;
}
