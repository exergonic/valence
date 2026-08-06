import type { Molecule } from '../mol-parser';
import { optimizeTorsions } from './torsions';

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

// Ideal hybrid-orbital directions: tetrahedral (sp³), trigonal (sp²),
// linear (sp).  The embedder walks the molecular graph placing each
// neighbor along the next unused ideal vector of its parent atom.
function idealHybridVectors(count: number): [number, number, number][] {
  if (count <= 2) return LINEAR_VECTORS;
  if (count === 3) return TRIG_VECTORS;
  return TETRA_VECTORS;
}

/**
 * Ring bonds: a bond (a, b) is in a ring when a still reaches b after
 * removing the bond itself. The graph-walk embedder cannot close a
 * ring — it walks around the ring in a zig-zag and the closure bond
 * ends up meters off, with adjacent ring H's overlapping (cyclooctane
 * H-H at 0.90 Å). Ring atoms are therefore seeded from the 2D input
 * coordinates, which are a proper polygon.
 */
function ringBonds(molecule: Molecule): Set<string> {
  const adj: number[][] = Array.from({ length: molecule.atoms.length }, () => []);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
  }
  const rings = new Set<string>();
  for (const bond of molecule.bonds) {
    const a = bond.atom1Index;
    const b = bond.atom2Index;
    // BFS from a, skipping the direct a-b edge: is b still reachable?
    const seen = new Set<number>([a]);
    const queue = adj[a].filter((nb) => nb !== b);
    for (const nb of queue) seen.add(nb);
    let found = false;
    let head = 0;
    while (head < queue.length && !found) {
      const node = queue[head++];
      for (const nb of adj[node]) {
        if (nb === b) {
          found = true;
          break;
        }
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    if (found) rings.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
  }
  return rings;
}

/** Does the molecule contain any ring bonds? (The symmetry-breaking
 *  kick in the refinement path applies only to ring molecules.) */
export function hasRingBonds(molecule: Molecule): boolean {
  return ringBonds(molecule).size > 0;
}

// Fallback 3D embedder: graph-walk placement along ideal hybrid vectors,
// then staggered-alkane torsion optimization.
export function place3D(molecule: Molecule): [number, number, number][] {
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
  }

  const pos: [number, number, number][] = new Array(n);
  const placed = new Set<number>();
  const parent: number[] = new Array(n).fill(-1);

  // Seed ring atoms from the 2D input: the sketcher's ring is a proper
  // polygon (correct closure, correct angles, no overlaps), while the
  // graph walk would leave the ring a broken zig-zag that the MMFF94
  // optimizer then spends hundreds of iterations rebuilding. The ring
  // is lifted with alternating ±z offsets (a rough pucker): a flat
  // ring is a high-energy symmetric start whose collective puckering
  // costs the optimizer hundreds of iterations; the alternation gives
  // it the puckered geometry to start from.
  const rings = ringBonds(molecule);
  const ringAtoms = new Set<number>();
  for (const key of rings) {
    const [i, j] = key.split('-').map(Number);
    ringAtoms.add(i);
    ringAtoms.add(j);
  }
  // Traverse the ring cycle so the alternation is consistent.
  const ringList: number[] = [];
  if (ringAtoms.size > 0) {
    const first = [...ringAtoms][0];
    const ringAdj = new Map<number, number[]>();
    for (const key of rings) {
      const [i, j] = key.split('-').map(Number);
      if (!ringAdj.has(i)) ringAdj.set(i, []);
      if (!ringAdj.has(j)) ringAdj.set(j, []);
      ringAdj.get(i)!.push(j);
      ringAdj.get(j)!.push(i);
    }
    let prev = -1;
    let curr = first;
    while (ringList.length < ringAtoms.size) {
      ringList.push(curr);
      const nbs = ringAdj.get(curr)!.filter((nb) => nb !== prev);
      if (nbs.length === 0) break;
      prev = curr;
      curr = nbs[0];
    }
  }
  const PUCKER = 0.4; // Å of alternating out-of-plane lift
  ringList.forEach((i, k) => {
    pos[i] = [molecule.atoms[i].x, molecule.atoms[i].y, (k % 2 === 0 ? 1 : -1) * PUCKER];
    placed.add(i);
    parent[i] = i;
  });

  // Ring H placement: the vector matching cannot know the ring plane,
  // so a flat ring's leftover "equatorial" vectors point INTO the ring
  // and adjacent H's collide (0.62 Å on cyclooctane). Place ring H's
  // chemically instead: the first H axial (along the ring normal), the
  // second equatorial (outward from the ring centroid). The axial H's
  // of adjacent carbons are then parallel and the equatorial ones
  // diverge — no collisions.
  if (ringAtoms.size > 0) {
    const centroid: [number, number, number] = [0, 0, 0];
    for (const i of ringAtoms) {
      centroid[0] += pos[i][0];
      centroid[1] += pos[i][1];
      centroid[2] += pos[i][2];
    }
    centroid[0] /= ringAtoms.size;
    centroid[1] /= ringAtoms.size;
    centroid[2] /= ringAtoms.size;
    for (const i of ringAtoms) {
      const ringNbs = adj[i].filter((nb) => ringAtoms.has(nb));
      if (ringNbs.length !== 2) continue;
      const hNbs = adj[i].filter((nb) => molecule.atoms[nb].element === 'H' && !placed.has(nb));
      if (hNbs.length === 0) continue;
      const v1 = [pos[ringNbs[0]][0] - pos[i][0], pos[ringNbs[0]][1] - pos[i][1], pos[ringNbs[0]][2] - pos[i][2]];
      const v2 = [pos[ringNbs[1]][0] - pos[i][0], pos[ringNbs[1]][1] - pos[i][1], pos[ringNbs[1]][2] - pos[i][2]];
      const l1 = Math.hypot(...v1) || 1;
      const l2 = Math.hypot(...v2) || 1;
      const u1 = [v1[0] / l1, v1[1] / l1, v1[2] / l1];
      const u2 = [v2[0] / l2, v2[1] / l2, v2[2] / l2];
      // Ring normal from the two ring bonds.
      let n: [number, number, number] = [
        u1[1] * u2[2] - u1[2] * u2[1],
        u1[2] * u2[0] - u1[0] * u2[2],
        u1[0] * u2[1] - u1[1] * u2[0],
      ];
      const ln = Math.hypot(...n);
      if (ln < 1e-9) continue;
      n = [n[0] / ln, n[1] / ln, n[2] / ln];
      // Outward = away from the centroid, projected onto the ring plane.
      const out = [
        pos[i][0] - centroid[0],
        pos[i][1] - centroid[1],
        pos[i][2] - centroid[2],
      ];
      const lo = Math.hypot(...out);
      let eq: [number, number, number] = lo > 1e-9
        ? [out[0] / lo, out[1] / lo, out[2] / lo]
        : [1, 0, 0];
      const ndot = n[0] * eq[0] + n[1] * eq[1] + n[2] * eq[2];
      eq = [eq[0] - ndot * n[0], eq[1] - ndot * n[1], eq[2] - ndot * n[2]];
      const le = Math.hypot(...eq);
      if (le > 1e-9) eq = [eq[0] / le, eq[1] / le, eq[2] / le];

      const slots = [n, eq];
      for (let k = 0; k < hNbs.length && k < 2; k++) {
        const h = hNbs[k];
        pos[h] = [
          pos[i][0] + BOND_LENGTH * slots[k][0],
          pos[i][1] + BOND_LENGTH * slots[k][1],
          pos[i][2] + BOND_LENGTH * slots[k][2],
        ];
        placed.add(h);
        parent[h] = i;
      }
    }
  }

  let root = 0;
  for (let i = 0; i < n; i++) {
    if (molecule.atoms[i].element !== 'H' && adj[i].length > 0 && !placed.has(i)) {
      root = i;
      break;
    }
  }

  pos[root] = [0, 0, 0];
  placed.add(root);
  parent[root] = root;

  const queue = [root, ...ringAtoms];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const coordinationNumber = adj[curr].length;
    const vectors = idealHybridVectors(coordinationNumber);

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
    // Match each placed neighbor to the closest ideal hybrid vector so
    // the remaining vectors point into unoccupied positions (where the
    // unplaced neighbors will go).
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

  // Unplaced atoms (isolated) keep their 2D input coordinates.
  return pos.map((p, i) => p || [molecule.atoms[i].x, molecule.atoms[i].y, 0]);
}
