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
 * mirror perpendicular to the principal axis. Where a case is ambiguous the
 * label degrades to the bare letter rather than guessing — a wrong label is
 * worse than a partial one.
 *
 * Linear molecules get their own path: their groups have infinitely many
 * operations, so the detector reports none. The label is the character of a
 * C4 about the axis — χ = d·cos(mπ/2) gives σ, π or δ — plus the parity
 * under inversion.
 */
import type { Molecule } from '../../mol-parser';
import type { BasisFunction } from './assign-basis';
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
  /** the order of the highest proper rotation */
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
}

function censusOf(operations: SymmetryOperation[]): Census {
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
  const axisOf = (op: SymmetryOperation): Vec3 => {
    const m = op.matrix;
    const antisymmetric: Vec3 = [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]];
    if (length(antisymmetric) > 1e-9) return unit(antisymmetric);
    const columns: Vec3[] = [
      [m[0][0] + 1, m[1][0], m[2][0]], [m[0][1], m[1][1] + 1, m[2][1]], [m[0][2], m[1][2], m[2][2] + 1],
    ];
    return unit(columns.reduce((best, c) => (length(c) > length(best) ? c : best), columns[0]));
  };

  let order = 1;
  let principal: SymmetryOperation | null = null;
  let axis: Vec3 = [0, 0, 1];
  const properC2: SymmetryOperation[] = [];
  const mirrors: { op: SymmetryOperation; normal: Vec3 }[] = [];
  let inversion: SymmetryOperation | null = null;

  for (const op of operations) {
    if (identity(op)) continue;
    const proper = determinant(op.matrix) > 0;
    const theta = angle(op);
    if (proper) {
      const n = Math.round((2 * Math.PI) / theta);
      if (n === 2) properC2.push(op);
      if (n > order) { order = n; principal = op; axis = axisOf(op); }
    } else if (Math.abs(theta) < 1e-6) {
      mirrors.push({ op, normal: mirrorNormal(op.matrix) });
    } else if (trace(op.matrix) < -2.9) {
      inversion = op;
    }
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
  const mirrorParallel = mostAtoms(parallelMirrors);
  const mirrorPerpendicular = mirrors.find((m) => Math.abs(dot(m.normal, axis)) > 1 - 1e-6)?.op ?? null;
  return {
    order, principalOperation: principal, axis, perpendicularC2,
    mirrorParallel, molecularPlane, mirrorPerpendicular, inversion,
  };
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
  const principal = characterOf(census.principalOperation);
  let base: string;
  if (dimension === 1) base = principal >= 0 ? 'a' : 'b';
  else if (dimension === 2) base = 'e';
  else if (dimension === 3) base = 't';
  else return '?';

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
  } else if (base === 't') {
    // T1/T2 have the same character under every C2, so the σd decides — and
    // with the opposite sense to A1/A2: T2 is the one *symmetric* under σd in
    // both Td and Oh
    if (census.mirrorParallel) subscript = characterOf(census.mirrorParallel) >= 0 ? '2' : '1';
    else if (census.perpendicularC2) subscript = characterOf(census.perpendicularC2) >= 0 ? '2' : '1';
  } else if (base === 'e') {
    // numeric subscripts only where a group has more than one E irrep, which
    // for the axial families means floor((n−1)/2) > 1, i.e. n ≥ 5
    const eCount = Math.floor((census.order - 1) / 2);
    if (eCount > 1) {
      const k = Math.round((Math.acos(Math.max(-1, Math.min(1, principal / 2))) * census.order) / (2 * Math.PI));
      if (k > 0) subscript = String(k);
    }
  }

  let suffix = '';
  if (census.inversion) suffix = characterOf(census.inversion) >= 0 ? 'g' : 'u';
  else if (census.mirrorPerpendicular) suffix = characterOf(census.mirrorPerpendicular) >= 0 ? "'" : '"';
  return base + subscript + suffix;
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

  const census = censusOf(group.operations);

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
