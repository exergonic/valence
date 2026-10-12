/**
 * ESP-fitted charges, Merz–Kollman style: the point charges, one per nucleus,
 * whose potential comes closest (least squares) to the molecule's own
 * electrostatic potential on shells around it, with the total held to the net
 * charge. Singh & Kollman, J. Comput. Chem. 5, 129 (1984); Besler, Merz &
 * Kollman, J. Comput. Chem. 11, 431 (1990).
 *
 * They are the answer to "which point charges best reproduce the ESP surface?"
 * — so of all the charge sets they come closest to adding up to it, and to the
 * dipole. The price is the buried atoms: a carbon wrapped in its hydrogens is
 * barely seen from outside, so its charge is poorly determined and swings with
 * conformation (what RESP's restraints were invented to tame). Unrestrained
 * here, as Merz–Kollman defined them.
 *
 * Units: Å for positions, the potential in e/Å (the app's ESP unit), charges in
 * e — V = Σ q/r closes without a constant.
 */

import { getVdwRadius } from '../radii';

/** Merz–Kollman radii (Å), Singh & Kollman / Besler, Merz & Kollman; other
 *  elements take their van der Waals radius, as programs without an MK radius
 *  for them do. */
const MK_RADII: Record<string, number> = {
  H: 1.20, C: 1.50, N: 1.50, O: 1.40, F: 1.35, P: 1.80, S: 1.75, Cl: 1.70,
};

/** The four shells, as multiples of each atom's radius — Merz–Kollman's. */
const MK_SHELLS = [1.4, 1.6, 1.8, 2.0];

/** Points per Å² on each shell. Merz–Kollman's default is 1; more makes the
 *  fit steadier at no real cost at these sizes. */
const POINTS_PER_SQUARE_ANGSTROM = 5;

export function mkRadius(element: string): number {
  return MK_RADII[element] ?? getVdwRadius(element);
}

/**
 * The fitting points: each atom's four shells, each point kept only when no
 * other atom's shell of the same scale encloses it — so the points sit outside
 * the molecule, where the potential is something a neighbour would feel.
 */
export function mkFitPoints(atoms: Array<{ element: string; x: number; y: number; z: number }>): number[] {
  const points: number[] = [];
  for (const scale of MK_SHELLS) {
    const radii = atoms.map((a) => mkRadius(a.element) * scale);
    atoms.forEach((a, i) => {
      const count = Math.max(12, Math.round(4 * Math.PI * radii[i] ** 2 * POINTS_PER_SQUARE_ANGSTROM));
      for (const [ux, uy, uz] of fibonacciSphere(count)) {
        const x = a.x + radii[i] * ux, y = a.y + radii[i] * uy, z = a.z + radii[i] * uz;
        const buried = atoms.some((b, j) => j !== i
          && (x - b.x) ** 2 + (y - b.y) ** 2 + (z - b.z) ** 2 < radii[j] ** 2);
        if (!buried) points.push(x, y, z);
      }
    });
  }
  return points;
}

/** Evenly spread unit vectors (the golden-angle spiral). */
export function fibonacciSphere(count: number): Array<[number, number, number]> {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Array<[number, number, number]> = [];
  for (let k = 0; k < count; k++) {
    const z = 1 - (2 * k + 1) / count;
    const r = Math.sqrt(1 - z * z);
    out.push([r * Math.cos(golden * k), r * Math.sin(golden * k), z]);
  }
  return out;
}

/**
 * The least-squares charges: minimise Σᵢ (Vᵢ − Σⱼ qⱼ/rᵢⱼ)² with Σⱼ qⱼ = net
 * charge, by a Lagrange multiplier — one (n+1)×(n+1) linear solve.
 */
export function fitChargesToPotential(
  atoms: Array<{ x: number; y: number; z: number }>,
  points: number[],
  potentials: number[],
  netCharge: number,
): number[] {
  const n = atoms.length;
  const A = Array.from({ length: n + 1 }, () => new Array<number>(n + 2).fill(0));
  for (let p = 0; p < potentials.length; p++) {
    const inverse = atoms.map((a) =>
      1 / Math.hypot(points[3 * p] - a.x, points[3 * p + 1] - a.y, points[3 * p + 2] - a.z));
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) A[j][k] += inverse[j] * inverse[k];
      A[j][n + 1] += inverse[j] * potentials[p];
    }
  }
  for (let j = 0; j < n; j++) { A[j][n] = 1; A[n][j] = 1; }
  A[n][n + 1] = netCharge;
  return solveAugmented(A).slice(0, n);
}

/** Gaussian elimination with partial pivoting on an augmented matrix. */
function solveAugmented(A: number[][]): number[] {
  const n = A.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let k = col; k <= n; k++) A[row][k] -= factor * A[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = A[row][n];
    for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
    x[row] = sum / A[row][row];
  }
  return x;
}
