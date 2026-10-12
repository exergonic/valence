/**
 * CM5 charges: Hirshfeld charges plus a correction for each pair of bonded
 * atoms, fitted so the charges reproduce dipole moments. Marenich, Jerome,
 * Cramer & Truhlar, J. Chem. Theory Comput. 8, 527 (2012).
 *
 * Hirshfeld ("stockholder") partitioning shares the molecule's density at
 * every point among the atoms in proportion to what each free, spherical atom
 * would have put there: w_A(r) = ρ_A⁰(r) / Σ_B ρ_B⁰(r). It is the real-space
 * answer to "how many electrons are on this atom?", where Mulliken's is the
 * basis-function answer — and it is known to come out too small, which is
 * what the CM5 correction repairs.
 *
 * Here the density is GFN2-xTB's own and the free atoms are GFN2 atoms (the
 * worker computes and spherically averages them), so the partition is
 * consistent with the model. CM5's parameters were fitted on DFT Hirshfeld
 * charges; applying them to a semiempirical density is the same liberty xtb
 * takes when it adds the CM5 correction to its GFN1 charges.
 */

import { atomicNumber } from '../elements';
import { fibonacciSphere } from './esp-fit';

// --- The CM5 correction -------------------------------------------------------
// Parameters as published (and as xtb's src/solv/cm5.f90 carries them), by
// atomic number from H. D_Z per element; the pair term between two different
// elements is D_k − D_k', except for the six pairs fitted on their own.

/** α of the bond-order-like decay, Å⁻¹. */
const CM5_ALPHA = 2.474;

/** Atomic radii (Å), Mantina, Valero, Cramer & Truhlar (CRC Handbook, 91st ed.). */
const CM5_RADII = [
  0.32, 0.37, 1.30, 0.99, 0.84, 0.75, 0.71, 0.64, 0.60, 0.62,
  1.60, 1.40, 1.24, 1.14, 1.09, 1.04, 1.00, 1.01, 2.00, 1.74,
  1.59, 1.48, 1.44, 1.30, 1.29, 1.24, 1.18, 1.17, 1.22, 1.20,
  1.23, 1.20, 1.20, 1.18, 1.17, 1.16, 2.15, 1.90, 1.76, 1.64,
  1.56, 1.46, 1.38, 1.36, 1.34, 1.30, 1.36, 1.40, 1.42, 1.40,
  1.40, 1.37, 1.36, 1.36, 2.38, 2.06, 1.94, 1.84, 1.90, 1.88,
  1.86, 1.85, 1.83, 1.82, 1.81, 1.80, 1.79, 1.77, 1.77, 1.78,
  1.74, 1.64, 1.58, 1.50, 1.41, 1.36, 1.32, 1.30, 1.30, 1.32,
  1.44, 1.45, 1.50, 1.42, 1.48, 1.46,
];

/** D_Z, e. */
const CM5_D = [
  0.0056, -0.1543, 0.0000, 0.0333, -0.1030, -0.0446, -0.1072, -0.0802, -0.0629, -0.1088,
  0.0184, 0.0000, -0.0726, -0.0790, -0.0756, -0.0565, -0.0444, -0.0767, 0.0130, 0.0000,
  0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000,
  -0.0512, -0.0557, -0.0533, -0.0399, -0.0313, -0.0541, 0.0092, 0.0000, 0.0000, 0.0000,
  0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, -0.0361, -0.0393,
  -0.0376, -0.0281, -0.0220, -0.0381, 0.0065, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000,
  0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000,
  0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000,
  -0.0255, -0.0277, -0.0265, -0.0198, -0.0155, -0.0269,
];

/** The six pairs CM5 fitted directly: T for (lighter, heavier), by Z. */
const CM5_PAIRS: Record<string, number> = {
  '1-6': 0.0502, '1-7': 0.1747, '1-8': 0.1671, '6-7': 0.0556, '6-8': 0.0234, '7-8': -0.0346,
};

/** T_kk': what atom k gains from its pair with k'. */
function pairTerm(zk: number, zl: number): number {
  if (zk === zl) return 0;
  const fitted = CM5_PAIRS[zk < zl ? `${zk}-${zl}` : `${zl}-${zk}`];
  if (fitted !== undefined) return zk < zl ? fitted : -fitted;
  return CM5_D[zk - 1] - CM5_D[zl - 1];
}

/** True when CM5 has parameters for every element (H–Rn, GFN2's range). */
export function cm5Covers(atoms: Array<{ element: string }>): boolean {
  return atoms.every((a) => {
    const z = atomicNumber(a.element);
    return z >= 1 && z <= CM5_D.length;
  });
}

/**
 * The CM5 correction per atom (e): Σ_k' T_kk' exp(−α(r_kk' − R_k − R_k')) —
 * each pair counted by how bonded it is, so the sum is a bonded-neighbour sum
 * in practice and adds up to zero over the molecule.
 */
export function cm5Corrections(atoms: Array<{ element: string; x: number; y: number; z: number }>): number[] {
  const z = atoms.map((a) => atomicNumber(a.element));
  const out = atoms.map(() => 0);
  for (let k = 0; k < atoms.length; k++) {
    for (let l = 0; l < k; l++) {
      if (z[k] === z[l]) continue;
      const r = Math.hypot(atoms[k].x - atoms[l].x, atoms[k].y - atoms[l].y, atoms[k].z - atoms[l].z);
      const bond = Math.exp(-CM5_ALPHA * (r - CM5_RADII[z[k] - 1] - CM5_RADII[z[l] - 1]));
      out[k] += bond * pairTerm(z[k], z[l]);
      out[l] += bond * pairTerm(z[l], z[k]);
    }
  }
  return out;
}

// --- Hirshfeld ----------------------------------------------------------------

/** A spherical free-atom density on an even radial grid: rho[i] at r = i·step
 *  (bohr, e/bohr³). */
export interface RadialDensity {
  step: number;
  rho: Float64Array;
}

export function radialDensityAt(atom: RadialDensity, r: number): number {
  const t = r / atom.step;
  const i = Math.floor(t);
  if (i >= atom.rho.length - 1) return 0;
  return atom.rho[i] + (t - i) * (atom.rho[i + 1] - atom.rho[i]);
}

/** Radial points per atom grid, the Mura–Knowles scale (bohr), and the
 *  angular points (golden-spiral, equal weights). */
const RADIAL_POINTS = 70;
const RADIAL_SCALE = 5.0;
const ANGULAR_POINTS = 302;

/**
 * Hirshfeld charges, q_A = ∫ w_A (ρ_pro − ρ): the promolecule's electrons on A
 * (exactly the free atom's, since w_A ρ_pro = ρ_A⁰) less the molecule's share,
 * integrated on a grid centred on A. Written as the difference density, the
 * quadrature errors in the two halves cancel. Positions in bohr; `density`
 * evaluates the molecule's density (e/bohr³) at a flat [x,y,z,…] list of
 * points. The quadrature residual of the total (the sum of the charges against
 * the net charge) comes back with them, and is shared out evenly.
 */
export function hirshfeldCharges(
  atoms: Array<{ x: number; y: number; z: number }>,
  free: RadialDensity[],
  density: (points: Float64Array) => ArrayLike<number>,
  netCharge: number,
): { charges: number[]; residual: number } {
  const directions = fibonacciSphere(ANGULAR_POINTS);
  const charges = atoms.map((centre, a) => {
    // Mura–Knowles: r = −α ln(1 − x³), x on a midpoint rule over (0, 1)
    const count = RADIAL_POINTS * ANGULAR_POINTS;
    const points = new Float64Array(3 * count);
    const weights = new Float64Array(count);
    let p = 0;
    for (let i = 0; i < RADIAL_POINTS; i++) {
      const x = (i + 0.5) / RADIAL_POINTS;
      const r = -RADIAL_SCALE * Math.log(1 - x ** 3);
      const dr = (3 * RADIAL_SCALE * x * x / (1 - x ** 3)) / RADIAL_POINTS;
      const shell = r * r * dr * (4 * Math.PI / ANGULAR_POINTS);
      for (const [ux, uy, uz] of directions) {
        points[3 * p] = centre.x + r * ux;
        points[3 * p + 1] = centre.y + r * uy;
        points[3 * p + 2] = centre.z + r * uz;
        weights[p++] = shell;
      }
    }
    const rho = density(points);
    let q = 0;
    for (let k = 0; k < count; k++) {
      const px = points[3 * k], py = points[3 * k + 1], pz = points[3 * k + 2];
      let promolecule = 0, own = 0;
      atoms.forEach((b, j) => {
        const value = radialDensityAt(free[j], Math.hypot(px - b.x, py - b.y, pz - b.z));
        promolecule += value;
        if (j === a) own = value;
      });
      if (promolecule < 1e-14) continue;
      q += weights[k] * (own / promolecule) * (promolecule - rho[k]);
    }
    return q;
  });
  const residual = charges.reduce((s, q) => s + q, 0) - netCharge;
  return { charges: charges.map((q) => q - residual / atoms.length), residual };
}
