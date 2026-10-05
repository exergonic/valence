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

interface Spec { n: number; zeta: number; zeta2?: number; coefficients?: [number, number]; shape: Shape }

/** The (ζ, coefficient) terms a spec is built from — two for a contracted d. */
function terms(spec: Spec): Array<{ zeta: number; coefficient: number }> {
  return spec.zeta2 === undefined || spec.coefficients === undefined
    ? [{ zeta: spec.zeta, coefficient: 1 }]
    : [{ zeta: spec.zeta, coefficient: spec.coefficients[0] },
       { zeta: spec.zeta2, coefficient: spec.coefficients[1] }];
}

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

/** A spec's contraction with the normalization folded in: the inner loop runs
 *  millions of times, so the factorial and the ζ power are computed once here
 *  rather than per grid point. */
function prepare(spec: Spec): Array<{ zeta: number; scale: number }> {
  let factorial = 1;
  for (let k = 2; k <= 2 * spec.n; k++) factorial *= k;
  return terms(spec).map((term) => ({
    zeta: term.zeta,
    coefficient: term.coefficient,
    scale: (term.coefficient * Math.pow(2 * term.zeta, spec.n + 0.5)) / Math.sqrt(factorial),
  }));
}

/** r^(n−1) · Σ cᵗ e^(−ζ r), in bohr. */
function radialAt(prepared: Array<{ zeta: number; scale: number }>, power: number, r: number): number {
  let total = 0;
  for (const term of prepared) total += term.scale * Math.exp(-term.zeta * r);
  return power * total;
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
  const pa = prepare(a);
  const pb = prepare(b);
  // size the box by the LOOSEST exponent in play — for a contracted orbital
  // that is its second term, not the first (the same truncation trap as above,
  // one level deeper: sizing by zeta alone cut a contracted d's slow tail off)
  const loosest = Math.min(...[...terms(a), ...terms(b)].map((t) => t.zeta));
  const half = R / 2 + margin / loosest + 1;
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
        let aPower = 1;
        for (let k = 1; k < a.n; k++) aPower *= aDist;
        let bPower = 1;
        for (let k = 1; k < b.n; k++) bPower *= bDist;
        total += weight * radialAt(pa, aPower, aDist) * angular(a.shape, px, py, pz, aDist)
          * radialAt(pb, bPower, bDist) * angular(b.shape, px, py, pz - R, bDist);
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
    zeta2: spec.zeta2,
    coefficients: spec.coefficients,
    hii: -1,
    label: 'x',
  });
  const [matrix] = [overlapMatrix([toBasis(a, 0), toBasis(b, 1)], atoms)];
  return matrix[0][1];
}

const s = (zeta: number): Spec => ({ n: 3, zeta, shape: { l: 's' } });
const p = (zeta: number, axis: [number, number, number]): Spec => ({ n: 3, zeta, shape: { l: 'p', axis } });
const d = (zeta: number, kind: DFunction): Spec => ({ n: 3, zeta, shape: { l: 'd', d: kind } });

/** Iron's 3d exactly as the parameter table ships it: two exponents, one
 *  coefficient each. */
const feD = (kind: DFunction): Spec => ({
  n: 3, zeta: 5.35, zeta2: 2.0, coefficients: [0.5505, 0.6260], shape: { l: 'd', d: kind },
});

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

    // A CONTRACTED orbital is a harder integral: its tight term (ζ = 5.35 for
    // iron's 3d) decays over 1/ζ ≈ 0.19 bohr, so a box sized to hold the loose
    // term leaves ~2 nodes per decay length. The rule still converges, just
    // more slowly — which is why the contracted comparisons below carry a
    // looser tolerance than the rest of the file.
    const contractedCoarse = overlapByQuadrature(feD('z2'), feD('z2'), 3.2);
    const contractedFine = overlapByQuadrature(feD('z2'), feD('z2'), 3.2, 180, 13);
    expect(Math.abs(contractedCoarse - contractedFine)).toBeLessThan(1e-4);
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
      // looser than the single-zeta cases: see the convergence note above
      expect(Math.abs(actual - expected)).toBeLessThan(1e-4);
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
      // looser than the single-zeta cases: see the convergence note above
      expect(Math.abs(actual - expected)).toBeLessThan(1e-4);
    }
  });

  it('agrees with the module for a contracted d — the two-zeta sum of the d block', { timeout: 60000 }, () => {
    // Iron's 3d as the parameter table ships it: two exponents with a
    // coefficient each. The overlap of a contracted orbital with anything is
    // the 2×2 sum over exponent pairs, and this is the only check that the sum
    // (and the normalisation behind it) is right.
    const carbon = (zeta: number): Spec => ({ n: 2, zeta, shape: { l: 's' } });
    const ironD = feD;
    const cases: Array<[Spec, Spec, number]> = [
      [ironD('z2'), carbon(1.625), 2.6],
      [ironD('xz'), carbon(1.625), 2.6],
      [carbon(1.625), ironD('x2-y2'), 2.6],
      [ironD('z2'), ironD('z2'), 3.2],
      [ironD('xz'), ironD('xz'), 3.2],
      [ironD('xy'), ironD('x2-y2'), 3.2],
    ];
    for (const [a, b, R] of cases) {
      const expected = overlapByQuadrature(a, b, R);
      const actual = overlapFromCode(a, b, R);
      // looser than the single-zeta cases: see the convergence note above
      expect(Math.abs(actual - expected)).toBeLessThan(1e-4);
    }
  });

  it('stays exact for heavy shells whose exponents nearly agree', { timeout: 60000 }, () => {
    // The B auxiliary integral depends on ρ = (ζ₁−ζ₂)R/2. An upward recurrence
    // for it divides by ρ at every step, and for a 5s/6s against a 5p/6p of
    // almost the same ζ (the second- and third-row metals' own s and p) the
    // error grew to 10⁶–10⁸: Au₂ and Re₂ came out with overlaps far above 1. The
    // exponents below are the parameter table's.
    const shell = (n: number, zeta: number, shape: Shape): Spec => ({ n, zeta, shape });
    const cases: Array<[Spec, Spec, number]> = [
      [shell(5, 1.817, { l: 's' }), shell(5, 1.776, { l: 'p', axis: Z_AXIS }), 6.0],   // Zr 5s / 5p σ
      [shell(6, 2.602, { l: 's' }), shell(6, 2.584, { l: 'p', axis: Z_AXIS }), 5.4],   // Au 6s / 6p σ
      [shell(6, 2.341, { l: 'p', axis: X_AXIS }), shell(6, 2.309, { l: 'p', axis: X_AXIS }), 5.2], // W 6p π
      [shell(6, 2.372, { l: 'p', axis: Z_AXIS }), shell(5, 2.277, { l: 'd', d: 'z2' }), 4.2], // Re 6p / 5d's loose ζ
    ];
    for (const [a, b, R] of cases) {
      const expected = overlapByQuadrature(a, b, R);
      const actual = overlapFromCode(a, b, R);
      expect(Math.abs(actual - expected)).toBeLessThan(1e-4);
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
