/**
 * How a molecule is first presented: which way is right, which is up, and
 * which faces the reader. The structure arrives in whatever frame its source
 * used (PubChem, CIR, the embedder), and water came up with its oxygen
 * pointing at the reader — the first move was always to rotate it.
 *
 * The rule (asked for 2026-10-19): the molecule's longest extent runs left
 * to right, its next longest top to bottom, and its thinnest faces the
 * reader, so a planar molecule shows its face. Extents are the principal
 * axes of the atoms' spread (every atom counts the same: water's hydrogens
 * are what make it wide). Three shapes need more than the rule:
 *
 *  - **An oblate top that is not flat** (NH₃, CH₃⁻): its two long axes are
 *    equal and the thin one is its symmetry axis, so the rule would look
 *    straight down the axis — the pyramid end-on, N at the reader, water's
 *    trouble again. It stands on its axis instead, seen from the side.
 *  - **A prolate top** (PCl₅): its long axis across, an atom off the axis up.
 *  - **A spherical top** (CH₄, SF₆, P₄): every direction is as long as every
 *    other. One bond points up and a second lies across the screen — the
 *    textbook wedge-and-dash methane, an axis-aligned octahedron.
 *
 * Each of the three leaves a direction free, and square on its atoms line up
 * one behind another, or one hides behind the centre: they are turned 25°
 * about the vertical and seen from 25° above. A prolate top's axis still runs
 * across the screen — the turn foreshortens it, and shows its equatorial
 * triangle a little face on, where edge on one of the three always sat on P.
 *  - **A linear molecule**: along the screen, with any up across it.
 *
 * Signs: the heavier end goes up and to the right (water's O at the top,
 * H–Cl and CH₃–Cl reading left to right as written).
 */
import { ATOMIC_MASS } from '../chem/assign-mass';
import { jacobiSymmetric } from '../utils/eigen';
import { crossProduct, vecDot, vecNormalize, type Vec3 } from '../utils/vec3';

/** Two spreads within this fraction of the larger are the same length. */
const EQUAL_SPREAD = 0.05;
/** A molecule whose thinnest spread is under this fraction of its widest is flat. */
const FLAT_SPREAD = 0.01;
/** A symmetric molecule is turned this far about the vertical, and seen from
 *  this far above, so no atom hides behind another. Chosen by a scan over
 *  CH₄, SF₆, PCl₅ and NH₃ for the largest smallest on-screen gap between two
 *  atoms: 0.70 Å here, against 0.60 at 15°/20°. */
const SYMMETRIC_TURN_DEG = 25;
const SYMMETRIC_TILT_DEG = 25;

export interface PresentingFrame {
  centre: Vec3;
  /** Screen right, screen up, and toward the reader: a right-handed frame. */
  right: Vec3;
  up: Vec3;
  toward: Vec3;
}

type Placed = { element: string; x: number; y: number; z: number };

export function presentingFrame(atoms: Placed[]): PresentingFrame {
  const n = atoms.length;
  const centre: Vec3 = [0, 0, 0];
  for (const a of atoms) { centre[0] += a.x / n; centre[1] += a.y / n; centre[2] += a.z / n; }
  const offsets = atoms.map((a): Vec3 => [a.x - centre[0], a.y - centre[1], a.z - centre[2]]);
  const masses = atoms.map((a) => ATOMIC_MASS[a.element] ?? 1);
  const fallback: PresentingFrame = { centre, right: [1, 0, 0], up: [0, 1, 0], toward: [0, 0, 1] };
  if (n < 2) return fallback;

  const spread = [0, 1, 2].map((i) => [0, 1, 2].map((j) => offsets.reduce((s, r) => s + r[i] * r[j], 0)));
  const { values, vectors } = jacobiSymmetric(spread); // ascending
  const axis = (k: number): Vec3 => [vectors[0][k], vectors[1][k], vectors[2][k]];
  const [thin, middle, long] = values;
  const same = (a: number, b: number) => Math.abs(a - b) <= EQUAL_SPREAD * Math.max(a, b, 1e-12);

  // A symmetric shape leaves one direction for this function to choose, and
  // square on, that choice lines atoms up one behind another — methane's two
  // lower-left H, PCl₅'s two lower equatorial Cl, NH₃'s two back H. Those
  // shapes are turned about the vertical and seen from a little above.
  let right: Vec3;
  let up: Vec3;
  let turn = 0;
  let tilt = 0;
  if (same(thin, long)) {
    // spherical top: the farthest atom up, the one farthest off that line across
    up = vecNormalize(offsets.reduce((far, r) => (vecDot(r, r) > vecDot(far, far) + 1e-9 ? r : far)));
    right = throughAtom(offsets, up);
    turn = SYMMETRIC_TURN_DEG;
    tilt = SYMMETRIC_TILT_DEG;
  } else if (same(middle, long) && thin > FLAT_SPREAD * long) {
    // an oblate top that is not flat: stand it on its symmetry axis
    up = axis(0);
    right = throughAtom(offsets, up);
    turn = SYMMETRIC_TURN_DEG;
    tilt = SYMMETRIC_TILT_DEG;
  } else if (middle <= FLAT_SPREAD * long) {
    // linear: along the screen
    right = axis(2);
    up = perpendicularTo(right);
  } else if (same(thin, middle)) {
    // a prolate top (PCl₅): its long axis across, an atom off it straight up
    right = axis(2);
    up = throughAtom(offsets, right);
    turn = SYMMETRIC_TURN_DEG;
    tilt = SYMMETRIC_TILT_DEG;
  } else {
    right = axis(2);
    up = axis(1);
  }

  // the heavier end up and to the right; on a tie, keep what the axes gave
  const heavyAlong = (v: Vec3) => offsets.reduce((s, r, i) => s + masses[i] * vecDot(r, v), 0);
  if (heavyAlong(up) < -1e-6) up = up.map((x) => -x) as Vec3;
  if (heavyAlong(right) < -1e-6) right = right.map((x) => -x) as Vec3;

  // the look from above first, about the screen's horizontal, then the turn
  // about the new vertical: in that order the axis across stays level
  const radians = Math.PI / 180;
  const facing = crossProduct(right, up);
  const tiltedUp = up.map((x, k) => Math.cos(tilt * radians) * x - Math.sin(tilt * radians) * facing[k]) as Vec3;
  const tiltedFacing = facing.map((x, k) => Math.cos(tilt * radians) * x + Math.sin(tilt * radians) * up[k]) as Vec3;
  const turnedRight = right.map((x, k) => Math.cos(turn * radians) * x + Math.sin(turn * radians) * tiltedFacing[k]) as Vec3;
  const toward = crossProduct(turnedRight, tiltedUp);
  return { centre, right: vecNormalize(turnedRight), up: vecNormalize(tiltedUp), toward: vecNormalize(toward) };
}

/** The direction from an axis to the atom farthest off it (lowest index on a
 *  tie), perpendicular to the axis: a symmetric molecule's free direction,
 *  pinned to an atom. */
function throughAtom(offsets: Vec3[], axis: Vec3): Vec3 {
  let best: Vec3 | null = null;
  let bestLength = 1e-3;
  for (const r of offsets) {
    const along = vecDot(r, axis);
    const off: Vec3 = [r[0] - along * axis[0], r[1] - along * axis[1], r[2] - along * axis[2]];
    const length = Math.hypot(...off);
    if (length > bestLength + 1e-9) {
      best = off;
      bestLength = length;
    }
  }
  return best ? vecNormalize(best) : perpendicularTo(axis);
}

/** Any unit vector perpendicular to v. */
function perpendicularTo(v: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return vecNormalize(crossProduct(crossProduct(v, helper), v));
}
