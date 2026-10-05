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
 * set, refining any remaining degeneracy in that order. Each is a point-charge
 * version of the true operator: every AO is weighted by its *nucleus's* x², not
 * by ⟨χ|x²|χ⟩, and overlap is ignored. That keeps it diagonal in the AO basis
 * and cheap, and it is all the job needs, because the operators commute with
 * the molecule's mirror planes — x² is unchanged by a mirror perpendicular to
 * x — so they do not mix symmetry-adapted partners and their eigenvalues
 * separate them, with no symmetry detection at all. For benzene's e1g π pair
 * the result is the textbook pair with a nodal plane each.
 *
 * What the point-charge form cannot see is the shape of an orbital on one
 * centre: AOs on the same atom, or on atoms with the same x², y² and z², weigh
 * the same. A set carried only by such AOs (a lone atom's p shell) is left as
 * the solver returned it — still a correct orthonormal basis of the set. A set
 * with weight on neighbours is separated by where the neighbours sit, which is
 * why methane's t2 comes out near px/py/pz only because the frame of a
 * spherical top happens to put one C–H bond on an axis.
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

/**
 * The solver only rotates a set whose members are degenerate *exactly* — this
 * tight. Rotating two states with different energies would replace two
 * eigenstates with a mixture, which is a wrong picture even though the
 * energies and the density are untouched. Measured: on a geometry the
 * symmetrizer has snapped, a symmetry-required degeneracy is exact to ~1e-9
 * eV, while accidental near-degeneracies between different irreps sit at
 * 1e-3 eV and up (pyrrole has one at 4.3 meV) — so this separates them by
 * five orders of magnitude.
 */
export const CANONICAL_TOLERANCE_EV = 1e-5;

/** The tolerance the level diagram *groups* levels with, so two levels that
 *  look degenerate in a picture are labelled as such. A display choice, not a
 *  statement about the orbitals: the solver's own is CANONICAL_TOLERANCE_EV. */
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
    while (j < energies.length && Math.abs(energies[j] - energies[i]) < CANONICAL_TOLERANCE_EV) j++;
    if (j - i > 1) refine(i, j, 0);
    i = j;
  }

  // A sign is arbitrary too: make each orbital's largest coefficient positive.
  // Symmetry-equivalent atoms carry coefficients equal in size, so "largest" is
  // a tie decided by rounding noise; taking the FIRST AO within a hair of the
  // largest makes the choice — and the drawn phase colours — stable.
  for (const mo of orbitals) {
    let largestSize = 0;
    for (const c of mo) largestSize = Math.max(largestSize, Math.abs(c));
    const largest = mo.findIndex((c) => Math.abs(c) > largestSize - 1e-6);
    if (mo[largest] < 0) for (let ao = 0; ao < mo.length; ao++) mo[ao] = -mo[ao];
  }

  return orbitals;
}
