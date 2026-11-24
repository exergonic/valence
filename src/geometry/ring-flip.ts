/**
 * Flipping a ring by hand: the Structure view's chair flip (decided with the
 * user 2026-11-24). A six-membered ring in a chair has a second chair, reached
 * by a ring flip, in which every axial substituent is equatorial and every
 * equatorial one axial — while each group stays on its own face of the ring,
 * so cis stays cis and every configuration is kept. That is the textbook
 * picture of polysubstituted cyclohexanes, and it is how the other chair is
 * built here:
 *
 * - the ring is reflected through its own mean plane, which turns its pucker
 *   over (each torsion changes sign) and leaves its outline, seen from above,
 *   where it was;
 * - each substituent then takes the open tetrahedral slot on the same face of
 *   its ring atom — up stays up — carrying its whole group with it rigidly.
 *
 * The result is a start, not a minimum: the panel relaxes it with GFN2-xTB.
 *
 * Only a ring on its own flips. A ring fused to another flips with it (and a
 * trans-fused pair, trans-decalin, not at all), a bridge holds a ring in one
 * shape (norbornane's six-membered ring is a boat), and a ring with a double
 * bond or an aromatic one has no two chairs: each is refused with the reason.
 */
import type { Molecule } from '../mol-parser';
import { getLonePairDirections } from '../chem/vsepr/orient-lone-pairs';
import { ringBonds } from './place3d';
import { atomName } from './torsion';
import { crossProduct, dihedralAngle, rotateRodrigues, vecDot, vecLength, vecNormalize, vecSub, type Vec3 } from '../utils/vec3';

/** A ring torsion smaller than this (degrees) is not a chair's: a chair's are
 *  about ±55°, and a flat or half-chair stretch of ring is near 0°. */
const CHAIR_TORSION = 30;

const position = (molecule: Molecule, i: number): Vec3 => {
  const atom = molecule.atoms[i];
  return [atom.x, atom.y, atom.z];
};

function neighbours(molecule: Molecule): number[][] {
  const list: number[][] = molecule.atoms.map(() => []);
  for (const bond of molecule.bonds) {
    list[bond.atom1Index].push(bond.atom2Index);
    list[bond.atom2Index].push(bond.atom1Index);
  }
  return list;
}

/** The six-membered rings, each as its atoms in order round the ring. */
export function sixMemberedRings(molecule: Molecule): number[][] {
  const adjacent = neighbours(molecule);
  const rings: number[][] = [];
  // each ring found once: from its lowest atom, in the direction of the lower
  // of that atom's two ring neighbours
  const walk = (path: number[]) => {
    const last = path[path.length - 1];
    if (path.length === 6) {
      if (adjacent[last].includes(path[0]) && path[1] < path[5]) rings.push([...path]);
      return;
    }
    for (const next of adjacent[last]) {
      if (next > path[0] && !path.includes(next)) walk([...path, next]);
    }
  };
  for (let start = 0; start < molecule.atoms.length; start++) walk([start]);
  return rings;
}

/** The ring's six torsions, degrees, each about the bond ring[k]–ring[k+1]. */
export function ringTorsions(molecule: Molecule, ring: number[]): number[] {
  const p = (k: number) => position(molecule, ring[(k + 6) % 6]);
  return ring.map((_, k) => dihedralAngle(p(k - 1), p(k), p(k + 1), p(k + 2)) * 180 / Math.PI);
}

/** A chair: its torsions alternate in sign, each well away from flat. */
export function isChair(molecule: Molecule, ring: number[]): boolean {
  const torsions = ringTorsions(molecule, ring);
  return torsions.every((t, k) => Math.abs(t) >= CHAIR_TORSION && Math.sign(t) !== Math.sign(torsions[(k + 1) % 6]));
}

/** The ring's centre and the normal to its mean plane (the sum of the turns
 *  round it, which a pucker does not tilt). */
function meanPlane(molecule: Molecule, ring: number[]): { centre: Vec3; normal: Vec3 } {
  const points = ring.map((i) => position(molecule, i));
  const centre = [0, 1, 2].map((c) => points.reduce((s, p) => s + p[c], 0) / 6) as Vec3;
  const normal: Vec3 = [0, 0, 0];
  points.forEach((p, k) => {
    const turn = crossProduct(vecSub(p, centre), vecSub(points[(k + 1) % 6], centre));
    for (let c = 0; c < 3; c++) normal[c] += turn[c];
  });
  return { centre, normal: vecNormalize(normal) };
}

/** Where a substituent sits on a chair: axial or equatorial, and on which
 *  face of the ring (+1 or −1 along its mean-plane normal; the sign means
 *  something only against another substituent of the same ring). */
export interface RingPosition {
  ringAtom: number;
  substituent: number;
  axial: boolean;
  face: 1 | -1;
}

/**
 * The two slots a chair's ring atom offers its substituents — the open
 * tetrahedral directions its two ring bonds leave, one on each face, the one
 * nearer the ring's normal axial — and which substituent sits in which: the
 * uppermost in the upper slot. Read this way rather than by each bond's own
 * angle, a structure whose hydrogens are off their ideal directions (the
 * embedder's start puts some 33° off) is still read right, and the flip moves
 * each substituent from the slot it is read in.
 */
function slotsAt(
  atoms: Vec3[], adjacent: number[][], ring: number[], k: number, normal: Vec3,
): { substituent: number; slot: Vec3; axial: boolean; face: 1 | -1 }[] {
  const r = ring[k];
  const bonds = [ring[(k + 5) % 6], ring[(k + 1) % 6]].map((n) => vecSub(atoms[n], atoms[r]));
  // a saturated ring atom has four electron domains: two ring bonds, and two
  // slots for its substituents or lone pairs
  const height = (v: Vec3) => vecDot(v, normal);
  const slots = getLonePairDirections(bonds, 4).sort((a, b) => height(b) - height(a));
  const axialSlot = Math.abs(height(slots[0])) > Math.abs(height(slots[1])) ? 0 : 1;
  const substituents = adjacent[r].filter((s) => !ring.includes(s))
    .sort((s, t) => height(vecSub(atoms[t], atoms[r])) - height(vecSub(atoms[s], atoms[r])));
  // one substituent (an N–H beside its lone pair) takes the slot on its own face
  const lone = substituents.length === 1 && height(vecSub(atoms[substituents[0]], atoms[r])) < 0;
  return substituents.map((substituent, i) => {
    const index = lone ? 1 : i;
    return { substituent, slot: slots[index], axial: index === axialSlot, face: index === 0 ? 1 : -1 };
  });
}

/** Every substituent on every saturated six-membered ring that is a chair
 *  now, fused or not: the Axial / equatorial labels' reading. */
export function chairPositions(molecule: Molecule): RingPosition[] {
  const adjacent = neighbours(molecule);
  const atoms = molecule.atoms.map((_, i) => position(molecule, i));
  const positions: RingPosition[] = [];
  for (const ring of sixMemberedRings(molecule)) {
    if (!saturated(molecule, ring) || !isChair(molecule, ring)) continue;
    const { normal } = meanPlane(molecule, ring);
    ring.forEach((ringAtom, k) => {
      for (const { substituent, axial, face } of slotsAt(atoms, adjacent, ring, k, normal)) {
        positions.push({ ringAtom, substituent, axial, face });
      }
    });
  }
  return positions;
}

function saturated(molecule: Molecule, ring: number[]): boolean {
  return !molecule.bonds.some((b) => b.order !== 1 && (ring.includes(b.atom1Index) || ring.includes(b.atom2Index)));
}

/** "C1–C2–C3–C4–C5–C6", from the ring's lowest-numbered atom. */
export function ringName(molecule: Molecule, ring: number[]): string {
  return ring.map((i) => atomName(molecule, i)).join('–');
}

/**
 * The ring through `atom` that can flip, or why there is none: the atom is in
 * no six-membered ring, or its ring has a double bond, is fused, bridged or
 * spiro, or is not a chair now.
 */
export function ringToFlip(molecule: Molecule, atom: number): { ring: number[] } | { refusal: string } {
  const name = atomName(molecule, atom);
  const rings = sixMemberedRings(molecule).filter((ring) => ring.includes(atom));
  if (rings.length === 0) {
    return { refusal: `${name} is not in a six-membered ring. Flip a ring turns a six-membered ring from one chair to the other.` };
  }
  const ring = rings[0];
  if (!saturated(molecule, ring)) {
    return { refusal: `${name}’s ring has a double bond or is aromatic, so it is not a chair: it has no two chairs to flip between.` };
  }
  // the ring bonds that leave the ring: none, for a ring on its own
  const keys = ringBonds(molecule);
  const leaving = [...keys].map((key) => key.split('-').map(Number))
    .filter(([i, j]) => ring.includes(i) !== ring.includes(j));
  const inside = [...keys].map((key) => key.split('-').map(Number))
    .filter(([i, j]) => ring.includes(i) && ring.includes(j)).length;
  if (inside > 6 || leaving.length > 0) {
    const shared = new Set(leaving.map(([i, j]) => (ring.includes(i) ? i : j)));
    const adjacentPair = shared.size === 2 && [...shared].every((s) => {
      const k = ring.indexOf(s);
      return [...shared].some((t) => t !== s && (ring[(k + 1) % 6] === t || ring[(k + 5) % 6] === t));
    });
    if (shared.size === 1) {
      return { refusal: `${name}’s ring shares an atom with another ring. Flip a ring turns a ring on its own for now.` };
    }
    if (adjacentPair) {
      return { refusal: `${name}’s ring is fused to another: a ring flip would turn both together, and a trans-fused pair `
        + '(trans-decalin) cannot flip at all. Flip a ring turns a ring on its own for now.' };
    }
    return { refusal: `${name}’s ring is bridged: the bridge holds it in one shape (norbornane’s six-membered ring is a `
      + 'boat), so it cannot flip.' };
  }
  if (!isChair(molecule, ring)) {
    return { refusal: `${name}’s ring is not a chair now — a boat, twist or flattened ring — so there is no other chair to `
      + 'flip it to. Optimising it may bring it to a chair.' };
  }
  return { ring };
}

/**
 * The ring's other chair, as a start: the ring reflected through its mean
 * plane, each substituent moved to the open slot on its own face, its group
 * carried rigidly. Every bond length is kept, and so is every configuration.
 */
export function flipChair(molecule: Molecule, ring: number[]): Molecule {
  const adjacent = neighbours(molecule);
  const { centre, normal } = meanPlane(molecule, ring);
  const old = molecule.atoms.map((_, i) => position(molecule, i));
  const next = old.map((p) => [...p] as Vec3);
  for (const r of ring) {
    const height = vecDot(vecSub(old[r], centre), normal);
    next[r] = [0, 1, 2].map((c) => old[r][c] - 2 * height * normal[c]) as Vec3;
  }
  ring.forEach((r, k) => {
    // each substituent leaves the slot it is read in for the new chair's slot
    // on the same face: taken one by one, by the face each bond points to, a
    // CH₂ whose equatorial H the embedder built level with the ring sent both
    // H's to one slot
    const height = (v: Vec3) => vecDot(v, normal);
    const bonds = [ring[(k + 5) % 6], ring[(k + 1) % 6]].map((n) => vecSub(next[n], next[r]));
    const slots = getLonePairDirections(bonds, 4).sort((a, b) => height(b) - height(a));
    for (const { substituent, face } of slotsAt(old, adjacent, ring, k, normal)) {
      const before = vecNormalize(vecSub(old[substituent], old[r]));
      const after = slots[face === 1 ? 0 : 1];
      // the group turns rigidly about the ring atom, from its old bond to its new one
      const axis = crossProduct(before, after);
      const sin = vecLength(axis);
      const cos = vecDot(before, after);
      const unit: Vec3 = sin > 1e-9 ? vecNormalize(axis) : [0, 0, 1];
      for (const g of group(adjacent, substituent, r)) {
        const turned = rotateRodrigues(vecSub(old[g], old[r]), unit, cos, sin);
        next[g] = [next[r][0] + turned[0], next[r][1] + turned[1], next[r][2] + turned[2]];
      }
    }
  });
  return { ...molecule, atoms: molecule.atoms.map((a, i) => ({ ...a, x: next[i][0], y: next[i][1], z: next[i][2] })) };
}

/** How much sits axial on the ring: each axial substituent's heavy atoms,
 *  its whole group's — a tert-butyl four, a methyl or an OH one, a hydrogen
 *  none. */
export function axialLoad(molecule: Molecule, ring: number[]): number {
  const adjacent = neighbours(molecule);
  return chairPositions(molecule)
    .filter((p) => p.axial && ring.includes(p.ringAtom) && !ring.includes(p.substituent))
    .reduce((sum, p) => sum + group(adjacent, p.substituent, p.ringAtom)
      .filter((g) => molecule.atoms[g].element !== 'H').length, 0);
}

/**
 * Each ring on its own in the chair with the less axial — the textbook rule
 * that bulky groups go equatorial, and the start every local build takes
 * (AGENTS.md, Rings are the exception). The embedder's chair is otherwise
 * whichever its pucker gave: it put cis-1,3-dimethylcyclohexane's methyls
 * 1,3-diaxial, close enough that GFN2-xTB bonded them, and menthol's three
 * groups all axial, from where GFN2-xTB found no geometry at all (NOTES.md,
 * 2026-11-24). A tie keeps the chair as built.
 */
export function chairWithGroupsEquatorial(molecule: Molecule): Molecule {
  let chosen = molecule;
  for (const ring of sixMemberedRings(molecule)) {
    const choice = ringToFlip(chosen, ring[0]);
    if (!('ring' in choice)) continue;
    const flipped = flipChair(chosen, choice.ring);
    if (axialLoad(flipped, choice.ring) < axialLoad(chosen, choice.ring)) chosen = flipped;
  }
  return chosen;
}

/** The atoms on `start`'s side of its bond to `from`, `start` included. */
function group(adjacent: number[][], start: number, from: number): number[] {
  const seen = new Set([start, from]);
  const out = [start];
  for (let k = 0; k < out.length; k++) {
    for (const n of adjacent[out[k]]) {
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
