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
import { D_FUNCTIONS, type BasisFunction } from './assign-basis';

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

const SQRT3 = Math.sqrt(3);

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
  // before the s-only branches below: an s–d pair must not take the s–p path
  if (a.angular === 'd' || b.angular === 'd') {
    return dOverlap(a, b, zFromB, R, rAngstrom);
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

/**
 * The overlaps involving a d function — a transcription of YAeHMOP's
 * `R_overlap_mat.c`, including its sign flips, because those flips are how the
 * Fortran/C code accounts for the direction convention of a d function that
 * sits on the "other" atom of the pair. Everything is built from the bond's
 * direction cosines:
 *
 *   A is the angle between the bond vector (from b's atom to a's) and z,
 *   B the azimuth of its xy projection about z,
 *
 * and the two projection tables are exactly the source's: `p` (9 entries) for
 * a p orbital and `d` (25 = three channels × five functions, plus the two
 * d–d cross blocks) for the five real d functions in `D_FUNCTIONS` order.
 * A d function has no axis of its own — its shape is fixed on the frame's
 * axes — so `u` below is the bond vector and nothing else.
 *
 * Pinned against `bind` on PCl₅ (tests/references/eht/d-reference.json), which
 * is what makes a transcription safer than a re-derivation.
 */
function dOverlap(
  a: BasisFunction,
  b: BasisFunction,
  zFromB: [number, number, number],
  R: number,
  rAngstrom: number,
): number {
  const [ux, uy, uz] = zFromB;
  const xyUnit = Math.hypot(ux, uy);
  const xy = xyUnit * rAngstrom;
  const sinA = xy < 1e-5 ? 0 : xyUnit;
  const cosA = uz;
  const cosB = xy < 1e-5 ? 1 : ux / xyUnit;
  const sinB = xy < 1e-5 ? 0 : uy / xyUnit;
  const c2A = cosA * cosA - sinA * sinA;
  const c2B = cosB * cosB - sinB * sinB;
  const s2B = 2 * sinB * cosB;

  const p = [
    sinA * cosB, sinA * sinB, cosA,
    cosA * cosB, cosA * sinB, -sinA,
    -sinB, cosB, 0,
  ];
  const d = [
    // σ channel: how each of the five functions projects onto the bond axis
    SQRT3 * 0.5 * sinA * sinA * c2B,
    1 - 1.5 * sinA * sinA,
    SQRT3 * cosB * sinB * sinA * sinA,
    SQRT3 * cosA * sinA * cosB,
    SQRT3 * cosA * sinA * sinB,
    // π channel
    cosA * sinA * c2B,
    -SQRT3 * cosA * sinA,
    cosA * sinA * s2B,
    cosB * c2A,
    sinB * c2A,
    // δ channel
    -sinA * s2B,
    0,
    sinA * c2B,
    -p[4],
    p[3],
    // the d–d blocks (only reachable when both sides are d)
    0.5 * (1 + cosA * cosA) * c2B,
    0.5 * SQRT3 * sinA * sinA,
    cosB * sinB * (1 + cosA * cosA),
    -cosA * sinA * cosB,
    -cosA * sinA * sinB,
    -cosA * s2B,
    0,
    cosA * c2B,
    p[1],
    -p[0],
  ];

  const ka = a.angular === 'd' ? D_FUNCTIONS.indexOf(a.d!) : -1;
  const kb = b.angular === 'd' ? D_FUNCTIONS.indexOf(b.d!) : -1;
  /** The radial σ/π/δ component for this pair's quantum numbers. */
  const radial = (m: number) => radialComponent(a.n, angularOf(a), b.n, angularOf(b), m, a.zeta, b.zeta, R);

  // < S | D >
  if (a.angular === 's' && kb >= 0) return d[kb] * radial(0);
  // < D | S >
  if (ka >= 0 && b.angular === 's') return d[ka] * radial(0);
  // < P | D >  — the p's component along the pair's frame axis
  if (a.angular === 'p' && kb >= 0) {
    const k = a.axis.indexOf(1); // the frame axis this p lies on
    return -p[k] * d[kb] * radial(0)
      + (d[kb + 5] * p[k + 3] + d[kb + 10] * p[k + 6]) * radial(1);
  }
  // < D | P >
  if (ka >= 0 && b.angular === 'p') {
    const l = b.axis.indexOf(1);
    return p[l] * d[ka] * radial(0)
      - (p[l + 3] * d[ka + 5] + d[ka + 10] * p[l + 6]) * radial(1);
  }
  // < D | D >
  return d[ka] * d[kb] * radial(0)
    - (d[ka + 5] * d[kb + 5] + d[kb + 10] * d[ka + 10]) * radial(1)
    + (d[ka + 15] * d[kb + 15] + d[ka + 20] * d[kb + 20]) * radial(2);
}

function angularOf(orbital: BasisFunction): number {
  return orbital.angular === 's' ? 0 : orbital.angular === 'p' ? 1 : 2;
}

