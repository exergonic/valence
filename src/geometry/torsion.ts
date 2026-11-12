/**
 * Turning a bond by hand: the dihedral drive of the Structure view (decided
 * with the user 2026-11-11). One side of an acyclic bond turns rigidly about
 * the bond's axis while everything else stays put, the way a Newman projection
 * is drawn and the way Avogadro's bond-centric tool turns it — so the energy
 * along the way is a *rigid* torsion profile, which overstates a barrier a
 * little (nothing else relaxes) but has its shape.
 *
 * What turns is the smaller side (fewer atoms, then the lighter), so turning
 * butane's C2–C3 moves an ethyl, and turning methanol's C–O moves the OH.
 * The dihedral is named by the heaviest neighbour on each side — C1–C2–C3–C4
 * for butane, H–C–C–H for ethane — and a neighbour in line with the bond (an
 * alkyne's) cannot name one.
 *
 * A bond in a ring cannot turn alone: its two ends are joined the other way
 * round too, and turning one side would tear the ring. A bond to a terminal
 * atom turns nothing. Both are refused with the reason. A double bond turns
 * like any other (the user's call): twisting ethene to 90° is how the π bond's
 * overlap, and its energy, are seen to go.
 */
import type { Molecule } from '../mol-parser';
import { atomicNumber } from '../chem/elements';
import { ATOMIC_MASS } from '../chem/assign-mass';
import { crossProduct, dihedralAngle, vecDot, vecLength, vecNormalize, vecSub, type Vec3 } from '../utils/vec3';

/** A bond chosen for turning, and the dihedral a–b–c–d that says how far. */
export interface Torsion {
  /** The bond, as `molecule.bonds` has it. */
  bondIndex: number;
  /** The bond's end that stays put. */
  b: number;
  /** The bond's end that turns, with everything on its side. */
  c: number;
  /** The neighbour of `b` that names the dihedral. */
  a: number;
  /** The neighbour of `c` that names the dihedral. */
  d: number;
  /** Every atom on `c`'s side of the bond, `c` included: the part that turns. */
  turning: number[];
}

/** An a–b–c angle above this (degrees) puts a in line with the bond: it cannot
 *  name a dihedral. */
const IN_LINE_DEGREES = 175;

const position = (molecule: Molecule, i: number): Vec3 => {
  const atom = molecule.atoms[i];
  return [atom.x, atom.y, atom.z];
};

/** "C2": the element and the 1-based number the labels and the Measure tool use. */
export function atomName(molecule: Molecule, i: number): string {
  return `${molecule.atoms[i].element}${i + 1}`;
}

/** "C1–C2–C3–C4". */
export function torsionName(molecule: Molecule, torsion: Torsion): string {
  return [torsion.a, torsion.b, torsion.c, torsion.d].map((i) => atomName(molecule, i)).join('–');
}

function neighbours(molecule: Molecule): number[][] {
  const list: number[][] = molecule.atoms.map(() => []);
  for (const bond of molecule.bonds) {
    list[bond.atom1Index].push(bond.atom2Index);
    list[bond.atom2Index].push(bond.atom1Index);
  }
  return list;
}

/** The atoms reached from `start` without crossing the bond start–across. */
function sideOf(adjacent: number[][], start: number, across: number): Set<number> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const atom = queue.pop()!;
    for (const next of adjacent[atom]) {
      if (atom === start && next === across) continue;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** The neighbour of `end` (other than `other`) that names the dihedral: the
 *  heaviest element, then the lowest number, among those not in line with the
 *  bond. Null when every neighbour is in line. */
function namingNeighbour(molecule: Molecule, adjacent: number[][], end: number, other: number): number | null {
  const toOther = vecSub(position(molecule, other), position(molecule, end));
  const candidates = adjacent[end].filter((n) => {
    if (n === other) return false;
    const toN = vecSub(position(molecule, n), position(molecule, end));
    const cos = vecDot(toN, toOther) / (vecLength(toN) * vecLength(toOther));
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI < IN_LINE_DEGREES;
  });
  if (candidates.length === 0) return null;
  const z = (i: number) => atomicNumber(molecule.atoms[i].element) ?? 0;
  return candidates.reduce((best, n) => (z(n) > z(best) || (z(n) === z(best) && n < best) ? n : best));
}

/**
 * The torsion about bond `bondIndex`, or why that bond cannot turn: it is in
 * a ring, it ends at a terminal atom, or its neighbours are in line with it.
 */
export function torsionAbout(molecule: Molecule, bondIndex: number): { torsion: Torsion } | { refusal: string } {
  const bond = molecule.bonds[bondIndex];
  const name = `${atomName(molecule, bond.atom1Index)}–${atomName(molecule, bond.atom2Index)}`;
  const adjacent = neighbours(molecule);
  const side1 = sideOf(adjacent, bond.atom1Index, bond.atom2Index);
  if (side1.has(bond.atom2Index)) {
    return { refusal: `${name} is in a ring: its ends are joined the other way round too, so turning one side would tear the ring.` };
  }
  const side2 = sideOf(adjacent, bond.atom2Index, bond.atom1Index);
  if (side1.size === 1 || side2.size === 1) {
    const terminal = side1.size === 1 ? bond.atom1Index : bond.atom2Index;
    return { refusal: `${atomName(molecule, terminal)} is a terminal atom: turning ${name} moves nothing but it, about its own bond.` };
  }

  // the smaller side turns: fewer atoms, then the lighter, then the second atom's
  const mass = (side: Set<number>) => [...side].reduce((sum, i) => sum + (ATOMIC_MASS[molecule.atoms[i].element] ?? 0), 0);
  const secondTurns = side2.size < side1.size || (side2.size === side1.size && mass(side2) <= mass(side1));
  const [b, c] = secondTurns ? [bond.atom1Index, bond.atom2Index] : [bond.atom2Index, bond.atom1Index];
  const turning = [...(secondTurns ? side2 : side1)].sort((x, y) => x - y);

  const a = namingNeighbour(molecule, adjacent, b, c);
  const d = namingNeighbour(molecule, adjacent, c, b);
  if (a === null || d === null) {
    return { refusal: `The atoms beside ${name} are in line with it, so there is no dihedral about it to turn.` };
  }
  return { torsion: { bondIndex, b, c, a, d, turning } };
}

/** The dihedral a–b–c–d, degrees, in (−180, 180]: the IUPAC sign, as the
 *  Measure tool reads it. */
export function dihedralDegrees(molecule: Molecule, torsion: Torsion): number {
  const p = (i: number) => position(molecule, i);
  return dihedralAngle(p(torsion.a), p(torsion.b), p(torsion.c), p(torsion.d)) * 180 / Math.PI;
}

/** An angle, degrees, brought into (−180, 180]. */
export function wrapDegrees(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * The molecule with the torsion's turning side rotated rigidly about the bond
 * axis until the dihedral reads `degrees`. Nothing else moves; every bond
 * length and angle on either side is kept exactly. Turning the far end
 * counterclockwise about b→c (the right-hand sense) raises the dihedral.
 */
export function turnTorsion(molecule: Molecule, torsion: Torsion, degrees: number): Molecule {
  const by = wrapDegrees(degrees - dihedralDegrees(molecule, torsion)) * Math.PI / 180;
  const pivot = position(molecule, torsion.c);
  const axis = vecNormalize(vecSub(pivot, position(molecule, torsion.b)));
  const cos = Math.cos(by);
  const sin = Math.sin(by);
  const turning = new Set(torsion.turning);
  return {
    ...molecule,
    atoms: molecule.atoms.map((atom, i) => {
      if (!turning.has(i)) return atom;
      // Rodrigues' rotation of the atom about the axis through c
      const r = vecSub([atom.x, atom.y, atom.z], pivot);
      const k = crossProduct(axis, r);
      const along = vecDot(axis, r) * (1 - cos);
      return {
        ...atom,
        x: pivot[0] + r[0] * cos + k[0] * sin + axis[0] * along,
        y: pivot[1] + r[1] * cos + k[1] * sin + axis[1] * along,
        z: pivot[2] + r[2] * cos + k[2] * sin + axis[2] * along,
      };
    }),
  };
}
