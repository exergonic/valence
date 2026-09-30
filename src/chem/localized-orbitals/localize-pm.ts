/**
 * Pipek–Mezey localization of the extended-Hückel occupied MOs.
 *
 * Localization is a unitary transform of the occupied space: it cannot create
 * physics the density lacks, but it turns the delocalized canonical MOs into
 * the σ bonds and lone pairs a chemist draws. The objective PM maximizes is
 * the sum of squared Mulliken atomic populations,
 *
 *   L = Σ_A Σ_i n_A(φ_i)²
 *
 * (Pipek & Mezey, J. Chem. Phys. 90, 4916 (1989)) — "make every orbital as
 * concentrated on as few atoms as possible". The 2×2 Jacobi angle that
 * maximizes a pair's contribution follows because n_A is exactly quadratic in
 * the rotation: with n_i(θ) = m + d·cos2θ + w·sin2θ and n_j(θ) = m − d·cos2θ
 * − w·sin2θ, each atom contributes 2m² + 2(d·cos2θ + w·sin2θ)², so the pair's
 * objective is one 4θ sinusoid and
 *
 *   θ = ¼ · atan2(Σ_A d_A w_A, ½ · Σ_A (d_A² − w_A²))
 *
 * with d_A = (n_A(i) − n_A(j))/2 and w_A = n_A(i,j) — the same angle
 * `avo_ibo` uses, written with the overlap-weighted populations the
 * non-orthogonal extended-Hückel basis requires (mulliken-populations.ts).
 *
 * **Where PM is blind, the Hamiltonian chooses.** A pair that is equivalent
 * by symmetry — an exactly 50/50 two-centre bond's σ/π partners, two lone
 * pairs of the same symmetry — leaves L unchanged under any rotation of the
 * pair. PM's angle is then degenerate (the sinusoid is flat) and the outcome
 * would be whatever arbitrary mixture the start produced. Inside such a pair
 * H is NOT flat: the 2×2 block ⟨φ_i|H|φ_j⟩ is off-diagonal, and diagonalizing
 * it lands on the orbitals a chemist expects (σ and π rather than two
 * equivalent "banana" bonds; the s-rich lone pair below the p-rich one). That
 * is `avo_ibo`'s degeneracy resolution.
 *
 * The rule here is one step, not two: a pair takes H's diagonalizing angle
 * only if that angle is *also* a PM optimum to within `FLAT_TOLERANCE` — i.e.
 * only inside the region PM cannot distinguish. Anywhere PM has an opinion,
 * PM's angle stands and H cannot undo the localization.
 *
 * What H cannot do is order an EXACTLY degenerate set: H restricted to it is
 * ε·I to machine precision, every member has the same expectation and the
 * angle is undefined. Nothing can, and nothing needs to — the members are
 * symmetry-equivalent, same class, same energy. Measured, with the numbers,
 * in NOTES.md.
 *
 * The occupied block only: valence-virtual (σ*, π*) localization needs the
 * virtual space projected onto the minimal basis (Derricotte & Evangelista,
 * J. Chem. Theory Comput. 13, 2561 (2017)), which this cut skips — the
 * teaching need is the occupied picture.
 *
 * Refusals come first, per the house ladder: an open shell (an odd electron
 * count, or a degenerate set the count would only partly fill, e.g. O₂'s π*)
 * gets no localized orbitals rather than a wrong set.
 */
import type { Molecule } from '../../mol-parser';
import type { ExtendedHuckelResult } from '../extended-huckel/solve';
import { closedShellOccupations } from '../extended-huckel/solve';
import { atomicPopulations, crossPopulations } from './mulliken-populations';

/** A sweep stops when no pair rotates by more than this (radians). */
export const PM_TOLERANCE = 1e-12;

/** Bound on the Jacobi sweeps — the pair count is tiny and convergence is
 *  quadratic, so this guards a pathological start rather than budgeting. */
export const PM_MAX_SWEEPS = 200;

/**
 * Relative |L(0) − L(45°)| below which PM is treated as having no opinion
 * about a pair. `avo_ibo`'s value: the manifold has to be flat to the last few
 * digits before the Hamiltonian is allowed to choose the mixture.
 */
export const FLAT_TOLERANCE = 1e-6;

/** |H_ij| relative to the diagonal below which a pair is already
 *  H-diagonal and there is nothing for H to say. */
export const H_COUPLING_TOLERANCE = 1e-8;

/** The Jacobi angle that zeroes the off-diagonal of [[p, q], [q, r]]. */
function diagonalizingAngle(p: number, q: number, r: number): number {
  return 0.5 * Math.atan2(2 * q, p - r);
}

/** cᵗ M c for a symmetric matrix M in the AO basis. */
function quadratic(M: number[][], c: number[]): number {
  let sum = 0;
  for (let m = 0; m < c.length; m++) {
    const cm = c[m];
    if (cm === 0) continue;
    const row = M[m];
    for (let k = 0; k < c.length; k++) sum += cm * row[k] * c[k];
  }
  return sum;
}

/** c_iᵗ M c_j (i ≠ j) — the coupling between two orbitals. */
function crossQuadratic(M: number[][], i: number[], j: number[]): number {
  let sum = 0;
  for (let m = 0; m < i.length; m++) {
    const cm = i[m];
    if (cm === 0) continue;
    const row = M[m];
    for (let k = 0; k < j.length; k++) sum += cm * row[k] * j[k];
  }
  return sum;
}

/** Σ_A (n_A(i)² + n_A(j)²) — the pair's share of the PM objective. */
function pairObjective(
  i: number[],
  j: number[],
  overlap: number[][],
  basis: ExtendedHuckelResult['basis'],
  atomCount: number,
): number {
  const ni = atomicPopulations(i, overlap, basis, atomCount);
  const nj = atomicPopulations(j, overlap, basis, atomCount);
  let sum = 0;
  for (let a = 0; a < atomCount; a++) sum += ni[a] * ni[a] + nj[a] * nj[a];
  return sum;
}

/** The pair's objective after rotating it by θ. */
function pairObjectiveAt(
  i: number[],
  j: number[],
  theta: number,
  overlap: number[][],
  basis: ExtendedHuckelResult['basis'],
  atomCount: number,
): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const mi = i.map((v, m) => c * v + s * j[m]);
  const mj = i.map((v, m) => -s * v + c * j[m]);
  return pairObjective(mi, mj, overlap, basis, atomCount);
}

/** The PM angle that maximizes the pair's contribution to L. */
export function pipekMezeyAngle(
  i: number[],
  j: number[],
  overlap: number[][],
  basis: ExtendedHuckelResult['basis'],
  atomCount: number,
): number {
  const ni = atomicPopulations(i, overlap, basis, atomCount);
  const nj = atomicPopulations(j, overlap, basis, atomCount);
  // The row-wise Mulliken convention makes n_A(i,j) ≠ n_A(j,i), and the
  // rotation's cross term carries their MEAN — the symmetric part is what the
  // objective sees (their difference would only move charge between atoms,
  // which the normalization Σ_A n_A = 1 forbids). Using the one-sided value
  // here descends instead of ascends.
  const nij = crossPopulations(i, j, overlap, basis, atomCount);
  const nji = crossPopulations(j, i, overlap, basis, atomCount);
  let D = 0;
  let W = 0;
  for (let a = 0; a < atomCount; a++) {
    const d = (ni[a] - nj[a]) / 2;
    const cross = (nij[a] + nji[a]) / 2;
    D += d * d - cross * cross;
    W += d * cross;
  }
  let theta = 0.25 * Math.atan2(W, D / 2);
  // θ and θ ± π/2 describe the same pair (the columns swap and change sign)
  // and leave the objective identical, so keep the small one: a sweep then
  // cannot flip an orbital's sign or reshuffle the list on a flat manifold.
  if (theta > Math.PI / 4) theta -= Math.PI / 2;
  else if (theta <= -Math.PI / 4) theta += Math.PI / 2;
  return theta;
}

/** Rotate orbitals i and j of the row-major coefficient matrix
 *  (`rows[orbital][ao]`), which is how `result.coefficients` is laid out. */
function rotate(rows: number[][], i: number, j: number, theta: number): void {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const ci = rows[i].slice();
  const cj = rows[j].slice();
  for (let m = 0; m < ci.length; m++) {
    rows[i][m] = c * ci[m] + s * cj[m];
    rows[j][m] = -s * ci[m] + c * cj[m];
  }
}

/**
 * Hand the Hamiltonian the pairs PM cannot distinguish.
 *
 * A pair is "flat" when rotating it does not move the PM objective — an
 * exactly 50/50 two-centre bond's σ/π partners, two lone pairs of the same
 * symmetry. There L has no opinion and the orbitals are whatever arbitrary
 * mixture the sweeps left; H does have an opinion (its 2×2 block is
 * off-diagonal), and diagonalizing it lands on the orbitals a chemist
 * expects. The flat test is `avo_ibo`'s: relative |L(0) − L(45°)|.
 *
 * Only flat pairs are touched, so this pass cannot move the localization: any
 * rotation it applies is, to the tolerance, objective-preserving.
 */
function resolveFlatPairs(
  rows: number[][],
  overlap: number[][],
  hamiltonian: number[][],
  basis: ExtendedHuckelResult['basis'],
  atomCount: number,
): void {
  const occupied = rows.length;
  for (let pass = 0; pass < 8; pass++) {
    let rotated = 0;
    for (let i = 0; i < occupied; i++) {
      for (let j = i + 1; j < occupied; j++) {
        const flat = pairObjective(rows[i], rows[j], overlap, basis, atomCount);
        const mixed = pairObjectiveAt(rows[i], rows[j], Math.PI / 4, overlap, basis, atomCount);
        if (Math.abs(flat - mixed) > FLAT_TOLERANCE * Math.abs(flat)) continue;

        const p = quadratic(hamiltonian, rows[i]);
        const r = quadratic(hamiltonian, rows[j]);
        const q = crossQuadratic(hamiltonian, rows[i], rows[j]);
        if (Math.abs(q) <= H_COUPLING_TOLERANCE * Math.max(Math.abs(p), Math.abs(r))) continue;
        rotate(rows, i, j, diagonalizingAngle(p, q, r));
        rotated++;
      }
    }
    if (rotated === 0) break;
  }
}

/** The localized occupied block and the localized valence-virtual (empty)
 *  block, in the solver's coefficient layout (orbital-major rows). */
export interface LocalizedSets {
  occupied: number[][];
  virtual: number[][];
}

/**
 * Localize the occupied AND valence-virtual extended-Hückel MOs. Returns the
 * coefficients in the same MO-major order and calculation frame as
 * `result.coefficients`, so the existing MO renderers draw them unchanged.
 *
 * **Why the virtual block is localizable as it stands.** Derricotte &
 * Evangelista build valence-virtual orbitals by projecting the (huge) virtual
 * space of a full basis onto the minimal one by SVD and keeping the
 * n_min − n_occ directions the density can reach. Extended Hückel's basis IS
 * minimal, so there is nothing to screen: the virtual space is already
 * n_min − n_occ dimensional and already spans that complement, and the SVD is
 * a square orthogonal matrix whose singular values are all 1 — degenerate, so
 * it selects nothing. What is left is the localization itself, on the
 * canonical virtual block. That is what this does, and it is what the app
 * labels (not "VVO/IAO", which would imply a screening step that does not
 * exist here).
 *
 * The virtuals are the rough part of an EH calculation and the labels say so,
 * but the *symmetry* of a localized virtual is reliable: ethene's π* comes
 * out C–C π, benzene's three come out ring π*, and every C–H σ* sits on its
 * own bond. That is what makes them worth drawing beside an occupied partner.
 *
 * Null when there are no localized orbitals to give: an open shell (refused by
 * `closedShellOccupations` — the occupied set is not even known) or no
 * occupied levels.
 */
export function localizeOrbitals(
  molecule: Molecule,
  result: ExtendedHuckelResult,
): LocalizedSets | null {
  const occupations = closedShellOccupations(
    result.electronCount, result.basis.length, result.energies, molecule.multiplicity ?? 1,
  );
  if (!occupations) return null;
  const occupied = occupations.filter((o) => o > 0).length;
  if (occupied === 0) return null;

  const { overlap, hamiltonian, basis } = result;
  const atomCount = molecule.atoms.length;
  const block = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => result.coefficients[from + k].slice());

  const occupiedRows = block(0, occupied);
  const virtualRows = block(occupied, result.basis.length);
  localizeBlock(occupiedRows, overlap, hamiltonian, basis, atomCount);
  localizeBlock(virtualRows, overlap, hamiltonian, basis, atomCount);
  return { occupied: occupiedRows, virtual: virtualRows };
}

/**
 * PM-localize one block of S-orthonormal orbitals, in place: PM's own sweeps to
 * convergence, then the Hamiltonian's pass over whatever pairs PM left flat,
 * then a stable sign per orbital.
 */
function localizeBlock(
  rows: number[][],
  overlap: number[][],
  hamiltonian: number[][],
  basis: ExtendedHuckelResult['basis'],
  atomCount: number,
): void {
  const occupied = rows.length;
  if (occupied < 2) {
    fixSigns(rows);
    return;
  }

  // PM's own sweeps, and only PM's: the Hamiltonian is deliberately NOT
  // consulted here. It was, and a free rotation mid-sweep redraws the
  // landscape for every later pair, after which coordinate ascent settles in a
  // different and worse local maximum (measured: water's objective fell from
  // 3.2123 to a lone-pair-only 2.7). H gets its pass after the sweeps.
  for (let sweep = 0; sweep < PM_MAX_SWEEPS; sweep++) {
    let largest = 0;
    for (let i = 0; i < occupied; i++) {
      for (let j = i + 1; j < occupied; j++) {
        const theta = pipekMezeyAngle(rows[i], rows[j], overlap, basis, atomCount);
        if (Math.abs(theta) > PM_TOLERANCE) {
          rotate(rows, i, j, theta);
          largest = Math.max(largest, Math.abs(theta));
        }
      }
    }
    if (largest < PM_TOLERANCE) break;
  }

  // Where PM is flat, the Hamiltonian chooses the mixture — σ over π, the
  // s-rich lone pair below the p-rich one. Runs after the sweeps, never
  // inside them: an objective-preserving rotation mid-sweep redraws the
  // landscape for every later pair and coordinate ascent then settles
  // somewhere worse.
  resolveFlatPairs(rows, overlap, hamiltonian, basis, atomCount);

  fixSigns(rows);
}

/** Each orbital's largest coefficient made positive: a sign is as arbitrary as
 *  a mixture, and a stable one keeps the drawn phase colours and the list
 *  order from moving between runs. */
function fixSigns(rows: number[][]): void {
  for (const row of rows) {
    let largest = 0;
    for (const c of row) if (Math.abs(c) > Math.abs(largest)) largest = c;
    if (largest < 0) for (let m = 0; m < row.length; m++) row[m] = -row[m];
  }
}
