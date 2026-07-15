import type { Molecule } from '../mol-parser';
import { optimizeTorsions } from './torsions';

export interface PlacedAtom {
  index: number;
  element: string;
  position: [number, number, number];
}

const BOND_LENGTH = 1.0;

const TETRA_VECTORS: [number, number, number][] = [
  [0, 0, 1],
  [2 * Math.SQRT2 / 3, 0, -1 / 3],
  [-Math.SQRT2 / 3, Math.sqrt(6) / 3, -1 / 3],
  [-Math.SQRT2 / 3, -Math.sqrt(6) / 3, -1 / 3],
];

const TRIG_VECTORS: [number, number, number][] = [
  [1, 0, 0],
  [-0.5, Math.sqrt(3) / 2, 0],
  [-0.5, -Math.sqrt(3) / 2, 0],
];

const LINEAR_VECTORS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
];

function alignVectors(from: [number, number, number], to: [number, number, number]): (v: [number, number, number]) => [number, number, number] {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (Math.abs(dot - 1) < 1e-6) return (v) => v;
  if (Math.abs(dot + 1) < 1e-6) return (v) => [-v[0], -v[1], -v[2]];

  const axis: [number, number, number] = [
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0],
  ];
  const len = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2);
  const naxis: [number, number, number] = [axis[0] / len, axis[1] / len, axis[2] / len];
  const cosA = dot;
  const sinA = Math.sqrt(1 - dot * dot);

  return (v) => {
    const dotV = v[0] * naxis[0] + v[1] * naxis[1] + v[2] * naxis[2];
    const cross: [number, number, number] = [
      naxis[1] * v[2] - naxis[2] * v[1],
      naxis[2] * v[0] - naxis[0] * v[2],
      naxis[0] * v[1] - naxis[1] * v[0],
    ];
    return [
      v[0] * cosA + cross[0] * sinA + naxis[0] * dotV * (1 - cosA),
      v[1] * cosA + cross[1] * sinA + naxis[1] * dotV * (1 - cosA),
      v[2] * cosA + cross[2] * sinA + naxis[2] * dotV * (1 - cosA),
    ];
  };
}

function getIdealVectors(count: number): [number, number, number][] {
  if (count <= 2) return LINEAR_VECTORS;
  if (count === 3) return TRIG_VECTORS;
  return TETRA_VECTORS;
}

export function place3D(molecule: Molecule): PlacedAtom[] {
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
  }

  const pos: [number, number, number][] = new Array(n);
  const placed = new Set<number>();
  const parent: number[] = new Array(n).fill(-1);

  let root = 0;
  for (let i = 0; i < n; i++) {
    if (molecule.atoms[i].element !== 'H' && adj[i].length > 0) {
      root = i;
      break;
    }
  }

  pos[root] = [0, 0, 0];
  placed.add(root);
  parent[root] = root;

  const queue = [root];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const steric = adj[curr].length;
    const vectors = getIdealVectors(steric);

    const unplaced = adj[curr].filter((ni) => !placed.has(ni));
    if (unplaced.length === 0) continue;

    const placedNeighbors = adj[curr].filter((ni) => placed.has(ni));
    let rotate = (v: [number, number, number]) => v;

    if (placedNeighbors.length > 0) {
      const anchor = placedNeighbors[0];
      const dx = pos[anchor][0] - pos[curr][0];
      const dy = pos[anchor][1] - pos[curr][1];
      const dz = pos[anchor][2] - pos[curr][2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 1e-6) {
        rotate = alignVectors(vectors[0], [dx / len, dy / len, dz / len]);
      }
    }

    const rotated = vectors.map((v) => rotate(v));
    const used = new Set<number>();

    for (const pn of placedNeighbors) {
      const dx = pos[pn][0] - pos[curr][0];
      const dy = pos[pn][1] - pos[curr][1];
      const dz = pos[pn][2] - pos[curr][2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-6) continue;
      const ndir: [number, number, number] = [dx / len, dy / len, dz / len];
      let bestDot = -Infinity;
      let bestIdx = -1;
      for (let i = 0; i < rotated.length; i++) {
        if (used.has(i)) continue;
        const dot = ndir[0] * rotated[i][0] + ndir[1] * rotated[i][1] + ndir[2] * rotated[i][2];
        if (dot > bestDot) {
          bestDot = dot;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) used.add(bestIdx);
    }

    const available = rotated.filter((_, i) => !used.has(i));
    if (available.length === 0) continue;

    for (let k = 0; k < unplaced.length; k++) {
      const vec = available[k % available.length];
      const nb = unplaced[k];
      pos[nb] = [
        pos[curr][0] + BOND_LENGTH * vec[0],
        pos[curr][1] + BOND_LENGTH * vec[1],
        pos[curr][2] + BOND_LENGTH * vec[2],
      ];
      placed.add(nb);
      parent[nb] = curr;
      queue.push(nb);
    }
  }

  optimizeTorsions(molecule, adj, parent, pos);

  return molecule.atoms.map((a, i) => ({
    index: a.index,
    element: a.element,
    position: pos[i] || [a.x, a.y, 0],
  }));
}
