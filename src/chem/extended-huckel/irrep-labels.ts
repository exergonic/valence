/**
 * Mulliken irrep labels for the extended-Hückel MOs.
 *
 * "MO 15 is e1g" is the most useful thing a level diagram can say, and it is
 * the thing a student is expected to write down. Nothing here needs a
 * character table: the group's operations are already detected (and the
 * geometry snapped to them, so the symmetry is exact rather than approximate),
 * and a character is then a trace away.
 *
 * The two facts that make it small:
 *
 *   - D(g) is the image of each AO. An s orbital lands as 1 on the image
 *     atom. A p orbital is a polar vector: axis û is carried to Rû, and the
 *     component along a target axis v̂ is (Rû)·v̂ — the whole of R, not its
 *     diagonal. The trace of D only sees atoms g fixes, which is why a label
 *     read off a pure pz can look right while D is not a representation.
 *     D(a)D(b) = D(ab) is the check that catches it.
 *   - The character of a *set* of MOs is basis-independent: summing
 *     ψᵀ S D(g) ψ over the set gives the trace of g on that subspace, so it
 *     does not matter which mixture inside a degenerate set we happen to hold.
 *
 * Naming follows the standard Mulliken rules, which are themselves
 * operational rather than tabulated: a/b from the sign under the principal
 * rotation, e/t by dimension, the 1/2 subscript from a perpendicular C2 (or a
 * mirror containing the principal axis), g/u from the inversion, ′/″ from a
 * mirror perpendicular to the principal axis. Three families bend those rules
 * and get their own: the cubic groups (no B at all; 1/2 from the four-fold
 * operation), D2 and D2h (B1/B2/B3 by which C2 is kept, on Mulliken's axes),
 * and S4/D2d/D4d (the principal operation is the S2n, not its C_n). Where a
 * case is ambiguous the label degrades to the bare letter rather than guessing
 * — a wrong label is worse than a partial one.
 *
 * Linear molecules get their own path: their groups have infinitely many
 * operations, so the detector reports none. The label is the character of a
 * C4 about the axis — χ = d·cos(mπ/2) gives σ, π or δ — plus the parity
 * under inversion.
 */
import type { Molecule } from '../../mol-parser';
import { D_FUNCTIONS, type BasisFunction } from './assign-basis';
import { alignToPrincipalAxes } from './align-principal-axes';
import { detectPointGroup, mirrorNormal, type SymmetryOperation } from '../../geometry/symmetrize';
import { CANONICAL_TOLERANCE_EV } from './canonicalize-degenerate';

type Vec3 = [number, number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => { const n = length(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const determinant = (m: number[][]) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/**
 * The representation matrix of one operation in the AO basis: the image of
 * each AO, as a column. Sparse by construction (an AO lands on one atom), but
 * small enough that a dense array is the simpler thing.
 */
export function representationMatrix(basis: BasisFunction[], operation: SymmetryOperation): number[][] {
  const n = basis.length;
  const d: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const r = operation.matrix;
  const dRep = dRepresentation(r);
  for (let i = 0; i < n; i++) {
    const orbital = basis[i];
    const target = operation.permutation[orbital.atomIndex];
    // the AO on `target` with the same angular momentum, its axis rotated
    const candidates = basis
      .map((b, j) => ({ b, j }))
      .filter((e) => e.b.atomIndex === target && e.b.angular === orbital.angular && e.b.n === orbital.n);
    if (orbital.angular === 's') {
      const match = candidates[0];
      if (match) d[match.j][i] += 1;
      continue;
    }
    if (orbital.angular === 'd') {
      // A d function has no axis to rotate: the five real d functions are an
      // l = 2 basis, so the rotation acts through its own 5×5 matrix. Each
      // candidate is one of them, and the element is the representation's.
      const sourceKind = D_FUNCTIONS.indexOf(orbital.d!);
      for (const candidate of candidates) {
        d[candidate.j][i] += dRep[D_FUNCTIONS.indexOf(candidate.b.d!)][sourceKind];
      }
      continue;
    }
    for (const candidate of candidates) {
      // R carries the source p orbital onto the target atom. The component
      // along each of that atom's own p axes is the matrix element. Rotating
      // the target axis instead (as this did) makes the diagonal right and
      // every off-diagonal wrong, so a C3 that mixes px with py is not a
      // representation at all.
      const source = orbital.axis;
      const rotated: Vec3 = [
        r[0][0] * source[0] + r[0][1] * source[1] + r[0][2] * source[2],
        r[1][0] * source[0] + r[1][1] * source[1] + r[1][2] * source[2],
        r[2][0] * source[0] + r[2][1] * source[1] + r[2][2] * source[2],
      ];
      d[candidate.j][i] += dot(rotated, candidate.b.axis);
    }
  }
  return d;
}

/**
 * The l = 2 representation of a rotation, in the five real d functions'
 * basis (D_FUNCTIONS order).
 *
 * A d function is a symmetric quadratic form, f_k(r) = rᵗ M_k r, so a rotation
 * acts on it by M → R M Rᵗ and the matrix element onto f_j is that form
 * re-expressed in the five. The five M_k are orthogonal under the Frobenius
 * product, which is the same invariant inner product the spherical integrals
 * use, so the projection is just ⟨M_j, R M_k Rᵗ⟩/⟨M_j, M_j⟩; the ratio of the
 * normalizations then converts from the numerators to the normalized real
 * harmonics. Its character for a rotation by θ is 1 + 2cosθ + 2cos2θ, which is
 * what the tests pin.
 */
function dRepresentation(r: number[][]): number[][] {
  const out: number[][] = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
  for (let k = 0; k < 5; k++) {
    const m = D_FORMS[k];
    // R M Rᵗ, with r orthogonal so Rᵗ acts as the inverse
    const rm = [0, 1, 2].map((i) => [0, 1, 2].map((j) => [0, 1, 2].reduce((s, t) => s + r[i][t] * m[t][j], 0)));
    const rotated = [0, 1, 2].map((i) => [0, 1, 2].map((j) => [0, 1, 2].reduce((s, t) => s + rm[i][t] * r[j][t], 0)));
    for (let j = 0; j < 5; j++) {
      let inner = 0;
      let norm = 0;
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          inner += D_FORMS[j][a][b] * rotated[a][b];
          norm += D_FORMS[j][a][b] * D_FORMS[j][a][b];
        }
      }
      out[j][k] = (inner / norm) * (D_NORMS[k] / D_NORMS[j]);
    }
  }
  return out;
}

/** The five real d functions as the symmetric forms x²−y², 2z²−x²−y², 2xy,
 *  2xz, 2yz, and their normalizing constants. */
const D_FORMS: number[][][] = [
  [[1, 0, 0], [0, -1, 0], [0, 0, 0]],
  [[-1, 0, 0], [0, -1, 0], [0, 0, 2]],
  [[0, 1, 0], [1, 0, 0], [0, 0, 0]],
  [[0, 0, 1], [0, 0, 0], [1, 0, 0]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 0]],
];
const D_NORMS = [
  // the numerators above are the DOUBLED cross terms (2xy, 2xz, 2yz), which is
  // what makes the normalizers uniform apart from z²'s
  Math.sqrt(15 / (16 * Math.PI)), Math.sqrt(5 / (16 * Math.PI)),
  Math.sqrt(15 / (16 * Math.PI)), Math.sqrt(15 / (16 * Math.PI)), Math.sqrt(15 / (16 * Math.PI)),
];

/** χ(g) for one orbital, in the non-orthogonal AO basis: ψᵀ S D ψ. */
function orbitalCharacter(
  coefficients: number[],
  overlap: number[][],
  d: number[][],
): number {
  const n = coefficients.length;
  // cᵀ S (D c). A coefficient that happens to be zero still belongs in the
  // sum: S couples that AO to its neighbours, and skipping the row drops them.
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let image = 0;
    for (let j = 0; j < n; j++) image += d[i][j] * coefficients[j];
    if (image === 0) continue;
    let bra = 0;
    for (let j = 0; j < n; j++) bra += coefficients[j] * overlap[j][i];
    sum += bra * image;
  }
  return sum;
}

interface Census {
  /** the Schoenflies symbol, which decides which naming rules apply */
  symbol: string;
  /** the order of the principal operation (2n for an S2n group, see below) */
  order: number;
  /** one operation of that order, for its character */
  principalOperation: SymmetryOperation | null;
  /** its axis */
  axis: Vec3;
  /** one C2 perpendicular to that axis, if the group has one */
  perpendicularC2: SymmetryOperation | null;
  /** one mirror containing the axis, if any */
  mirrorParallel: SymmetryOperation | null;
  /** the mirror that fixes every atom — the molecular plane, when there is one */
  molecularPlane: SymmetryOperation | null;
  /** one mirror perpendicular to the axis, if any */
  mirrorPerpendicular: SymmetryOperation | null;
  inversion: SymmetryOperation | null;
  /** cubic groups: a C4 (O, Oh) or an S4 (Td), whose character splits A1 from
   *  A2 and T1 from T2 */
  fourFold: SymmetryOperation | null;
  /** D2 and D2h: the three C2s as Mulliken's z, y and x — null when his
   *  convention cannot decide between them */
  d2Axes: { z: SymmetryOperation; y: SymmetryOperation; x: SymmetryOperation } | null;
}

const CUBIC_GROUPS = new Set(['T', 'Td', 'Th', 'O', 'Oh']);

/** The axis of a rotation (proper or improper): the antisymmetric part gives
 *  it directly, except at 180° where any long column of M + I lies along it. */
function axisOf(op: SymmetryOperation): Vec3 {
  const m = op.matrix;
  const antisymmetric: Vec3 = [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]];
  if (length(antisymmetric) > 1e-9) return unit(antisymmetric);
  const columns: Vec3[] = [
    [m[0][0] + 1, m[1][0], m[2][0]], [m[0][1], m[1][1] + 1, m[2][1]], [m[0][2], m[1][2], m[2][2] + 1],
  ];
  return unit(columns.reduce((best, c) => (length(c) > length(best) ? c : best), columns[0]));
}

function censusOf(operations: SymmetryOperation[], symbol: string): Census {
  const identity = (op: SymmetryOperation) =>
    Math.abs(op.matrix[0][0] - 1) < 1e-6 && Math.abs(op.matrix[1][1] - 1) < 1e-6 && Math.abs(op.matrix[2][2] - 1) < 1e-6
    && Math.abs(op.matrix[0][1]) < 1e-6 && Math.abs(op.matrix[0][2]) < 1e-6 && Math.abs(op.matrix[1][0]) < 1e-6
    && Math.abs(op.matrix[1][2]) < 1e-6 && Math.abs(op.matrix[2][0]) < 1e-6 && Math.abs(op.matrix[2][1]) < 1e-6;

  const trace = (m: number[][]) => m[0][0] + m[1][1] + m[2][2];
  const angle = (op: SymmetryOperation) => {
    const proper = determinant(op.matrix) > 0;
    const cos = Math.max(-1, Math.min(1, (trace(op.matrix) + (proper ? -1 : 1)) / 2));
    return Math.acos(cos);
  };
  let order = 1;
  let principal: SymmetryOperation | null = null;
  let axis: Vec3 = [0, 0, 1];
  const properC2: SymmetryOperation[] = [];
  const mirrors: { op: SymmetryOperation; normal: Vec3 }[] = [];
  const improperRotations: { op: SymmetryOperation; n: number }[] = [];
  let inversion: SymmetryOperation | null = null;
  let c4: SymmetryOperation | null = null;

  for (const op of operations) {
    if (identity(op)) continue;
    const proper = determinant(op.matrix) > 0;
    const theta = angle(op);
    if (proper) {
      const n = Math.round((2 * Math.PI) / theta);
      if (n === 2) properC2.push(op);
      if (n === 4) c4 ??= op;
      if (n > order) { order = n; principal = op; axis = axisOf(op); }
    } else if (Math.abs(theta) < 1e-6) {
      mirrors.push({ op, normal: mirrorNormal(op.matrix) });
    } else if (trace(op.matrix) < -2.9) {
      inversion = op;
    } else {
      improperRotations.push({ op, n: Math.round((2 * Math.PI) / theta) });
    }
  }

  // The cubic groups split A1/A2 and T1/T2 by the four-fold operation: the C4
  // in O and Oh, the S4 in Td, which has no C4. Never the S4 in Oh — its
  // character flips sign between g and u (T1u is −1 under S4, +1 under C4).
  const s4 = improperRotations.find((r) => r.n === 4)?.op ?? null;
  const fourFold = CUBIC_GROUPS.has(symbol) ? c4 ?? s4 : null;

  // In S4, D2d, S8 and D4d the principal axis is an S2n whose C_n is even, and
  // it is the S2n, not the C_n, that tells A from B: allene's b2 is symmetric
  // under the C2 along the C=C=C axis and antisymmetric under the S4 about it.
  // (With an odd C_n — S6, D3d — the S2n is i·C_n and adds nothing.)
  const s2n = improperRotations.find((r) => order % 2 === 0 && r.n === 2 * order);
  if (s2n) {
    order = s2n.n;
    principal = s2n.op;
    axis = axisOf(s2n.op);
  }

  const fixedAtoms = (op: SymmetryOperation) => op.permutation.filter((target, i) => target === i).length;
  // The convention names the axis through the most atoms. Candidates that tie
  // are related by the group's own symmetry — a character is a class function,
  // so any representative of a class gives the same value and the choice is
  // harmless.
  const mostAtoms = <T extends SymmetryOperation>(candidates: T[]): T | null =>
    candidates.length === 0 ? null
      : candidates.reduce((best, op) => (fixedAtoms(op) > fixedAtoms(best) ? op : best));
  const perpendicularC2 = mostAtoms(properC2.filter((op) => Math.abs(dot(axisOf(op), axis)) < 1e-6));
  // A mirror that carries every atom onto itself *is* the molecular plane.
  const molecularPlane = mirrors.find((m) => m.op.permutation.every((target, i) => target === i))?.op ?? null;
  const parallelMirrors = mirrors
    .filter((m) => Math.abs(dot(m.normal, axis)) < 1e-6)
    .map((m) => m.op)
    // the plane that fixes every atom is the molecular plane; the reference is
    // the other one (the convention's σv(xz))
    .filter((op) => op !== molecularPlane);
  // "contains the principal axis" needs an axis: Cs has none, and testing its
  // mirror against the default z gave CHFCl₂ an a1′/a2″ that Cs does not have
  const mirrorParallel = principal ? mostAtoms(parallelMirrors) : null;
  // Cs has no axis at all, so its one mirror is the ′/″ reference wherever it
  // lies — staggered methanol's mirror is not the frame's xy plane
  const mirrorPerpendicular = symbol === 'Cs'
    ? mirrors[0]?.op ?? null
    : mirrors.find((m) => Math.abs(dot(m.normal, axis)) > 1 - 1e-6)?.op ?? null;

  return {
    symbol, order, principalOperation: principal, axis, perpendicularC2,
    mirrorParallel, molecularPlane, mirrorPerpendicular, inversion, fourFold,
    d2Axes: symbol === 'D2' || symbol === 'D2h' ? mullikenD2Axes(properC2, molecularPlane, fixedAtoms) : null,
  };
}

/**
 * D2 and D2h have three equivalent-looking C2 axes, and B1, B2, B3 only mean
 * something once they are named z, y and x. Mulliken's convention (J. Chem.
 * Phys. 23, 1997 (1955)) — the same one water's b1/b2 follow above: for a
 * planar molecule x is perpendicular to the plane, and z is the in-plane axis
 * through the most atoms — ethene's C=C, pyrazine's N···N. So ethene's π is
 * b3u and its π* b2g. A non-planar molecule is ordered the same way by atom
 * count alone. Where the count ties (diborane: two B on one axis, two bridging
 * H on another) the convention has no answer, and neither does this — the
 * label stays a bare b.
 */
function mullikenD2Axes(
  c2s: SymmetryOperation[],
  molecularPlane: SymmetryOperation | null,
  fixedAtoms: (op: SymmetryOperation) => number,
): Census['d2Axes'] {
  if (c2s.length !== 3) return null;
  const byAtoms = [...c2s].sort((a, b) => fixedAtoms(b) - fixedAtoms(a));
  if (molecularPlane) {
    const normal = mirrorNormal(molecularPlane.matrix);
    const x = c2s.find((op) => Math.abs(dot(axisOf(op), normal)) > 1 - 1e-6);
    if (!x) return null;
    const [z, y] = byAtoms.filter((op) => op !== x);
    return fixedAtoms(z) > fixedAtoms(y) ? { z, y, x } : null;
  }
  const [z, y, x] = byAtoms;
  return fixedAtoms(z) > fixedAtoms(y) && fixedAtoms(y) > fixedAtoms(x) ? { z, y, x } : null;
}

/**
 * The Mulliken symbol for one degenerate set, from its characters. Returns the
 * bare letter when the conventions cannot decide a subscript.
 */
function nameSet(
  census: Census,
  dimension: number,
  characterOf: (op: SymmetryOperation | null) => number,
): string {
  const parity = (): string => {
    if (census.inversion) return characterOf(census.inversion) >= 0 ? 'g' : 'u';
    if (census.mirrorPerpendicular) return characterOf(census.mirrorPerpendicular) >= 0 ? "'" : '"';
    return '';
  };

  // The cubic groups have no unique axis, so no B: every one-dimensional set
  // is an A. Subscripts come from the four-fold operation (see censusOf).
  if (CUBIC_GROUPS.has(census.symbol)) {
    const base = dimension === 1 ? 'a' : dimension === 2 ? 'e' : dimension === 3 ? 't' : null;
    if (!base) return '?';
    let subscript = '';
    if (base !== 'e' && census.fourFold) subscript = characterOf(census.fourFold) >= 0 ? '1' : '2';
    return base + subscript + parity();
  }

  // D2 and D2h: A is symmetric under all three C2s; B_k under exactly one —
  // the z axis for B1, y for B2, x for B3 (Mulliken's axes, see mullikenD2Axes)
  if (census.symbol === 'D2' || census.symbol === 'D2h') {
    if (dimension !== 1) return '?';
    const axes = census.d2Axes;
    // symmetric under two of the C2s is symmetric under their product, the third
    const [one, other] = axes ? [axes.z, axes.y] : [census.principalOperation, census.perpendicularC2];
    if (characterOf(one) >= 0 && characterOf(other) >= 0) return 'a' + parity();
    if (!axes) return 'b' + parity();
    const k = characterOf(axes.z) >= 0 ? '1' : characterOf(axes.y) >= 0 ? '2' : '3';
    return 'b' + k + parity();
  }

  const principal = characterOf(census.principalOperation);
  let base: string;
  if (dimension === 1) base = principal >= 0 ? 'a' : 'b';
  else if (dimension === 2) base = 'e';
  else return '?'; // a three-fold set needs a cubic group

  let subscript = '';
  if (base === 'a' || base === 'b') {
    // distinguished by a perpendicular C2, or failing that by the mirror that
    // contains the principal axis
    // The reference operation differs by family, because the conventions do:
    // an axial group with perpendicular C2 axes numbers by one of those (the
    // one through the most atoms), while C2v has none and numbers by the
    // mirror perpendicular to the molecular plane. Both are checked against
    // the tables: benzene's π set comes out a2u/e1g/e2u/b2g, and water's
    // a1/b1 are symmetric under that mirror while a2/b2 are antisymmetric.
    const reference = census.perpendicularC2 ?? census.mirrorParallel;
    if (reference) subscript = characterOf(reference) >= 0 ? '1' : '2';
  } else {
    // numeric subscripts only where a group has more than one E irrep, which
    // for the axial families means floor((n−1)/2) > 1, i.e. n ≥ 5 — where n
    // is the S2n's order in S8 and D4d, whose E1, E2, E3 it numbers
    const eCount = Math.floor((census.order - 1) / 2);
    if (eCount > 1) {
      const k = Math.round((Math.acos(Math.max(-1, Math.min(1, principal / 2))) * census.order) / (2 * Math.PI));
      if (k > 0) subscript = String(k);
    }
  }

  return base + subscript + parity();
}

/** Rotation by `angle` about a unit axis (Rodrigues) — for the operations a
 *  linear molecule's group has infinitely many of, which is why the detection
 *  reports none and this module builds the few it needs. */
function rotationMatrix(axis: Vec3, angle: number): number[][] {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

/**
 * The label of a linear molecule's orbital: |m| along the axis, plus the
 * parity under inversion. Both come from characters, the same way they do for
 * every other group — the operations are built here because a linear molecule
 * has infinitely many and the detector reports none.
 */
function linearLabel(
  molecule: Molecule,
  basis: BasisFunction[],
  setCoefficients: number[][],
  overlap: number[][],
  centrosymmetric: boolean,
): string | null {
  const frame = alignToPrincipalAxes(molecule);
  const atoms = frame.atoms;
  let farthest = atoms[0];
  for (const atom of atoms) {
    const d = length(sub([atom.x, atom.y, atom.z], [atoms[0].x, atoms[0].y, atoms[0].z]));
    const f = length(sub([farthest.x, farthest.y, farthest.z], [atoms[0].x, atoms[0].y, atoms[0].z]));
    if (d > f) farthest = atom;
  }
  const axis = unit(sub([farthest.x, farthest.y, farthest.z], [atoms[0].x, atoms[0].y, atoms[0].z]));

  // every atom lies on the axis, so a rotation about it fixes each one: the
  // permutation is the identity and only the p axes move
  const identity = atoms.map((_, i) => i);
  const c4: SymmetryOperation = { matrix: rotationMatrix(axis, Math.PI / 2), permutation: identity };
  // The linear snap puts the atoms on the axis but does not centre them on the
  // inversion centre, so opposite atoms can sit a few 1e-4 Å off exact
  // opposition — match the *nearest* opposite rather than demanding 1e-6, and
  // with a tolerance that cannot pair the wrong atom (they are Ångströms
  // apart along the axis).
  const inversion: SymmetryOperation = {
    matrix: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]],
    permutation: atoms.map((atom, i) => {
      let best = i;
      let bestDistance = 0.1;
      for (let j = 0; j < atoms.length; j++) {
        if (j === i || atoms[j].element !== atom.element) continue;
        const d = Math.hypot(atoms[j].x + atom.x, atoms[j].y + atom.y, atoms[j].z + atom.z);
        if (d < bestDistance) { bestDistance = d; best = j; }
      }
      return best;
    }),
  };

  // The set's character is d·cos(mπ/2): σ (d=1) → 1, π (d=2) → 0, δ (d=2) → −2
  const d = setCoefficients.length;
  let characterC4 = 0;
  for (const coefficients of setCoefficients) {
    characterC4 += orbitalCharacter(coefficients, overlap, representationMatrix(basis, c4));
  }
  const m = Math.round((Math.acos(Math.max(-1, Math.min(1, characterC4 / d))) * 2) / Math.PI);
  const letter = m === 0 ? 'σ' : m === 1 ? 'π' : m === 2 ? 'δ' : null;
  if (!letter) return null;

  let parity = '';
  if (centrosymmetric) {
    let characterInversion = 0;
    for (const coefficients of setCoefficients) {
      characterInversion += orbitalCharacter(coefficients, overlap, representationMatrix(basis, inversion));
    }
    parity = characterInversion >= 0 ? 'g' : 'u';
  }
  return letter + parity;
}

/**
 * The irrep symbol of every MO, or null where it cannot be determined. All
 * members of a degenerate set share their label.
 */
/** MOs grouped into degenerate sets by energy — the same grouping the
 *  canonicalization uses, and the only level at which a character is
 *  basis-independent. */
function degenerateSets(energies: number[]): number[][] {
  const sets: number[][] = [];
  let i = 0;
  while (i < energies.length) {
    let j = i + 1;
    while (j < energies.length && Math.abs(energies[j] - energies[i]) < CANONICAL_TOLERANCE_EV) j++;
    sets.push(Array.from({ length: j - i }, (_, k) => i + k));
    i = j;
  }
  return sets;
}

export function labelIrreps(
  molecule: Molecule,
  basis: BasisFunction[],
  coefficients: number[][],
  energies: number[],
  overlap: number[][],
): (string | null)[] {
  const labels = new Array<string | null>(coefficients.length).fill(null);
  if (basis.length === 0 || coefficients.length === 0) return labels;

  // Detect on the *framed* molecule: the AO axes are the calculation frame's,
  // so the operations have to be expressed there too. (For a linear molecule
  // the frame's perpendicular axes are arbitrary — which is exactly why the
  // linear path below works from the geometry instead of the operations.)
  const frame = alignToPrincipalAxes(molecule);
  const group = detectPointGroup({ atoms: frame.atoms, bonds: [] });

  if (group.symbol === 'D∞h' || group.symbol === 'C∞v') {
    for (const set of degenerateSets(energies)) {
      // the set's character, divided by its dimension: a degenerate partner's
      // own diagonal character depends on which mixture we happen to hold
      const symbol = linearLabel(molecule, basis, set.map((mo) => coefficients[mo]), overlap, group.symbol === 'D∞h');
      for (const mo of set) labels[mo] = symbol;
    }
    return labels;
  }
  if (group.operations.length <= 1) return labels;

  const census = censusOf(group.operations, group.symbol);

  const matrices = group.operations.map((op) => representationMatrix(basis, op));
  for (const set of degenerateSets(energies)) {
    // the set's character under each operation, summed over its members
    const characters = group.operations.map((_, index) => {
      let sum = 0;
      for (const mo of set) sum += orbitalCharacter(coefficients[mo], overlap, matrices[index]);
      return sum;
    });
    const characterOf = (op: SymmetryOperation | null) => {
      if (!op) return 0;
      const index = group.operations.indexOf(op);
      return index >= 0 ? characters[index] : 0;
    };
    const symbol = nameSet(census, set.length, characterOf);
    for (const mo of set) labels[mo] = symbol;
  }
  return labels;
}
