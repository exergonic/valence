/**
 * Canonical orbitals for degenerate sets.
 *
 * The solver returns *an* orthonormal basis of each degenerate subspace, and
 * any orthogonal combination of those orbitals describes the same physics.
 * That is correct and useless for looking at: two programs pick different
 * mixtures, so "MO 12" in one need not look like "MO 12" in another — which
 * is exactly what was reported when a degenerate pair was compared against
 * WebMO's (one representative looked C–C bonding, the other antibonding).
 *
 * This rotates each degenerate set into the combination a chemist expects, by
 * diagonalizing the second-moment operators x², then y², then z² within the
 * set, refining any remaining degeneracy in that order. Those operators are
 * symmetry operators whenever the molecule has symmetry — x² commutes with a
 * mirror plane perpendicular to x, so it does not mix the symmetry-adapted
 * partners and its eigenvalues separate them — and they are perfectly
 * well-defined when it has none, which is why no symmetry detection is
 * needed. The result for a set of atomic p orbitals is px, py, pz; for
 * benzene's e1g π pair it is the textbook pair with a nodal plane each.
 *
 * The rotation is internal to the subspace, so energies, occupations and the
 * space spanned are untouched. Each orbital's overall sign is fixed too (the
 * largest coefficient is made positive), because a sign is as arbitrary as a
 * mixture and a stable one keeps the drawn phase colours stable as well.
 *
 * Coordinates are the calculation frame's (the molecule's principal axes), so
 * "x²" means the same thing here as it does in the basis.
 */
import type { Molecule } from '../../mol-parser';
import { jacobiSymmetric } from '../../utils/eigen';
import type { BasisFunction } from './assign-basis';

/** Orbitals within this energy are one degenerate set. A symmetric molecule's
 *  pair splits by ~1e-4 eV in a 4-decimal geometry, so this is well above the
 *  numerical noise and far below any chemical gap. */
export const DEGENERATE_TOLERANCE_EV = 0.005;

/** Eigenvalues of the second-moment operator this close are still degenerate,
 *  so the next operator gets a turn. */
const SPLIT_TOLERANCE = 1e-9;

export function canonicalizeDegenerateSets(
  basis: BasisFunction[],
  coefficients: number[][],
  energies: number[],
  atoms: Molecule['atoms'],
): number[][] {
  const orbitals = coefficients.map((mo) => [...mo]);

  // the second-moment operators, in the order they are applied: each is
  // diagonal in the AO basis (an AO sits on one atom)
  const operators = [
    (ao: number) => atoms[basis[ao].atomIndex].x ** 2,
    (ao: number) => atoms[basis[ao].atomIndex].y ** 2,
    (ao: number) => atoms[basis[ao].atomIndex].z ** 2,
  ];

  const refine = (from: number, to: number, opIndex: number): void => {
    if (to - from <= 1 || opIndex >= operators.length) return;
    const size = to - from;
    const operator = operators[opIndex];

    // the operator's matrix inside the subspace
    const matrix: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let sum = 0;
        for (let ao = 0; ao < basis.length; ao++) sum += orbitals[from + i][ao] * operator(ao) * orbitals[from + j][ao];
        matrix[i][j] = sum;
      }
    }

    const { values, vectors } = jacobiSymmetric(matrix);
    // rotate: the k-th new orbital is the k-th eigenvector of the operator
    const rotated: number[][] = Array.from({ length: size }, () => new Array(basis.length).fill(0));
    for (let k = 0; k < size; k++) {
      for (let i = 0; i < size; i++) {
        if (Math.abs(vectors[i][k]) < 1e-14) continue;
        for (let ao = 0; ao < basis.length; ao++) rotated[k][ao] += vectors[i][k] * orbitals[from + i][ao];
      }
    }
    for (let k = 0; k < size; k++) orbitals[from + k] = rotated[k];

    // anything the operator could not separate goes to the next one
    let a = 0;
    while (a < size) {
      let b = a + 1;
      while (b < size && Math.abs(values[b] - values[a]) < SPLIT_TOLERANCE) b++;
      if (b - a > 1) refine(from + a, from + b, opIndex + 1);
      a = b;
    }
  };

  let i = 0;
  while (i < energies.length) {
    let j = i + 1;
    while (j < energies.length && Math.abs(energies[j] - energies[i]) < DEGENERATE_TOLERANCE_EV) j++;
    if (j - i > 1) refine(i, j, 0);
    i = j;
  }

  // a sign is arbitrary too: make each orbital's largest coefficient positive
  for (const mo of orbitals) {
    let largest = 0;
    for (let ao = 1; ao < mo.length; ao++) if (Math.abs(mo[ao]) > Math.abs(mo[largest])) largest = ao;
    if (mo[largest] < 0) for (let ao = 0; ao < mo.length; ao++) mo[ao] = -mo[ao];
  }

  return orbitals;
}
