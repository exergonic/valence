/**
 * Two-center overlap integrals between Slater-type orbitals.
 *
 * The standard Mulliken machinery, the same one YAeHMOP's `abfns.f` /
 * `lovlap.f` implement and the reason our numbers can be pinned against its
 * output: the radial part of every (n₁l₁, n₂l₂, m) pair is a finite sum over
 * the auxiliary functions
 *
 *   A_n(ρ) = ∫₁^∞ x^(n−1) e^(−ρx) dx        ρ = (ζ₁+ζ₂)R/2
 *   B_n(ρ) = ∫₋₁^1 x^(n−1) e^(−ρx) dx       ρ = (ζ₁−ζ₂)R/2
 *
 * with the angular part left to the caller (σ/π/δ components rotated onto
 * the molecular axes). Indices match the Fortran convention: A₁ is the
 * zeroth moment.
 *
 * Reference: Mulliken, Rieke, Orloff & Orloff, J. Chem. Phys. 17, 1248
 * (1949); the A/B recurrence and the binomial sum follow YAeHMOP
 * (G. Landrum, bind 3.1.0b2, `abfns.f` / `lovlap.f`), whose output this
 * module is tested against.
 */
import type { Molecule } from '../../mol-parser';
import type { BasisFunction } from './assign-basis';

/** A(1..n) and B(1..n) as above. `maxIndex` must cover n₁+n₂+1. */
export function abFunctions(zeta1: number, zeta2: number, R: number, maxIndex: number): { A: number[]; B: number[] } {
  const rho1 = 0.5 * (zeta1 + zeta2) * R;
  const rho2 = 0.5 * (zeta1 - zeta2) * R;

  const A = new Array<number>(maxIndex + 1).fill(0);
  const B = new Array<number>(maxIndex + 1).fill(0);
  if (Math.abs(rho1) > 165 || Math.abs(rho2) > 165) return { A, B }; // e^-ρ underflows: no overlap

  const e1 = Math.exp(-rho1);
  A[1] = e1 / rho1;
  for (let n = 2; n <= maxIndex; n++) A[n] = ((n - 1) * A[n - 1] + e1) / rho1;

  if (rho2 === 0) {
    // B_n(0) = (1 − (−1)^n)/n
    for (let n = 1; n <= maxIndex; n++) B[n] = n % 2 === 1 ? 2 / n : 0;
    return { A, B };
  }

  // sinh and cosh of a possibly tiny ρ2: the exponential difference loses
  // all its digits below ~1e-2, so sum the series there instead.
  const sinh = Math.abs(rho2) < 0.1 ? seriesSinh(rho2) : 0.5 * (Math.exp(rho2) - Math.exp(-rho2));
  const cosh = Math.abs(rho2) < 0.1 ? seriesCosh(rho2) : 0.5 * (Math.exp(rho2) + Math.exp(-rho2));
  const twoSinh = 2 * sinh;
  const twoCosh = 2 * cosh;

  B[1] = twoSinh / rho2;
  for (let n = 2; n <= maxIndex; n++) {
    B[n] = n % 2 === 1
      ? (twoSinh + (n - 1) * B[n - 1]) / rho2
      : -(twoCosh - (n - 1) * B[n - 1]) / rho2;
  }
  return { A, B };
}

function seriesSinh(x: number): number {
  let sum = 0;
  let term = x;
  for (let k = 1; k <= 40; k++) {
    sum += term;
    term *= (x * x) / ((2 * k) * (2 * k + 1));
    if (Math.abs(term) < 1e-30) break;
  }
  return sum;
}

function seriesCosh(x: number): number {
  let sum = 0;
  let term = 1;
  for (let k = 0; k <= 40; k++) {
    sum += term;
    term *= (x * x) / ((2 * k + 1) * (2 * k + 2));
    if (Math.abs(term) < 1e-30) break;
  }
  return sum;
}

const BINOMIAL: number[][] = (() => {
  const table: number[][] = [];
  for (let n = 0; n <= 8; n++) {
    table[n] = [];
    for (let k = 0; k <= n; k++) {
      table[n][k] = k === 0 || k === n ? 1 : table[n - 1][k - 1] + table[n - 1][k];
    }
  }
  return table;
})();

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return BINOMIAL[n][k];
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** abfns/lovlap define FACT(I) = (I−1)!; the binomial prefactors below are
 *  written with the Fortran's argument text, so they need this convention. */
function fact1(i: number): number {
  return factorial(i - 1);
}

/**
 * The angle-independent part of a two-center overlap: the σ (m=0), π (m=1)
 * or δ (m=2) component between orbitals with the given quantum numbers, with
 * the bond along +z. This is `lovlap.f`'s sum, transcribed with the same
 * normalization and the same binomial expansion.
 *
 * `n1`/`n2` are the principal quantum numbers, `l1`/`l2` the angular momenta,
 * `m` the component (|m| ≤ min(l1, l2)).
 */
export function radialComponent(
  n1: number, l1: number, n2: number, l2: number, m: number,
  zeta1: number, zeta2: number, R: number,
): number {
  const maxIndex = n1 + n2 + 1;
  const { A, B } = abFunctions(zeta1, zeta2, R, maxIndex);

  // Prefactor: the normalizations, the (ζR) powers and the 2^-(l1+l2+1).
  const rho1p = Math.pow(zeta1 * R, 2 * n1 + 1);
  const rho2p = Math.pow(zeta2 * R, 2 * n2 + 1);
  const terma = Math.pow(0.5, l1 + l2 + 1) * Math.sqrt(
    ((2 * l1 + 1) * (2 * l2 + 1) * factorial(l1 - m) * factorial(l2 - m))
    / (factorial(2 * n1) * factorial(2 * n2) * factorial(l1 + m) * factorial(l2 + m))
    * rho1p * rho2p,
  );

  let total = 0;
  const jEnd = 1 + Math.floor((l1 - m) / 2);
  const kEnd = 1 + Math.floor((l2 - m) / 2);
  const ieb = m + 1;

  for (let j = 1; j <= jEnd; j++) {
    const ju = j - 1;
    const iab = n1 - l1 + 2 * ju + 1;
    const icb = l1 - m - 2 * ju + 1;
    const con1 = fact1(l1 + l1 - 2 * ju + 1)
      / (fact1(l1 - m - 2 * ju + 1) * fact1(ju + 1) * fact1(l1 - ju + 1));
    for (let k = 1; k <= kEnd; k++) {
      const ku = k - 1;
      let con12 = con1 * fact1(l2 + l2 - 2 * ku + 1)
        / (fact1(l2 - m - 2 * ku + 1) * fact1(ku + 1) * fact1(l2 - ku + 1));
      if ((ju + ku + l2) % 2 !== 0) con12 = -con12;
      const ibb = n2 - l2 + 2 * ku + 1;
      const idb = l2 - m - 2 * ku + 1;

      let value = 0;
      for (let i6 = 1; i6 <= ieb; i6++) {
        for (let i5 = 1; i5 <= ieb; i5++) {
          let v1 = choose(ieb - 1, i6 - 1) * choose(ieb - 1, i5 - 1);
          if ((i5 + i6) % 2 !== 0) v1 = -v1;
          for (let i4 = 1; i4 <= idb; i4++) {
            v1 = -v1;
            const v2 = choose(idb - 1, i4 - 1) * v1;
            for (let i3 = 1; i3 <= icb; i3++) {
              const v3 = choose(icb - 1, i3 - 1) * v2;
              let v3s = v3;
              for (let i2 = 1; i2 <= ibb; i2++) {
                v3s = -v3s;
                const v4 = choose(ibb - 1, i2 - 1) * v3s;
                for (let i1 = 1; i1 <= iab; i1++) {
                  const term = v4 * choose(iab - 1, i1 - 1);
                  const ir = i1 + i2 + ieb + ieb - i6 - i6 - i3 + idb - i4 + icb - 1;
                  const ip = iab - i1 + ibb - i2 + ieb + ieb - i5 - i5 + icb - i3 + idb - i4 + 1;
                  if (ip < 1 || ir < 1 || ip > maxIndex || ir > maxIndex) continue;
                  value += A[ip] * B[ir] * term;
                }
              }
            }
          }
        }
      }
      total += value * con12;
    }
  }
  return total * terma;
}

/** Å per bohr. The integrals are evaluated in bohr because Slater exponents
 *  are (YAeHMOP's bind.h carries its own 0.52918, a 2004 rounding — 5e-6
 *  relative, far below the method's accuracy and the fixtures' 4 decimals). */
export const BOHR_RADIUS = 0.529177210903;

/**
 * The overlap matrix over a basis, in molecular coordinates.
 *
 * Orbitals on the same atom are orthogonal (1 with themselves, 0 otherwise).
 * A pair on different atoms is assembled from the σ/π components above and
 * the direction cosines of the bond axis, exactly as YAeHMOP's
 * calc_R_overlap does — including its sign convention, which is the one a
 * chemist expects: **a p orbital's positive lobe points at its partner**, so
 * the σ contribution is the radial integral times the cosines of both
 * lobes' angles to the bond. Verified against the oracle's S matrices
 * (water, methane, ethene, benzene, ethyne, N₂) in
 * tests/references/eht.
 */
export function overlapMatrix(
  basis: BasisFunction[],
  atoms: Molecule['atoms'],
): number[][] {
  const n = basis.length;
  const S: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    S[i][i] = 1;
    for (let j = 0; j < i; j++) {
      const a = basis[i];
      const b = basis[j];
      const value = a.atomIndex === b.atomIndex ? 0 : orbitalOverlap(a, b, atoms);
      S[i][j] = value;
      S[j][i] = value;
    }
  }
  return S;
}

/** Unit vector from atom b to atom a, in molecular coordinates. */
function bondAxis(
  a: BasisFunction, b: BasisFunction, atoms: Molecule['atoms'],
): { axis: [number, number, number]; R: number } {
  const pa = atoms[a.atomIndex];
  const pb = atoms[b.atomIndex];
  const dx = pa.x - pb.x;
  const dy = pa.y - pb.y;
  const dz = pa.z - pb.z;
  const rAngstrom = Math.hypot(dx, dy, dz);
  return { axis: [dx / rAngstrom, dy / rAngstrom, dz / rAngstrom], R: rAngstrom / BOHR_RADIUS };
}

function orbitalOverlap(a: BasisFunction, b: BasisFunction, atoms: Molecule['atoms']): number {
  const pa = atoms[a.atomIndex];
  const pb = atoms[b.atomIndex];
  const rAngstrom = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
  if (rAngstrom < 1e-8) return 0; // coincident atoms: no overlap (the oracle's own rule)

  const { axis: zFromB, R } = bondAxis(a, b, atoms);
  // direction from each p orbital's own atom toward its partner
  const toward = (p: BasisFunction, other: BasisFunction): [number, number, number] => {
    const from = atoms[p.atomIndex];
    const to = atoms[other.atomIndex];
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const r = Math.hypot(dx, dy, dz);
    return [dx / r, dy / r, dz / r];
  };
  const dot = (u: [number, number, number], v: [number, number, number]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

  if (a.angular === 's' && b.angular === 's') {
    return radialComponent(a.n, 0, b.n, 0, 0, a.zeta, b.zeta, R);
  }
  if (a.angular === 's') {
    return dot(b.axis, toward(b, a)) * radialComponent(a.n, 0, b.n, 1, 0, a.zeta, b.zeta, R);
  }
  if (b.angular === 's') {
    return dot(a.axis, toward(a, b)) * radialComponent(a.n, 1, b.n, 0, 0, a.zeta, b.zeta, R);
  }
  const sigma = radialComponent(a.n, 1, b.n, 1, 0, a.zeta, b.zeta, R);
  const pi = radialComponent(a.n, 1, b.n, 1, 1, a.zeta, b.zeta, R);
  const headOn = dot(a.axis, toward(a, b)) * dot(b.axis, toward(b, a));
  const sameAxis = dot(a.axis, b.axis);
  const perpendicular = sameAxis - dot(a.axis, zFromB) * dot(b.axis, zFromB);
  return headOn * sigma + perpendicular * pi;
}
