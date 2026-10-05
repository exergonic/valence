/**
 * Point-group symmetry: find the one the geometry *nearly* has, name it, and
 * snap the geometry onto it.
 *
 * Why. The geometry we display is a chemical statement, and a symmetric
 * molecule's should read as symmetric. Every source we have is a little off:
 * measured on the app's benzene, PubChem's MMFF94 conformer spreads its C–C
 * bonds by 0.16 mÅ and holds the ring planar to 0.08 mÅ; our own local
 * pipeline gives 0.08 and 0.18 mÅ — but its atoms still sit 1.1 mÅ from exact
 * D6h, because MMFF94 converges on the energy and a ring's angular positions
 * are a soft mode that costs almost nothing to slide. That is arithmetic, not
 * chemistry: a student looking at benzene expects D6h, and a 1e-4 Å wobble
 * reads as a distorted molecule. WebMO symmetrizes before its MO calculation
 * for the same reason, which is why its degenerate pairs are exactly
 * degenerate and ours were 3e-4 eV apart.
 *
 * Detection is geometric and assumes nothing about which point group a
 * molecule "should" have. Candidate axes and mirror normals come from the
 * atoms themselves — atom directions, pair sums and differences, pair cross
 * products — and an operation is accepted only if it maps every atom onto an
 * atom of the same element within the tolerance. Element identity is the
 * strong guard here: a para-disubstituted ring never gets its two different
 * substituents averaged, because no operation can carry one onto the other.
 * The accepted set is then closed under composition, so averaging over it is
 * a true projection.
 *
 * The tolerance is the whole safety story, and it is measured (see
 * SYMMETRY_TOLERANCE). Two consequences worth stating, because they are what
 * make this safe to leave on:
 *   - an operation is accepted only if it maps *every* atom to within the
 *     tolerance, so a molecule whose true shape is slightly distorted keeps
 *     that shape: the higher-symmetry operations simply fail to match, and
 *     the ones that do match are already exact;
 *   - the projection can therefore never move an atom by much more than the
 *     tolerance, which `maxShift` reports.
 * A geometry with no symmetry at all comes back untouched, as C1.
 *
 * The projection runs to a fixed point. One pass leaves the geometry
 * symmetric only as well as the accepted operations were exact, and they come
 * from noisy candidate directions — ~1 mÅ off, which would split a degenerate
 * pair by ~1e-3 eV, the very thing this feature exists to remove.
 * Re-detecting on the projected geometry finds the same operations exactly
 * (the candidates are clean now) and the next projection lands on the
 * symmetric subspace itself.
 */
import type { Atom, Molecule } from '../mol-parser';

/**
 * Distance (Å) within which an atom counts as mapped onto another. Measured
 * on the app's molecules, the noise we are removing comes in two regimes:
 * stiff coordinates are tight (benzene's C–C bonds spread 0.2 mÅ, its ring is
 * planar to 0.2 mÅ) while soft ones — a ring's angular positions, an O–H
 * torsion — drift to 1–20 mÅ, because MMFF94 converges on the energy and a
 * soft mode costs almost nothing to slide. This is a *permission*, not a
 * force: an operation is only accepted if the geometry already satisfies it
 * this well, so the actual movement is the geometry's own deviation (1 mÅ for
 * benzene, not 20). The margin below real chemistry is a factor of ~2.5: a
 * Jahn–Teller bond difference, a puckered ring, a twisted biaryl are all
 * ≥0.05 Å, and none of our sources (all force-field geometries) produces a
 * meaningful distortion in the 0.005–0.05 Å band.
 */
export const SYMMETRY_TOLERANCE = 0.02;

/** Rotation orders tried about each candidate axis. Six covers everything
 *  the app draws; an eight-fold axis (S8, cyclooctatetraene's D4d) would be
 *  missed, and missing an operation only means a smaller group is found. */
const MAX_ROTATION_ORDER = 6;

/** A group larger than this is not one of ours (Ih has 120); refuse rather
 *  than average a geometry over a set we do not trust. */
const MAX_GROUP_ORDER = 120;

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

interface Operation {
  /** applied to a centroid-relative position */
  m: Mat3;
  /** atom i is carried onto atom perm[i] */
  perm: number[];
}

/** A symmetry operation in the form callers outside this module need: the
 *  matrix acting on centroid-relative positions, and where each atom goes. */
export interface SymmetryOperation {
  matrix: number[][];
  permutation: number[];
}

export interface DetectedPointGroup {
  /** Schoenflies symbol, 'C1' when nothing was found */
  symbol: string;
  /** number of operations (0 for a linear molecule's infinite group) */
  order: number;
  /** the operations, empty for C1 and for the linear groups */
  operations: SymmetryOperation[];
}

export interface SymmetrizedGeometry {
  /** the same atoms, in the same order, with the symmetrized positions */
  atoms: Atom[];
  /** Schoenflies symbol of the detected group — 'C1' when nothing was found */
  symbol: string;
  /** number of operations in the group (1 = geometry untouched) */
  order: number;
  /** largest distance any atom moved (Å) */
  maxShift: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

function unit(a: Vec3): Vec3 {
  const n = length(a);
  return n < 1e-12 ? [0, 0, 0] : scale(a, 1 / n);
}

const applyMat = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  }
  return out;
}

const determinant = (m: Mat3) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/** Rotation by `angle` about the unit `axis` (Rodrigues). */
function rotationMatrix(axis: Vec3, angle: number): Mat3 {
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

/** Reflection in the plane through the origin with unit `normal`. */
function reflectionMatrix(normal: Vec3): Mat3 {
  const [x, y, z] = normal;
  return [
    [1 - 2 * x * x, -2 * x * y, -2 * x * z],
    [-2 * x * y, 1 - 2 * y * y, -2 * y * z],
    [-2 * x * z, -2 * y * z, 1 - 2 * z * z],
  ];
}

const INVERSION: Mat3 = [[-1, 0, 0], [0, -1, 0], [0, 0, -1]];

/**
 * Two operations are "the same" when their matrices agree to 1e-2. That is
 * deliberately loose: the candidate directions include many near-duplicates
 * (the cross product of two nearly-parallel atom vectors is a noisy version
 * of the plane normal), so the operations accepted for one true symmetry
 * element differ from each other by ~1e-3. Compared at 1e-6 they all look
 * new, the composition closure keeps drifting and hits the cap, and every
 * symmetric molecule comes back as C1 — measured, before this threshold was
 * chosen. Genuinely different operations are separated by ~1 (a 60° rotation,
 * a different mirror), so nothing real is merged.
 */
function sameMatrix(a: Mat3, b: Mat3): boolean {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (Math.abs(a[i][j] - b[i][j]) > 1e-2) return false;
  return true;
}

/**
 * The permutation an operation induces, or null if it is not a symmetry: each
 * atom must land on an atom of the same element within `tolerance`. Greedy
 * nearest-neighbour is exact here — the tolerance is 1e-3 Å and bonded atoms
 * are ~1 Å apart, so a match is never ambiguous.
 */
function matchPermutation(
  centered: Vec3[],
  elements: string[],
  m: Mat3,
  tolerance: number,
): number[] | null {
  const n = centered.length;
  const taken = new Array<boolean>(n).fill(false);
  const perm = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const q = applyMat(m, centered[i]);
    let best = -1;
    let bestDistance = Infinity;
    for (let j = 0; j < n; j++) {
      if (taken[j] || elements[j] !== elements[i]) continue;
      const d = length(sub(q, centered[j]));
      if (d < bestDistance) {
        bestDistance = d;
        best = j;
      }
    }
    if (best < 0 || bestDistance > tolerance) return null;
    taken[best] = true;
    perm[i] = best;
  }
  return perm;
}

/**
 * Directions worth testing as rotation axes or mirror normals. Any symmetry
 * element of a molecule passes through the centroid, so directions come from
 * the atom positions themselves: an atom (a C–H bond direction, a ring
 * vertex), the sum of two (a bond midpoint), the difference of two (a
 * bisector), the cross product of two (a plane normal).
 */
function candidateDirections(centered: Vec3[]): Vec3[] {
  const directions: Vec3[] = [];
  const push = (v: Vec3) => {
    if (length(v) < 1e-6) return;
    const u = unit(v);
    // the same direction and its reverse are one candidate; genuinely
    // different axes (even 1e-4 apart) are kept
    for (const d of directions) if (Math.abs(dot(d, u)) > 1 - 1e-9) return;
    directions.push(u);
  };
  for (const p of centered) push(p);
  for (let i = 0; i < centered.length; i++) {
    for (let j = i + 1; j < centered.length; j++) {
      push(add(centered[i], centered[j]));
      push(sub(centered[i], centered[j]));
      push(cross(centered[i], centered[j]));
    }
  }
  return directions;
}

/** The accepted operations for a geometry: candidate directions propose
 *  rotations and mirrors, and each is kept only if it maps every atom onto an
 *  atom of the same element within the tolerance. */
function detectOperations(centered: Vec3[], elements: string[], tolerance: number): Operation[] {
  const seed: Operation[] = [{ m: IDENTITY_MATRIX, perm: centered.map((_, i) => i) }];
  for (const axis of candidateDirections(centered)) {
    for (let order = 2; order <= MAX_ROTATION_ORDER; order++) {
      const m = rotationMatrix(axis, (2 * Math.PI) / order);
      const perm = matchPermutation(centered, elements, m, tolerance);
      if (perm) seed.push({ m, perm });
    }
    const mirror = reflectionMatrix(axis);
    const perm = matchPermutation(centered, elements, mirror, tolerance);
    if (perm) seed.push({ m: mirror, perm });
  }
  const inversionPerm = matchPermutation(centered, elements, INVERSION, tolerance);
  if (inversionPerm) seed.push({ m: INVERSION, perm: inversionPerm });
  return seed;
}

/** Close the accepted operations under composition. Permutations compose
 *  exactly (they are index maps), so a composed operation needs no re-match:
 *  its residual is bounded by the residuals it came from. */
function closeGroup(seed: Operation[]): Operation[] | null {
  const group: Operation[] = [];
  const add = (op: Operation) => {
    for (const g of group) if (sameMatrix(g.m, op.m)) return false;
    group.push(op);
    return true;
  };
  for (const op of seed) add(op);
  for (let round = 0; round < 10; round++) {
    const current = [...group];
    let grew = false;
    for (const a of current) {
      for (const b of current) {
        // b first, then a: atom i -> perm_b[i] -> perm_a[perm_b[i]]
        const m = multiply(a.m, b.m);
        const perm = b.perm.map((j) => a.perm[j]);
        if (add({ m, perm })) grew = true;
        if (group.length > MAX_GROUP_ORDER) return null;
      }
    }
    if (!grew) return group;
  }
  return group;
}

/** The axis a proper rotation turns about: the antisymmetric part gives it
 *  directly, except at 180° where the matrix is symmetric and any column of
 *  (M + I) is parallel to the axis. */
function rotationAxis(m: Mat3): Vec3 {
  const antisymmetric: Vec3 = [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]];
  if (length(antisymmetric) > 1e-9) return unit(antisymmetric);
  const columns: Vec3[] = [
    [m[0][0] + 1, m[1][0], m[2][0]],
    [m[0][1], m[1][1] + 1, m[2][1]],
    [m[0][2], m[1][2], m[2][2] + 1],
  ];
  return unit(columns.reduce((best, c) => (length(c) > length(best) ? c : best), columns[0]));
}

/** Rotation angle of an operation: for a proper rotation the trace is
 *  1 + 2cosθ, for an improper one (S_n = σ·C_n) it is 2cosθ - 1. */
function rotationAngle(m: Mat3): number {
  const trace = m[0][0] + m[1][1] + m[2][2];
  const proper = determinant(m) > 0;
  const cos = Math.max(-1, Math.min(1, (trace + (proper ? -1 : 1)) / 2));
  return Math.acos(cos);
}

/**
 * Normal of a reflection. M − I = −2nnᵀ, so every column is parallel to n
 * and the long one is n itself. The first column is zero when n is
 * perpendicular to x — any mirror standing on the yz plane, including the
 * plane of a ring that the calculation frame has laid in xy — and reading
 * only that column reports the normal as zero. Benzene then loses σh and
 * is named D6d.
 */
export function mirrorNormal(matrix: number[][]): Vec3 {
  let best: Vec3 = [0, 0, 0];
  for (let col = 0; col < 3; col++) {
    const column: Vec3 = [matrix[0][col], matrix[1][col], matrix[2][col]];
    column[col] -= 1;
    if (length(column) > length(best)) best = column;
  }
  return unit(best);
}

/** Schoenflies symbol from the census of the closed group. */
function symbolOf(group: Operation[]): string {
  if (group.length === 1) return 'C1';
  // Order 2 is E plus one other operation, and all three possibilities have no
  // principal axis to hang anything on: a proper rotation (C2, a skewed H2O2),
  // a mirror (Cs) or the inversion (Ci). Searching for the *improper* member —
  // as this did — finds nothing for a pure C2 and falls through to 'Cs', so a
  // C2-only molecule was labelled with a mirror it does not have.
  if (group.length === 2) {
    const only = group.find((op) => !sameMatrix(op.m, IDENTITY_MATRIX));
    if (!only) return 'C1';
    if (determinant(only.m) > 0) return 'C2';
    return sameMatrix(only.m, INVERSION) ? 'Ci' : 'Cs';
  }

  let highestOrder = 1;
  let highestAxis: Vec3 = [0, 0, 1];
  const properC2: Vec3[] = [];
  let c3Count = 0;
  let c4Count = 0;
  let inversion = false;
  const mirrorNormals: Vec3[] = [];

  for (const op of group) {
    const proper = determinant(op.m) > 0;
    const angle = rotationAngle(op.m);
    if (proper) {
      const order = angle < 1e-6 ? 1 : Math.round((2 * Math.PI) / angle);
      if (order === 3) c3Count++;
      if (order === 4) c4Count++;
      if (order === 2) properC2.push(rotationAxis(op.m));
      if (order > highestOrder) {
        highestOrder = order;
        highestAxis = rotationAxis(op.m);
      }
    } else if (sameMatrix(op.m, INVERSION)) {
      inversion = true;
    } else if (angle < 1e-6) {
      // trace 1, improper: a pure mirror. See mirrorNormal for why this is
      // not "the first column".
      mirrorNormals.push(mirrorNormal(op.m));
    }
  }

  // the cubic families are recognized by their four three-fold axes (8 C3
  // operations: two per axis), which no axial group has
  if (c3Count >= 8) {
    if (c4Count >= 6) return inversion ? 'Oh' : 'O';
    if (mirrorNormals.length > 0) return inversion ? 'Th' : 'Td';
    return inversion ? 'Th' : 'T';
  }

  const perpendicularC2 = properC2.filter((axis) => Math.abs(dot(axis, highestAxis)) < 1e-6).length;
  const hasSigmaH = mirrorNormals.some((normal) => Math.abs(dot(normal, highestAxis)) > 1 - 1e-6);
  const hasSigmaV = mirrorNormals.some((normal) => Math.abs(dot(normal, highestAxis)) < 1e-6);
  // Improper *rotations* only: a pure mirror has angle 0, and dividing by the
  // 1e-6 floor below would print it as "S6283185". A mirror always lies either
  // in or perpendicular to the principal axis, so hasSigmaH/hasSigmaV catch it
  // first and this branch is unreachable with one — but the guard is free.
  const improperOrders = group
    .filter((op) => determinant(op.m) < 0 && !sameMatrix(op.m, INVERSION) && rotationAngle(op.m) > 1e-6)
    .map((op) => Math.round((2 * Math.PI) / rotationAngle(op.m)));
  const improperMax = improperOrders.length > 0 ? Math.max(...improperOrders) : 0;

  // D2d (allene) has three C2s and only one of them is special: the one an S4
  // shares. Taking whichever C2 came first as the principal axis could pick a
  // perpendicular one, against which the σd are neither σh nor σv, and the
  // group came out D2. When C2 is the highest proper rotation, an S4's axis is
  // the principal one.
  if (highestOrder === 2) {
    const s4 = group.find((op) => determinant(op.m) < 0 && !sameMatrix(op.m, INVERSION)
      && rotationAngle(op.m) > 1e-6 && Math.round((2 * Math.PI) / rotationAngle(op.m)) === 4);
    if (s4) highestAxis = rotationAxis(s4.m); // an S4's antisymmetric part lies along its axis too
  }

  if (perpendicularC2 > 0) {
    if (hasSigmaH) return `D${highestOrder}h`;
    if (hasSigmaV) return `D${highestOrder}d`;
    return `D${highestOrder}`;
  }
  if (hasSigmaH) return `C${highestOrder}h`;
  if (hasSigmaV) return `C${highestOrder}v`;
  if (improperMax > 0) return `S${improperMax}`;
  return `C${highestOrder}`;
}

const IDENTITY_MATRIX: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/**
 * The closed group of the operations a geometry nearly has, at `tolerance` —
 * or, when those operations will not close, at a tighter one.
 *
 * A real optimised structure carries a few mÅ of noise, and at the full
 * tolerance it admits many near-duplicate operations about slightly different
 * axes (candidate axes come from atom positions, each a little off); their
 * products never close, the group overflows MAX_GROUP_ORDER, and the molecule
 * came out C1. Measured on GFN2's pyridine (planar to 8 mÅ, its paired bonds
 * equal to 1 mÅ): 54 seed operations, no closure, "C1" — while its heavy atoms
 * alone closed to C2v. Halving the tolerance drops the stray near-duplicates
 * and keeps the true operations, which hold to the structure's own noise.
 */
function detectGroup(centered: Vec3[], elements: string[], tolerance: number): Operation[] | null {
  for (let t = tolerance; t >= tolerance / 8; t /= 2) {
    const group = closeGroup(detectOperations(centered, elements, t));
    if (group) return group;
  }
  return null;
}

/**
 * Detect the point group of a geometry without touching it. The same machinery
 * `symmetrizeMolecule` runs, exposed for callers that need the operations
 * themselves — the irrep labels are built from them (see
 * chem/extended-huckel/irrep-labels.ts).
 *
 * The operations act on centroid-relative coordinates in the molecule's own
 * frame, so a caller working in the calculation frame should pass the *framed*
 * atoms (see alignToPrincipalAxes) rather than the molecule as displayed.
 */
export function detectPointGroup(
  molecule: Molecule,
  tolerance = SYMMETRY_TOLERANCE,
): DetectedPointGroup {
  const { atoms } = molecule;
  if (atoms.length < 2) return { symbol: 'C1', order: 1, operations: [] };

  const centroid: Vec3 = [0, 0, 0];
  for (const a of atoms) {
    centroid[0] += a.x / atoms.length;
    centroid[1] += a.y / atoms.length;
    centroid[2] += a.z / atoms.length;
  }
  const centered = atoms.map((a): Vec3 => [a.x - centroid[0], a.y - centroid[1], a.z - centroid[2]]);
  const elements = atoms.map((a) => a.element);

  // a linear molecule's group is infinite: report it and stop
  const farthest = centered.reduce((best, q) => (length(q) > length(best) ? q : best), centered[0]);
  const along = unit(farthest);
  if (length(along) > 0 && centered.every((p) => length(cross(p, along)) <= tolerance)) {
    let centrosymmetric = true;
    for (let i = 0; i < centered.length; i++) {
      const mirrored = scale(centered[i], -1);
      if (!centered.some((q, j) => elements[j] === elements[i] && length(sub(mirrored, q)) <= tolerance)) {
        centrosymmetric = false;
      }
    }
    return { symbol: centrosymmetric ? 'D∞h' : 'C∞v', order: 0, operations: [] };
  }

  const group = detectGroup(centered, elements, tolerance);
  if (!group || group.length <= 1) return { symbol: 'C1', order: 1, operations: [] };
  return {
    symbol: symbolOf(group),
    order: group.length,
    operations: group.map((op) => ({ matrix: op.m.map((row) => [...row]), permutation: [...op.perm] })),
  };
}

/**
 * Detect the point group the geometry nearly has and project the geometry
 * onto it. `molecule` is not modified; the returned atoms are the same
 * elements in the same order with symmetrized coordinates.
 */
export function symmetrizeMolecule(
  molecule: Molecule,
  tolerance = SYMMETRY_TOLERANCE,
): SymmetrizedGeometry {
  const { atoms } = molecule;
  const unchanged: SymmetrizedGeometry = { atoms, symbol: 'C1', order: 1, maxShift: 0 };
  if (atoms.length < 2) return unchanged;

  const centroid: Vec3 = [0, 0, 0];
  for (const a of atoms) {
    centroid[0] += a.x / atoms.length;
    centroid[1] += a.y / atoms.length;
    centroid[2] += a.z / atoms.length;
  }
  const centered = atoms.map((a): Vec3 => [a.x - centroid[0], a.y - centroid[1], a.z - centroid[2]]);
  const elements = atoms.map((a) => a.element);

  // A linear molecule's group has infinitely many operations, and the useful
  // snap is simply "make the atoms collinear" — so project onto the best-fit
  // axis directly rather than enumerating rotations that all mean the same
  // thing. The inversion decides D∞h from C∞v.
  const farthest = centered.reduce((best, q) => (length(q) > length(best) ? q : best), centered[0]);
  const along = unit(farthest);
  if (length(along) > 0 && centered.every((p) => length(cross(p, along)) <= tolerance)) {
    const onAxis = centered.map((p) => scale(along, dot(p, along)));
    let maxShift = 0;
    const out = atoms.map((atom, i) => {
      const shifted = add(onAxis[i], centroid);
      maxShift = Math.max(maxShift, length(sub(shifted, [atom.x, atom.y, atom.z])));
      return { ...atom, x: shifted[0], y: shifted[1], z: shifted[2] };
    });
    let centrosymmetric = true;
    for (let i = 0; i < centered.length; i++) {
      const mirrored = scale(centered[i], -1);
      const hit = centered.some((q, j) => elements[j] === elements[i] && length(sub(mirrored, q)) <= tolerance);
      if (!hit) centrosymmetric = false;
    }
    return { atoms: out, symbol: centrosymmetric ? 'D∞h' : 'C∞v', order: 2, maxShift };
  }

  let detected = detectGroup(centered, elements, tolerance);
  if (!detected || detected.length === 1) return unchanged;

  let current = centered;
  for (let pass = 0; pass < 4; pass++) {
    const accumulated = current.map((): Vec3 => [0, 0, 0]);
    for (const op of detected) {
      for (let i = 0; i < current.length; i++) {
        const q = applyMat(op.m, current[i]);
        const j = op.perm[i];
        accumulated[j][0] += q[0];
        accumulated[j][1] += q[1];
        accumulated[j][2] += q[2];
      }
    }
    let shift = 0;
    const projected = current.map((p, i) => {
      const averaged = scale(accumulated[i], 1 / detected!.length);
      shift = Math.max(shift, length(sub(averaged, p)));
      return averaged;
    });
    current = projected;
    if (shift < 1e-9) break;
    const again = detectGroup(current, elements, tolerance);
    if (!again || again.length === 1) break;
    detected = again;
  }

  let maxShift = 0;
  const out = atoms.map((atom, i) => {
    const shifted = add(current[i], centroid);
    maxShift = Math.max(maxShift, length(sub(shifted, [atom.x, atom.y, atom.z])));
    return { ...atom, x: shifted[0], y: shifted[1], z: shifted[2] };
  });

  return { atoms: out, symbol: symbolOf(detected), order: detected.length, maxShift };
}
