import type { Molecule } from '../mol-parser';
import { vecSub, vecNormalize, vecDot, crossProduct, projectPerpendicular, rotateRodrigues } from '../utils/vec3';

// Alkane torsion optimizer: rotates rotatable heavy-atom single bonds to
// the nearest staggered conformation (the alkane energy minimum).
// Runs as the last step of the fallback embedder.
function torsionAngle(
  pA: [number, number, number],
  pB: [number, number, number],
  pSubA: [number, number, number],
  pSubB: [number, number, number],
): number {
  const axis = vecNormalize(vecSub(pB, pA));
  const vA = vecNormalize(projectPerpendicular(vecSub(pSubA, pA), axis));
  const vB = vecNormalize(projectPerpendicular(vecSub(pSubB, pB), axis));
  const cosAng = vecDot(vA, vB);
  const sinAng = vecDot(crossProduct(vA, vB), axis);
  return Math.atan2(sinAng, cosAng);
}

function getSubtree(node: number, excludeParent: number, adj: number[][]): number[] {
  const result: number[] = [];
  const visited = new Set<number>([excludeParent]);
  const queue = [node];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    result.push(curr);
    for (const nb of adj[curr]) {
      if (!visited.has(nb)) queue.push(nb);
    }
  }
  return result;
}

export function optimizeTorsions(
  molecule: Molecule,
  adj: number[][],
  parent: number[],
  positions: [number, number, number][],
): void {
  for (const bond of molecule.bonds) {
    if (bond.order !== 1) continue;
    const a = bond.atom1Index;
    const b = bond.atom2Index;
    if (molecule.atoms[a].element === 'H' || molecule.atoms[b].element === 'H') continue;
    if (adj[a].length < 3 || adj[b].length < 3) continue;

    // Pick the pivot (parentAtom) and the side that rotates (childAtom).
    // For a parent→child bond this is given; for a bond between two
    // subtrees, prefer the endpoint whose parent is defined so the
    // fragment farther from the BFS root is the one that turns.
    let parentAtom: number;
    let childAtom: number;
    if (parent[a] === b) {
      parentAtom = b;
      childAtom = a;
    } else if (parent[b] === a) {
      parentAtom = a;
      childAtom = b;
    } else {
      if (parent[a] === -1 || parent[b] === -1) continue;
      parentAtom = a;
      childAtom = b;
    }

    const parentSubs = adj[parentAtom].filter((n) => n !== childAtom);
    const childSubs = adj[childAtom].filter((n) => n !== parentAtom);
    if (parentSubs.length === 0 || childSubs.length === 0) continue;

    const refParent = parentSubs[0];
    const refChild = childSubs[0];
    const torsion = torsionAngle(
      positions[parentAtom], positions[childAtom],
      positions[refParent], positions[refChild],
    );

    // Nearest staggered dihedral (0/60/120/180/240/300°) is the target —
    // eclipsed conformations are the alkane maxima.
    const staggered = [0, 60, 120, 180, 240, 300].map((d) => d * Math.PI / 180);
    const target = staggered.reduce((best, t) => Math.abs(t - torsion) < Math.abs(best - torsion) ? t : best);
    const delta = target - torsion;
    if (Math.abs(delta) < 0.01) continue;

    const axis = vecNormalize(vecSub(positions[childAtom], positions[parentAtom]));

    const subtree = getSubtree(childAtom, parentAtom, adj);
    // Skip ring bonds — rotating would break the cycle
    const isRingBond = subtree.some(
      (idx) => idx !== childAtom && adj[parentAtom].includes(idx),
    );
    if (isRingBond) continue;

    const cosA = Math.cos(delta);
    const sinA = Math.sin(delta);
    for (const idx of subtree) {
      positions[idx] = rotateRodrigues(vecSub(positions[idx], positions[parentAtom]), axis, cosA, sinA);
    }
  }
}
