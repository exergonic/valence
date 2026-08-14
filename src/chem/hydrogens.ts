import type { Molecule } from '../mol-parser';
import { idealHybridVectors } from '../utils/ideal-vectors';
import { vecNormalize, crossProduct, rotateRodrigues } from '../utils/vec3';

// σ bonds an element usually forms in neutral compounds (octet rule) —
// what's left over after counting bond orders gets filled with hydrogens.
// NOT the same as VALENCE_ELECTRONS (valence.ts): N, O, S form 3, 2, 2
// bonds here despite having 5, 6, 6 valence electrons.
const BOND_VALENCE: Record<string, number> = {
  H: 1,
  He: 0,
  Li: 1, Be: 2, B: 3,
  C: 4, N: 3, O: 2, F: 1,
  Na: 1, Mg: 2, Al: 3,
  Si: 4, P: 3, S: 2, Cl: 1,
  K: 1, Ca: 2, Ga: 3,
  Ge: 4, As: 3, Se: 2, Br: 1,
  Rb: 1, Sr: 2, In: 3,
  Sn: 4, Sb: 3, Te: 2, I: 1,
};

const BOND_LENGTH = 1.0;

/**
 * Place missing hydrogens using ideal VSEPR geometry.
 *
 * For tetrahedral centers (4 σ bonds total), the four ideal tetrahedral
 * vertices are rotated so the existing bonds align with their matching
 * vertices; the remaining vertices point to the H positions. This gives
 * a proper 3D starting geometry instead of the old planar 120° fallback.
 *
 * For other coordination numbers (linear, trigonal, etc.), the same
 * ideal-vector matching applies. When the existing bonds are degenerate
 * (collinear), the rotation is skipped and H's land on whatever ideal
 * vertices remain.
 */
export function fillMissingHydrogens(molecule: Molecule): Molecule {
  const atoms = [...molecule.atoms];
  const bonds = [...molecule.bonds];
  let nextIndex = atoms.length;
  let hAdded = 0;

  const bondOrderSum: number[] = new Array(atoms.length).fill(0);
  for (const bond of bonds) {
    bondOrderSum[bond.atom1Index] += bond.order;
    bondOrderSum[bond.atom2Index] += bond.order;
  }

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    const valence = BOND_VALENCE[atom.element];
    if (!valence) continue;

    const missing = Math.max(0, valence - bondOrderSum[i]);
    if (missing === 0) continue;

    // Existing bond directions from this atom.
    const existingDirs: [number, number, number][] = [];
    for (const bond of bonds) {
      const ni = bond.atom1Index === i ? bond.atom2Index :
                 bond.atom2Index === i ? bond.atom1Index : -1;
      if (ni >= 0) {
        const n = atoms[ni];
        existingDirs.push([n.x - atom.x, n.y - atom.y, n.z - atom.z]);
      }
    }

    const totalCoordination = existingDirs.length + missing;
    const idealDirs = idealHybridVectors(totalCoordination);

    // Match each existing bond to its closest ideal vertex, then use
    // the remaining vertices for H placement.
    const used = new Set<number>();
    for (const dir of existingDirs) {
      const d = vecNormalize(dir);
      let bestDot = -Infinity;
      let bestIdx = -1;
      for (let k = 0; k < idealDirs.length; k++) {
        if (used.has(k)) continue;
        const dot = d[0] * idealDirs[k][0] + d[1] * idealDirs[k][1] + d[2] * idealDirs[k][2];
        if (dot > bestDot) {
          bestDot = dot;
          bestIdx = k;
        }
      }
      if (bestIdx >= 0) used.add(bestIdx);
    }

    const hVerts = idealDirs.filter((_, k) => !used.has(k));

    // If the existing bonds span a non-degenerate axis, rotate the ideal
    // frame so the first existing bond aligns with its matched vertex.
    // This orients the H's in 3D rather than leaving them in the xy-plane.
    let rotationAxis: [number, number, number] | null = null;
    let cosA = 1, sinA = 0;
    if (existingDirs.length > 0 && hVerts.length > 0) {
      const d = vecNormalize(existingDirs[0]);
      const target = idealDirs[used.size > 0 ? [...used][0] : 0];
      const dot = d[0] * target[0] + d[1] * target[1] + d[2] * target[2];
      if (dot < 0.999 && dot > -0.999) {
        rotationAxis = vecNormalize(crossProduct(target, d));
        cosA = dot;
        sinA = Math.sqrt(1 - dot * dot);
      }
    }

    for (let j = 0; j < missing; j++) {
      let v = hVerts[j % hVerts.length];
      if (rotationAxis && (existingDirs.length > 0)) {
        v = rotateRodrigues(v, rotationAxis, cosA, sinA);
      }
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      const ux = v[0] / len, uy = v[1] / len, uz = v[2] / len;

      atoms.push({
        element: 'H',
        x: atom.x + BOND_LENGTH * ux,
        y: atom.y + BOND_LENGTH * uy,
        z: atom.z + BOND_LENGTH * uz,
      });

      bonds.push({
        atom1Index: i,
        atom2Index: nextIndex + hAdded,
        order: 1,
      });

      hAdded++;
    }
  }

  return { atoms, bonds };
}
