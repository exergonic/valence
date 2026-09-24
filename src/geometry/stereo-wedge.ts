import type { Molecule } from '../mol-parser';
import { vecSub, vecDot, crossProduct, vecNormalize, rotateRodrigues, findPerpendicular } from '../utils/vec3';

type Vec3 = [number, number, number];

const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Which enantiomer is this? The signed volume of the wedged atom with two of
 * the center's plain neighbors: positive when the triple (n1, n2, wedged) is
 * right-handed around the center, negative when it is the mirror image. A
 * rotation leaves it alone, and moving the wedged atom across the plane through
 * the center and those two neighbors flips it — exactly, because the sign is
 * just the wedged vector's component along (n1-c) x (n2-c).
 *
 * (A triple built from the three *plain* neighbors looks like a chirality
 * label but is not: for a near-regular tetrahedron all four choices of three
 * substituents share a sign, so it cannot tell an inverted center from an
 * untouched one.)
 */
export function chiralitySign(pos: Vec3[], center: number, n1: number, n2: number, wedged: number): number {
  const c = pos[center];
  return sign(vecDot(crossProduct(vecSub(pos[n1], c), vecSub(pos[n2], c)), vecSub(pos[wedged], c)));
}

/**
 * Put the drawn wedge and hash bonds onto a 3D seed.
 *
 * A sketcher's wedge means "this atom is in front of the page, the plain bonds
 * are in it, the undrawn one is behind" — which fixes the configuration. The
 * graph-walk embedder knows nothing about that, so it can hand back either
 * enantiomer: a drawn (S)-2-bromobutane used to come out identical to the (R)
 * drawing, both of them (R). This runs after placement and inverts any center
 * whose configuration disagrees with the sketch.
 *
 * The required configuration is read off the drawing: the 2D cross product of
 * two plain neighbors around the center is the page-plane reference, and the
 * wedge flag says which side the wedged atom is on. Calibrated against
 * PubChem's own 3D conformers of (R)- and (S)-2-bromobutane (CIDs 637147 and
 * 12236140) and L-alanine — see tests/stereo-wedge.test.ts.
 */
export function applyWedgeStereo(molecule: Molecule, pos: Vec3[]): void {
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
  }

  for (const bond of molecule.bonds) {
    const flag = bond.stereo;
    if (flag !== 1 && flag !== 6) continue;
    const center = bond.atom1Index; // the narrow end of the wedge
    const wedged = bond.atom2Index;

    // A tetrahedral center has exactly three other neighbors. Two wedges on one
    // center, or a non-tetrahedral center, is out of scope — leave it alone.
    const plain = adj[center].filter((nb) => nb !== wedged).sort((a, b) => a - b);
    if (plain.length !== 3) continue;

    // The page-plane reference comes from two neighbors whose sketched
    // positions are non-degenerate. Hydrogens added by fillMissingHydrogens sit
    // on top of their parent, so their drawn position carries no direction —
    // skip such pairs. Index order keeps the choice deterministic, which is
    // what the calibration above assumed.
    const at = (i: number) => molecule.atoms[i];
    const c2d = at(center);
    const cross2d = (i: number, j: number) =>
      (at(i).x - c2d.x) * (at(j).y - c2d.y) - (at(i).y - c2d.y) * (at(j).x - c2d.x);
    let n1 = -1;
    let n2 = -1;
    outer: for (let i = 0; i < plain.length; i++) {
      for (let j = i + 1; j < plain.length; j++) {
        if (cross2d(plain[i], plain[j]) !== 0) {
          n1 = plain[i];
          n2 = plain[j];
          break outer;
        }
      }
    }
    if (n1 < 0 || n2 < 0) continue;

    // Skip anything the embedder never placed.
    if ([center, wedged, n1, n2].some((i) => !pos[i])) continue;

    const reference = sign(cross2d(n1, n2));
    // A wedge puts the wedged atom in front of the page, a hash behind it; that
    // sign flip is what makes (R) and (S) differ. The polarity is calibrated
    // against PubChem's 3D conformers — a wedge requires +reference, a hash
    // -reference (see tests/stereo-wedge.test.ts).
    const required = flag === 1 ? reference : -reference;
    if (chiralitySign(pos, center, n1, n2, wedged) === required) continue;

    // Invert the center by turning the wedged branch so the wedged atom lands
    // on the mirror of its current direction through the plane spanned by the
    // center and its two reference neighbors. That flips the sign exactly —
    // the sign is the wedged vector's component along (n1-c) x (n2-c), so
    // negating that component negates the sign, whatever the center's shape.
    // (Mirroring through the plane of the other three *atoms* instead is only
    // equivalent while the center is ideal, and can leave a distorted center
    // inverted. And a rotation keeps the branch rigid, so nested stereocenters
    // survive and nothing else in the molecule moves.
    //
    // Swapping two branches instead (the other obvious option) is catastrophic
    // in a ring: "the branch on the other side" is reachable the long way
    // round, so it is the entire rest of the ring, and the swap translates it
    // rigidly — a drawn all-cis hexol came back with ring bonds of 5.06 Å.)
    const branch = collect(adj, wedged, center);
    // The inversion is a local operation only while the wedged atom is
    // terminal. If a plain neighbor sits inside the branch, turning the branch
    // would carry that neighbor along — a rigid motion of everything but the
    // center, which leaves the configuration exactly as it was. A wedge drawn
    // on a ring bond is such a center; it is left alone rather than mangled.
    if (plain.some((nb) => branch.includes(nb))) continue;

    const c = pos[center];
    const v = vecSub(pos[wedged], c);
    const normal = vecNormalize(crossProduct(vecSub(pos[n1], c), vecSub(pos[n2], c)));
    const mirrored = vecSub(v, scale(normal, 2 * vecDot(v, normal)));
    let axis = crossProduct(v, mirrored);
    let angle = Math.atan2(length(axis), vecDot(v, mirrored));
    if (length(axis) < 1e-9) {
      // The wedged bond lies along the plane normal, so the mirror is exactly
      // the opposite direction: any perpendicular axis turns it around.
      axis = findPerpendicular(v);
      angle = Math.PI;
    }
    const axisHat = vecNormalize(axis);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    for (const i of branch) {
      pos[i] = add(c, rotateRodrigues(vecSub(pos[i], c), axisHat, cosA, sinA));
    }
  }
}

/** Atoms reachable from `start` without passing through `block`. */
function collect(adj: number[][], start: number, block: number): number[] {
  const seen = new Set<number>([start, block]);
  const queue = [start];
  const out: number[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    out.push(curr);
    for (const nb of adj[curr]) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      queue.push(nb);
    }
  }
  return out;
}
