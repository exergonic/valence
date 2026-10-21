// Does a computed structure have the shape the VSEPR picture predicts? Each
// centre's bond angles against its AXₘEₙ ideal — asked for 2026-10-20, after
// GFN2-xTB made SeF₄ a square pyramid where VSEPR (and experiment) say seesaw.
// A disagreement is reported, never repaired: either side can be wrong.

import type { Molecule } from '../../mol-parser';
import { electronDomainCounts, sigmaNeighbors } from './assign-orbitals';
import { vseprBondVectors } from './ideal-vsepr-vectors';

/**
 * How far a bond angle may sit from VSEPR's ideal before the centre counts as
 * a different shape. VSEPR's own distortions stay well inside it: lone pairs
 * squeeze SF₄'s equatorial angle from 120° to 101.5°, and a heavy atom's inert
 * s pair closes H₂Te to 90° and SnCl₂ to about 95° from 109.5° and 120°. A
 * different shape moves an angle by more: SeF₄'s square pyramid has 134°
 * where the seesaw has 180°.
 */
const DIFFERENT_SHAPE_DEG = 30;

/** Bond angles that round to within this many degrees are printed as one. */
const SAME_ANGLE_DEG = 3;

/** The shape of an AXₘEₙ centre, keyed `${domains}-${bonds}`. */
const VSEPR_SHAPES: Record<string, string> = {
  '2-2': 'linear',
  '3-3': 'trigonal planar', '3-2': 'bent',
  '4-4': 'tetrahedral', '4-3': 'trigonal pyramidal', '4-2': 'bent',
  '5-5': 'trigonal bipyramidal', '5-4': 'seesaw', '5-3': 'T-shaped', '5-2': 'linear',
  '6-6': 'octahedral', '6-5': 'square pyramidal', '6-4': 'square planar', '6-3': 'T-shaped', '6-2': 'linear',
};

export interface ShapeMismatch {
  atomIndex: number;
  /** "AX₄E" */
  formula: string;
  /** VSEPR's name for it: "seesaw" */
  predicted: string;
  /** VSEPR's bond angles, grouped: "180°, 120°, 90° ×4" */
  predictedAngles: string;
  /** The structure's: "134° ×2, 81° ×4" */
  measuredAngles: string;
  /** The structure's shape when it has a name: another VSEPR shape it fits,
   *  or a square pyramid with the centre at its apex. Null otherwise. */
  measured: string | null;
}

/**
 * Every main-group centre with two or more bonds whose angles leave its VSEPR
 * shape. A centre in a 3- or 4-membered ring is skipped: the ring sets its
 * angles (cyclopropane's 60°), and that strain is real, not a disagreement.
 */
export function vseprShapeMismatches(molecule: Molecule): ShapeMismatch[] {
  const domains = electronDomainCounts(molecule);
  const neighbors = sigmaNeighbors(molecule);
  const mismatches: ShapeMismatch[] = [];
  molecule.atoms.forEach((atom, i) => {
    const bonded = neighbors[i];
    const m = bonded.length;
    const d = domains[i];
    const predicted = VSEPR_SHAPES[`${d}-${m}`];
    if (!predicted || inSmallRing(neighbors, i)) return;
    const measured = sortedAngles(bonded.map((j) => {
      const n = molecule.atoms[j];
      return [n.x - atom.x, n.y - atom.y, n.z - atom.z] as [number, number, number];
    }));
    const ideal = sortedAngles(vseprBondVectors(d, m));
    if (largestDifference(measured, ideal) <= DIFFERENT_SHAPE_DEG) return;
    mismatches.push({
      atomIndex: i,
      formula: `AX${subscript(m)}${d > m ? `E${d - m > 1 ? subscript(d - m) : ''}` : ''}`,
      predicted,
      predictedAngles: groupAngles(ideal),
      measuredAngles: groupAngles(measured),
      measured: nameShape(measured, m),
    });
  });
  return mismatches;
}

/** The measured shape's name: the VSEPR shape of the same bond count it fits
 *  (a centre GFN2 made T-shaped where VSEPR said trigonal planar), or the
 *  square pyramid with the centre at its apex — four equal small angles and
 *  two equal trans angles short of 180° — which is no VSEPR shape at all. */
function nameShape(measured: number[], bonds: number): string | null {
  for (let d = bonds; d <= 6; d++) {
    const shape = VSEPR_SHAPES[`${d}-${bonds}`];
    if (shape && largestDifference(measured, sortedAngles(vseprBondVectors(d, bonds))) <= DIFFERENT_SHAPE_DEG / 2) {
      return shape;
    }
  }
  if (bonds === 4) {
    const cis = measured.slice(0, 4);
    const trans = measured.slice(4);
    if (cis[3] - cis[0] < 5 && trans[1] - trans[0] < 5 && trans[1] < 165) return 'square pyramidal, the centre at its apex';
  }
  return null;
}

/** The angles between every pair of bonds, in degrees, smallest first. */
function sortedAngles(vectors: [number, number, number][]): number[] {
  const angles: number[] = [];
  for (let a = 0; a < vectors.length; a++) {
    for (let b = a + 1; b < vectors.length; b++) {
      const [u, v] = [vectors[a], vectors[b]];
      const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v));
      angles.push((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
    }
  }
  return angles.sort((x, y) => x - y);
}

function largestDifference(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  return Math.max(...a.map((x, k) => Math.abs(x - b[k])));
}

/** "180°, 120°, 90° ×4": largest first, near-equal angles counted together. */
function groupAngles(sorted: number[]): string {
  const groups: { angle: number; count: number }[] = [];
  for (const angle of [...sorted].reverse()) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.angle - angle) <= SAME_ANGLE_DEG) last.count += 1;
    else groups.push({ angle, count: 1 });
  }
  return groups.map(({ angle, count }) => `${Math.round(angle)}°${count > 1 ? ` ×${count}` : ''}`).join(', ');
}

/** In a 3-ring (two neighbours bonded) or a 4-ring (two neighbours sharing
 *  another neighbour)? */
function inSmallRing(neighbors: number[][], i: number): boolean {
  const around = neighbors[i];
  for (let a = 0; a < around.length; a++) {
    for (let b = a + 1; b < around.length; b++) {
      const [p, q] = [around[a], around[b]];
      if (neighbors[p].includes(q)) return true;
      if (neighbors[p].some((k) => k !== i && neighbors[q].includes(k))) return true;
    }
  }
  return false;
}

function subscript(n: number): string {
  return n === 1 ? '' : String(n).replace(/\d/g, (c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]);
}
