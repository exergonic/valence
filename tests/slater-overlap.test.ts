/**
 * The two-centre overlaps against direct numerical integration.
 *
 * `extended-huckel.test.ts` pins the same integrals against bind and against
 * analytic closed forms, but both of those share a lineage with the code: bind
 * descends from the same Hoffmann-group Fortran, and a hand-derived formula can
 * carry the same misconception as the code it checks. This file computes the
 * overlap a completely different way — a tensor-product Gauss–Legendre
 * quadrature of χ_a(r)χ_b(r) over a box around the two centres — so a shared
 * error in the A/B auxiliary functions or in the angular transcription has
 * somewhere to show up. Nothing here imports the overlap module's machinery:
 * the radial part, the angular part and the volume element are written out
 * again, from the same textbook definitions, and the two are compared.
 *
 * The s and p cases are the regression net for the quadrature itself (they were
 * already verified against the oracle); the d cases are the point.
 */
import { describe, expect, it } from 'vitest';
import { overlapMatrix } from '../src/chem/extended-huckel/slater-overlap';
import type { BasisFunction, DFunction } from '../src/chem/extended-huckel/assign-basis';
import type { Molecule } from '../src/mol-parser';

/** CODATA Bohr radius, written out: the quadrature and the code must agree in
 *  the same unit without sharing a constant. */
const BOHR = 0.529177210903;

const INV_SQRT_4PI = 1 / Math.sqrt(4 * Math.PI);
const SQRT_3_4PI = Math.sqrt(3 / (4 * Math.PI));
const SQRT_5_16PI = Math.sqrt(5 / (16 * Math.PI));
const SQRT_15_16PI = Math.sqrt(15 / (16 * Math.PI));
const SQRT_15_4PI = Math.sqrt(15 / (4 * Math.PI));

/** Which orbital, as the quadrature needs it: a radial exponent and an angular
 *  form written in the global frame. */
type Shape =
  | { l: 's' } | { l: 'p'; axis: [number, number, number] }
  | { l: 'd'; d: DFunction };

interface Spec { n: number; zeta: number; shape: Shape }

/** The normalized Slater angular factor, from the Cartesian direction. */
function angular(shape: Shape, dx: number, dy: number, dz: number, r: number): number {
  switch (shape.l) {
    case 's': return INV_SQRT_4PI;
    case 'p': return SQRT_3_4PI * (dx * shape.axis[0] + dy * shape.axis[1] + dz * shape.axis[2]) / r;
    default: {
      const r2 = r * r;
      switch (shape.d) {
        case 'x2-y2': return SQRT_15_16PI * (dx * dx - dy * dy) / r2;
        case 'z2': return SQRT_5_16PI * (2 * dz * dz - dx * dx - dy * dy) / r2;
        case 'xy': return SQRT_15_4PI * dx * dy / r2;
        case 'xz': return SQRT_15_4PI * dx * dz / r2;
        default: return SQRT_15_4PI * dy * dz / r2;
      }
    }
  }
}

/** (2ζ)^(n+½)/√((2n)!) · r^(n−1) e^(−ζr), in bohr. */
function radial(spec: Spec, r: number): number {
  let factorial = 1;
  for (let k = 2; k <= 2 * spec.n; k++) factorial *= k;
  let power = 1;
  for (let k = 1; k < spec.n; k++) power *= r;
  return Math.pow(2 * spec.zeta, spec.n + 0.5) / Math.sqrt(factorial) * power * Math.exp(-spec.zeta * r);
}

/** Gauss–Legendre nodes and weights on [−1, 1] (Newton on the Legendre polynomial). */
function gaussLegendre(n: number): { x: number[]; w: number[] } {
  const x = new Array<number>(n);
  const w = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let derivative = 0;
    for (let iteration = 0; iteration < 100; iteration++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 0; j < n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1);
      }
      derivative = (n * (z * p1 - p2)) / (z * z - 1);
      const previous = z;
      z = previous - p1 / derivative;
      if (Math.abs(z - previous) < 1e-15) break;
    }
    x[i] = z;
    w[i] = 2 / ((1 - z * z) * derivative * derivative);
  }
  return { x, w };
}

/**
 * ⟨a|b⟩ by quadrature, with the centres at z = 0 and z = R (bohr).
 *
 * The box has to be generous and the reason is worth keeping: a d function
 * carries r², so its tail is not negligible at the distance an s or a p case
 * would call far enough. Truncating at 6/ζ put 5e-6 of error into an s–d
 * overlap and 1e-4 into a d–d one — the first version of this file "found"
 * those as discrepancies and they were the box, not the code. At 10/ζ the
 * numbers agree to 1e-7, and the δ pair (xy and x²−y², which C∞ symmetry
 * requires to have identical self-overlaps) matches to the last digit.
 *
 * The product is analytic, so Gauss–Legendre converges geometrically; 140 nodes
 * an axis is past the accuracy asserted below.
 */
function overlapByQuadrature(a: Spec, b: Spec, R: number, nodes = 140, margin = 10): number {
  const { x, w } = gaussLegendre(nodes);
  const half = R / 2 + margin / Math.min(a.zeta, b.zeta) + 1;
  let total = 0;
  for (let i = 0; i < nodes; i++) {
    const px = x[i] * half;
    for (let j = 0; j < nodes; j++) {
      const py = x[j] * half;
      const weightXY = w[i] * w[j] * half * half;
      for (let k = 0; k < nodes; k++) {
        const pz = x[k] * half + R / 2;
        const weight = weightXY * w[k] * half;
        const aDist = Math.hypot(px, py, pz);
        const bDist = Math.hypot(px, py, pz - R);
        total += weight * radial(a, aDist) * angular(a.shape, px, py, pz, aDist)
          * radial(b, bDist) * angular(b.shape, px, py, pz - R, bDist);
      }
    }
  }
  return total;
}

/** The same pair through the module under test. */
function overlapFromCode(a: Spec, b: Spec, R: number): number {
  const atoms: Molecule['atoms'] = [
    { element: 'S', x: 0, y: 0, z: 0, charge: 0 },
    { element: 'S', x: 0, y: 0, z: R * BOHR, charge: 0 },
  ];
  const toBasis = (spec: Spec, atomIndex: number): BasisFunction => ({
    atomIndex,
    angular: spec.shape.l,
    axis: spec.shape.l === 'p' ? spec.shape.axis : [0, 0, 0],
    d: spec.shape.l === 'd' ? spec.shape.d : undefined,
    n: spec.n,
    zeta: spec.zeta,
    hii: -1,
    label: 'x',
  });
  const [matrix] = [overlapMatrix([toBasis(a, 0), toBasis(b, 1)], atoms)];
  return matrix[0][1];
}

const s = (zeta: number): Spec => ({ n: 3, zeta, shape: { l: 's' } });
const p = (zeta: number, axis: [number, number, number]): Spec => ({ n: 3, zeta, shape: { l: 'p', axis } });
const d = (zeta: number, kind: DFunction): Spec => ({ n: 3, zeta, shape: { l: 'd', d: kind } });

const Z_AXIS: [number, number, number] = [0, 0, 1];
const X_AXIS: [number, number, number] = [1, 0, 0];

describe('the two-centre overlaps by quadrature', () => {
  it('the quadrature itself is converged well past the tolerance used below', { timeout: 30000 }, () => {
    // Otherwise every number below would be the quadrature's error, not the
    // code's. Compare the working setting against a finer rule and a wider box.
    const pairs: Array<[Spec, Spec]> = [
      [d(1.5, 'z2'), d(1.4, 'z2')],
      [d(1.5, 'xz'), p(1.3, X_AXIS)],
    ];
    for (const [a, b] of pairs) {
      const working = overlapByQuadrature(a, b, 2.7);
      const finer = overlapByQuadrature(a, b, 2.7, 180, 13);
      expect(Math.abs(working - finer)).toBeLessThan(1e-6);
    }
  });

  it('gives the δ pair the same self-overlap, as C∞ symmetry requires', () => {
    // xy and x²−y² are a 45° rotation of one another about the bond, which is a
    // symmetry operation of a two-centre system — so their overlaps must agree
    // exactly. This is the check that caught the truncation above: with the
    // small box they differed in the fifth digit.
    const xy = overlapFromCode(d(1.5, 'xy'), d(1.5, 'xy'), 2.9);
    const x2y2 = overlapFromCode(d(1.5, 'x2-y2'), d(1.5, 'x2-y2'), 2.9);
    expect(Math.abs(xy - x2y2)).toBeLessThan(1e-12);
  });

  it('agrees with the module for s and p — the cases the oracle already covers', { timeout: 30000 }, () => {
    const cases: Array<[Spec, Spec, number]> = [
      [s(1.5), s(2.0), 2.8],
      [s(2.1), p(1.8, Z_AXIS), 2.4],
      [p(1.8, Z_AXIS), p(1.8, Z_AXIS), 2.9],
      [p(1.8, X_AXIS), p(1.8, X_AXIS), 2.9],
      [p(1.3, Z_AXIS), p(1.75, X_AXIS), 3.1],
    ];
    for (const [a, b, R] of cases) {
      const expected = overlapByQuadrature(a, b, R);
      const actual = overlapFromCode(a, b, R);
      expect(Math.abs(actual - expected)).toBeLessThan(1e-5);
    }
  });

  it('agrees with the module for every d case: s–d, p–d and d–d', { timeout: 60000 }, () => {
    // Every d function appears on both sides of a pair, so all five angular
    // forms and all three channels (σ, π, δ) are exercised.
    const cases: Array<[Spec, Spec, number]> = [
      [s(1.8), d(1.5, 'z2'), 2.6],          // s–d σ
      [s(1.8), d(1.5, 'x2-y2'), 2.6],       // s–d δ
      [d(1.5, 'xz'), s(1.8), 2.6],          // d–s, the other order
      [p(1.6, Z_AXIS), d(1.5, 'z2'), 2.7],  // p–d σ
      [p(1.6, X_AXIS), d(1.5, 'xz'), 2.7],  // p–d π
      [p(1.6, Z_AXIS), d(1.5, 'xz'), 2.7],  // p–d, mixed channel
      [d(1.5, 'z2'), d(1.5, 'z2'), 2.9],    // d–d σ
      [d(1.5, 'xz'), d(1.5, 'xz'), 2.9],    // d–d π
      [d(1.5, 'xy'), d(1.5, 'xy'), 2.9],    // d–d δ
      [d(1.383, 'z2'), d(2.033, 'yz'), 2.5], // unequal exponents, different kinds
    ];
    for (const [a, b, R] of cases) {
      const expected = overlapByQuadrature(a, b, R);
      const actual = overlapFromCode(a, b, R);
      expect(Math.abs(actual - expected)).toBeLessThan(1e-5);
    }
  });

  it('gets the same-atom orthogonality right (a d is not a p)', () => {
    // On one centre the five d functions are orthonormal and orthogonal to s
    // and p — the property an angular transcription is most likely to break.
    const atoms: Molecule['atoms'] = [{ element: 'S', x: 0, y: 0, z: 0, charge: 0 }];
    const kinds: DFunction[] = ['x2-y2', 'z2', 'xy', 'xz', 'yz'];
    const basis: BasisFunction[] = [
      { atomIndex: 0, angular: 's', axis: [0, 0, 0], n: 3, zeta: 1.5, hii: -1, label: 's' },
      { atomIndex: 0, angular: 'p', axis: [0, 0, 1], n: 3, zeta: 1.5, hii: -1, label: 'pz' },
      ...kinds.map((kind): BasisFunction => ({ atomIndex: 0, angular: 'd', axis: [0, 0, 0], d: kind, n: 3, zeta: 1.5, hii: -1, label: kind })),
    ];
    const matrix = overlapMatrix(basis, atoms);
    expect(matrix.length).toBe(7);
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        expect(Math.abs(matrix[i][j] - (i === j ? 1 : 0))).toBeLessThan(1e-12);
      }
    }
  });
});
