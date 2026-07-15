import type { Molecule } from '../mol-parser';

function vecSub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vecLen(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vecNorm(v: [number, number, number]): [number, number, number] {
  const l = vecLen(v);
  if (l < 1e-8) return [0, 0, 0];
  return [v[0] / l, v[1] / l, v[2] / l];
}

function vecDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecCross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function projectPerpendicular(v: [number, number, number], axis: [number, number, number]): [number, number, number] {
  const d = vecDot(v, axis);
  return [v[0] - axis[0] * d, v[1] - axis[1] * d, v[2] - axis[2] * d];
}

function torsionAngle(
  pA: [number, number, number],
  pB: [number, number, number],
  pSubA: [number, number, number],
  pSubB: [number, number, number],
): number {
  const axis = vecNorm(vecSub(pB, pA));
  const vA = vecNorm(projectPerpendicular(vecSub(pSubA, pA), axis));
  const vB = vecNorm(projectPerpendicular(vecSub(pSubB, pB), axis));
  const cosAng = vecDot(vA, vB);
  const sinAng = vecDot(vecCross(vA, vB), axis);
  return Math.atan2(sinAng, cosAng);
}

function rotateAroundAxis(
  v: [number, number, number],
  axis: [number, number, number],
  cosA: number,
  sinA: number,
): [number, number, number] {
  const dot = vecDot(v, axis);
  const cross = vecCross(axis, v);
  return [
    v[0] * cosA + cross[0] * sinA + axis[0] * dot * (1 - cosA),
    v[1] * cosA + cross[1] * sinA + axis[1] * dot * (1 - cosA),
    v[2] * cosA + cross[2] * sinA + axis[2] * dot * (1 - cosA),
  ];
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
      const dA = parent[a] === -1 ? Infinity : 1;
      const dB = parent[b] === -1 ? Infinity : 1;
      parentAtom = dA <= dB ? a : b;
      childAtom = dA <= dB ? b : a;
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

    const staggered = [0, 60, 120, 180, 240, 300].map((d) => d * Math.PI / 180);
    const target = staggered.reduce((best, t) => Math.abs(t - torsion) < Math.abs(best - torsion) ? t : best);
    const delta = target - torsion;
    if (Math.abs(delta) < 0.01) continue;

    const axis = vecNorm(vecSub(positions[childAtom], positions[parentAtom]));
    const pa = positions[parentAtom];
    const cosA = Math.cos(delta);
    const sinA = Math.sin(delta);

    const subtree = getSubtree(childAtom, parentAtom, adj);
    // Skip ring bonds — rotating would break the cycle
    const isRingBond = subtree.some(
      (idx) => idx !== childAtom && adj[parentAtom].includes(idx),
    );
    if (isRingBond) continue;

    for (const idx of subtree) {
      const rel = vecSub(positions[idx], pa);
      positions[idx] = rotateAroundAxis(rel, axis, cosA, sinA);
    }
  }
}
