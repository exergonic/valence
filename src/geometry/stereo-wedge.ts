import type { Molecule } from '../mol-parser';

type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Which enantiomer is this? The signed volume of the wedged atom with two of
 * the center's plain neighbors: positive when the triple (n1, n2, wedged) is
 * right-handed around the center, negative when it is the mirror image. A
 * rotation leaves it alone, a reflection flips it, and — the reason this
 * particular triple is used — swapping the positions of two substituents flips
 * it too, which is exactly how the configuration is inverted below.
 *
 * (A triple built from the three *plain* neighbors looks like a chirality
 * label but is not: for a near-regular tetrahedron all four choices of three
 * substituents share a sign, so it cannot tell an inverted center from an
 * untouched one.)
 */
export function chiralitySign(pos: Vec3[], center: number, n1: number, n2: number, wedged: number): number {
  const c = pos[center];
  return sign(dot(cross(sub(pos[n1], c), sub(pos[n2], c)), sub(pos[wedged], c)));
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
 * 12236140) — see tests/stereo-wedge.test.ts.
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
    const c = at(center);
    const cross2d = (i: number, j: number) =>
      (at(i).x - c.x) * (at(j).y - c.y) - (at(i).y - c.y) * (at(j).x - c.x);
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

    // Invert the center by swapping the wedged branch with the first plain
    // branch — the textbook operation. Each branch moves as a rigid body, so no
    // bond is stretched, the rest of the molecule keeps its geometry, and any
    // stereocenter nested inside a branch is untouched (translation cannot
    // change a configuration).
    const branchA = collect(adj, wedged, center);
    const branchB = collect(adj, n1, center);
    const deltaA = sub(pos[n1], pos[wedged]);
    const deltaB = sub(pos[wedged], pos[n1]);
    for (const i of branchA) pos[i] = add(pos[i], deltaA);
    for (const i of branchB) pos[i] = add(pos[i], deltaB);
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
