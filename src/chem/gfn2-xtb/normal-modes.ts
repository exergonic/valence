/**
 * Normal modes from a Cartesian Hessian: how a molecule vibrates at the bottom
 * of its well. A stiffer bond between lighter atoms vibrates faster — C≡O
 * above C=O above C–O, O–H near 3700 cm⁻¹ — which is the bond order and the
 * reduced mass, read off a frequency.
 *
 * The recipe is the textbook one. Weight the Hessian by 1/√(mᵢmⱼ), so its
 * eigenvalues are ω²; project out the three translations and three rotations
 * (two for a linear molecule), which cost no energy and would otherwise mix
 * with the softest torsions; diagonalize; convert to wavenumbers. What is left
 * is 3N − 6 (3N − 5) vibrations. Harmonic and at GFN2-xTB's minimum: the
 * numbers are GFN2's, typically within 5–10 % of experiment, with no
 * anharmonic correction.
 */
import { jacobiSymmetric } from '../../utils/eigen';
import { ATOMIC_MASS } from '../assign-mass';

/** √(Eh / (bohr² · u)) in cm⁻¹: ω = this × √λ for λ in Eh/(bohr² u). */
const WAVENUMBER_PER_ROOT_HESSIAN = 5140.4871;

export interface NormalMode {
  /** cm⁻¹; negative for an imaginary mode (a saddle's downhill direction). */
  frequency: number;
  /** Per atom, the Cartesian displacement (Å-scaled direction), the largest
   *  atom's displacement 1 — what the animation scales. */
  displacements: Array<[number, number, number]>;
}

/**
 * The vibrations of a molecule from its Hessian (Eh/bohr², rows atom-major:
 * x₀ y₀ z₀ x₁ …) at positions in Å. Lowest first.
 */
export function normalModes(
  atoms: Array<{ element: string; x: number; y: number; z: number }>,
  hessian: number[][],
): NormalMode[] {
  const n = atoms.length;
  const dim = 3 * n;
  const masses = atoms.map((a) => ATOMIC_MASS[a.element] ?? 0);
  if (masses.some((m) => m <= 0) || hessian.length !== dim) return [];

  // mass-weighted Hessian
  const weighted: number[][] = [];
  for (let i = 0; i < dim; i++) {
    const row: number[] = [];
    for (let j = 0; j < dim; j++) row.push(hessian[i][j] / Math.sqrt(masses[Math.floor(i / 3)] * masses[Math.floor(j / 3)]));
    weighted.push(row);
  }

  // the rigid-body directions in mass-weighted coordinates: translations
  // √m e_k, rotations √m (e_k × r) about the centre of mass; orthonormalized,
  // and a rotation about a linear molecule's own axis drops out as zero
  const total = masses.reduce((a, b) => a + b, 0);
  const com = [0, 1, 2].map((k) => atoms.reduce((s, a, i) => s + masses[i] * [a.x, a.y, a.z][k], 0) / total);
  const rigid: number[][] = [];
  for (let k = 0; k < 3; k++) {
    rigid.push(atoms.flatMap((_, i) => [0, 1, 2].map((c) => (c === k ? Math.sqrt(masses[i]) : 0))));
  }
  for (let k = 0; k < 3; k++) {
    rigid.push(atoms.flatMap((a, i) => {
      const r = [a.x - com[0], a.y - com[1], a.z - com[2]];
      const e = [0, 0, 0];
      e[k] = 1;
      const cross = [e[1] * r[2] - e[2] * r[1], e[2] * r[0] - e[0] * r[2], e[0] * r[1] - e[1] * r[0]];
      return cross.map((c) => c * Math.sqrt(masses[i]));
    }));
  }
  const basis: number[][] = [];
  for (const v of rigid) {
    const w = [...v];
    for (const b of basis) {
      const d = w.reduce((s, x, i) => s + x * b[i], 0);
      for (let i = 0; i < dim; i++) w[i] -= d * b[i];
    }
    const norm = Math.hypot(...w);
    if (norm > 1e-6) basis.push(w.map((x) => x / norm));
  }

  // P H P with the projector P = 1 − Σ b bᵀ: the rigid directions become
  // exact zeros, and no vibration leaks into them
  const projector = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => (i === j ? 1 : 0) - basis.reduce((s, b) => s + b[i] * b[j], 0)));
  const multiply = (a: number[][], b: number[][]) => a.map((row) =>
    Array.from({ length: dim }, (_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));
  const { values, vectors } = jacobiSymmetric(multiply(multiply(projector, weighted), projector));

  const modes: NormalMode[] = [];
  for (let m = 0; m < dim; m++) {
    const q = vectors.map((row) => row[m]);
    // skip the rigid-body solutions: they live in the projected-out space
    const rigidShare = basis.reduce((s, b) => s + b.reduce((t, x, i) => t + x * q[i], 0) ** 2, 0);
    if (rigidShare > 0.5) continue;
    const lambda = values[m];
    const frequency = Math.sign(lambda) * WAVENUMBER_PER_ROOT_HESSIAN * Math.sqrt(Math.abs(lambda));
    const displacements = atoms.map((_, a) =>
      [0, 1, 2].map((c) => q[3 * a + c] / Math.sqrt(masses[a])) as [number, number, number]);
    const largest = Math.max(...displacements.map((d) => Math.hypot(d[0], d[1], d[2]))) || 1;
    modes.push({ frequency, displacements: displacements.map((d) => d.map((x) => x / largest) as [number, number, number]) });
  }
  return modes.sort((a, b) => a.frequency - b.frequency);
}
