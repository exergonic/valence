/**
 * Bridged ring systems — norbornane, bicyclo[2.2.2]octane, adamantane,
 * quinuclidine, camphor, cubane — placed from their bond graph, not their
 * drawing.
 *
 * The embedder seeds every other ring from the sketch, a flat polygon it
 * lifts into a rough pucker (place3d.ts). A bridged system has no flat
 * drawing: one bridge must cross the ring the other two make. JSME draws
 * norbornane as a hexagon with C7 inside it, nearer C4 and C5 than its own
 * bridgeheads, and seeded from that, C7 started inside bonding distance of
 * C4 and its hydrogens inside the ring. GFN2 closed a three-membered ring
 * from it, and the held structure showed the cage torn open; every bridged
 * system tried failed the same way (NOTES.md, 2026-11-23).
 *
 * Which ring systems: those whose drawing, scaled to its bond lengths, is
 * not a shape the system can have — not the molecule drawn by the bonding
 * guard's own rule (bond-integrity.ts: a drawn bond stretched past a full
 * bond, or two unbonded atoms within bonding distance), or with two ring
 * bonds at an atom closer than a three-membered ring's 60° though their ends
 * are not bonded. The guard alone passes norbornane's drawing: C7 and C4
 * share C3, and it leaves such a pair to the angle between its bonds — here
 * 41°. A single ring is never judged, and a fused or spiro system whose
 * drawing passes keeps it.
 *
 * How: classical metric-matrix embedding, the first step of distance
 * geometry (Crippen & Havel) — the three-dimensional shape whose interatomic
 * distances best match the ones a ring's bonds and angles imply, from one
 * eigen-decomposition and no minimiser. The shape is then laid onto the
 * drawing, so the system sits where it was drawn and turned as drawn; of the
 * two mirror images that fit a flat drawing equally, the one the drawn wedges
 * ask for is taken.
 */
import type { Molecule } from '../mol-parser';
import { isMoleculeDrawn } from './bond-integrity';
import { jacobiSymmetric } from '../utils/eigen';
import { crossProduct, vecDot as dot, vecNormalize, type Vec3 } from '../utils/vec3';

/** The ring systems: the sets of atoms joined by ring bonds, each its own. */
export function ringSystems(n: number, ringBonds: [number, number][]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [i, j] of ringBonds) {
    adj[i].push(j);
    adj[j].push(i);
  }
  const seen = new Set<number>();
  const systems: number[][] = [];
  for (let start = 0; start < n; start++) {
    if (seen.has(start) || adj[start].length === 0) continue;
    const system = [start];
    seen.add(start);
    for (let k = 0; k < system.length; k++) {
      for (const nb of adj[system[k]]) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        system.push(nb);
      }
    }
    systems.push(system.sort((a, b) => a - b));
  }
  return systems;
}

/** Is the ring system's drawing, scaled by `scale`, a shape it can have? */
export function drawingFits(molecule: Molecule, system: number[], ringBonds: [number, number][], scale: number): boolean {
  const index = new Map(system.map((atom, k) => [atom, k]));
  const flat: Molecule = {
    atoms: system.map((i) => ({ ...molecule.atoms[i], x: molecule.atoms[i].x * scale, y: molecule.atoms[i].y * scale, z: 0 })),
    bonds: ringBonds
      .filter(([i, j]) => index.has(i) && index.has(j))
      .map(([i, j]) => ({ atom1Index: index.get(i)!, atom2Index: index.get(j)!, order: 1 })),
  };
  // A single ring is always drawn as a polygon it can be (diborane's B–H–B–H
  // rhombus is narrow at B, and right): only a system with an atom on three
  // ring bonds, a bridgehead or a fusion atom, can be drawn as one it cannot.
  const ringBondCount = system.map((_, k) => flat.bonds.filter((b) => b.atom1Index === k || b.atom2Index === k).length);
  if (ringBondCount.every((count) => count < 3)) return true;
  if (!isMoleculeDrawn(flat)) return false;
  const bonded = (i: number, j: number) => flat.bonds.some((b) =>
    (b.atom1Index === i && b.atom2Index === j) || (b.atom1Index === j && b.atom2Index === i));
  const { atoms } = flat;
  for (let c = 0; c < atoms.length; c++) {
    const nbs = flat.bonds.flatMap((b) => (b.atom1Index === c ? [b.atom2Index] : b.atom2Index === c ? [b.atom1Index] : []));
    for (let a = 0; a < nbs.length; a++) {
      for (let b = a + 1; b < nbs.length; b++) {
        if (bonded(nbs[a], nbs[b])) continue;
        const [p, q] = [atoms[nbs[a]], atoms[nbs[b]]].map((t) => [t.x - atoms[c].x, t.y - atoms[c].y]);
        const angle = Math.acos(Math.max(-1, Math.min(1, (p[0] * q[0] + p[1] * q[1]) / (Math.hypot(p[0], p[1]) * Math.hypot(q[0], q[1])))));
        if (angle < Math.PI / 3) return false;
      }
    }
  }
  return true;
}

/**
 * The distance between two ring atoms k bonds apart, in units of a bond: 1,3
 * across a tetrahedral angle (2 sin 54.7° = 1.63), and each bond beyond adds
 * 0.3, a ring's path folding back on itself — cyclohexane's 1,4 pair is 2.95
 * Å, 1.93 bonds.
 */
function bondsApart(k: number): number {
  return k === 1 ? 1 : 1.633 + 0.3 * (k - 2);
}

/**
 * The system's atoms placed from its bond graph, in Å, in the drawing's frame
 * at `scale`; `bondLength` gives each ring bond's length. Returned in the
 * order of `system`.
 */
export function placeFromBondGraph(
  molecule: Molecule,
  system: number[],
  ringBonds: [number, number][],
  bondLength: (i: number, j: number) => number,
  scale: number,
): Vec3[] {
  const m = system.length;
  const index = new Map(system.map((atom, k) => [atom, k]));
  const bonds = ringBonds.filter(([i, j]) => index.has(i) && index.has(j));
  const adj: number[][] = Array.from({ length: m }, () => []);
  for (const [i, j] of bonds) {
    adj[index.get(i)!].push(index.get(j)!);
    adj[index.get(j)!].push(index.get(i)!);
  }
  const meanBond = bonds.reduce((sum, [i, j]) => sum + bondLength(i, j), 0) / bonds.length;

  // The squared distances the bonds imply: a bond its own length, anything
  // further by how many bonds apart (the shortest path through the system).
  const d2: number[][] = [];
  for (let a = 0; a < m; a++) {
    const apart = new Array<number>(m).fill(Infinity);
    apart[a] = 0;
    const queue = [a];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const nb of adj[curr]) {
        if (apart[nb] !== Infinity) continue;
        apart[nb] = apart[curr] + 1;
        queue.push(nb);
      }
    }
    d2.push(apart.map((k, b) => {
      if (k === 0) return 0;
      const r = k === 1 ? bondLength(system[a], system[b]) : meanBond * bondsApart(k);
      return r * r;
    }));
  }

  // The metric matrix — each atom's position dotted with every other's,
  // about the centroid — is −½ of the doubly centred squared distances; its
  // three largest eigenvectors, scaled by their roots, are the coordinates.
  const rowMean = d2.map((row) => row.reduce((s, x) => s + x, 0) / m);
  const grandMean = rowMean.reduce((s, x) => s + x, 0) / m;
  const metric = d2.map((row, a) => row.map((x, b) => -0.5 * (x - rowMean[a] - rowMean[b] + grandMean)));
  const { values, vectors } = jacobiSymmetric(metric);
  const shape: Vec3[] = system.map((_, a) =>
    [1, 2, 3].map((k) => vectors[a][m - k] * Math.sqrt(Math.max(values[m - k], 0))) as Vec3);

  // The embedding keeps the shape, not the scale: bring the bonds, on
  // average, to their lengths.
  const distance = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const embedded = bonds.reduce((sum, [i, j]) => sum + distance(shape[index.get(i)!], shape[index.get(j)!]), 0);
  const wanted = bonds.reduce((sum, [i, j]) => sum + bondLength(i, j), 0);
  for (const p of shape) for (let c = 0; c < 3; c++) p[c] *= wanted / embedded;

  // Laid onto the drawing: the rotation whose view down z best matches the
  // sketch (orthogonal Procrustes). Its first two rows are the orthonormal
  // pair nearest [h1 h2], the shape's correlation with the drawing's x and y.
  const drawn = system.map((i) => [molecule.atoms[i].x * scale, molecule.atoms[i].y * scale]);
  const centre = [0, 1].map((c) => drawn.reduce((s, p) => s + p[c], 0) / m);
  const h: Vec3[] = [0, 1].map((c) => {
    const col: Vec3 = [0, 0, 0];
    shape.forEach((p, a) => { for (let k = 0; k < 3; k++) col[k] += p[k] * (drawn[a][c] - centre[c]); });
    return col;
  });
  // [a b] = [h1 h2] (HᵀH)^(−1/2), from HᵀH's own eigenvectors
  const hth = [[dot(h[0], h[0]), dot(h[0], h[1])], [dot(h[1], h[0]), dot(h[1], h[1])]];
  const eig = jacobiSymmetric(hth);
  let rows: Vec3[];
  if (eig.values[0] > 1e-9 * eig.values[1]) {
    const inverseRoot = [0, 1].map((r) => [0, 1].map((c) =>
      [0, 1].reduce((s, k) => s + eig.vectors[r][k] * eig.vectors[c][k] / Math.sqrt(eig.values[k]), 0)));
    rows = [0, 1].map((c) => vecNormalize([0, 1, 2].map((k) =>
      h[0][k] * inverseRoot[0][c] + h[1][k] * inverseRoot[1][c]) as Vec3));
  } else {
    rows = [[1, 0, 0], [0, 1, 0]]; // a drawing with no breadth: keep the embedding's own axes
  }
  const view = crossProduct(rows[0], rows[1]);
  const placed = (towardViewer: Vec3) => shape.map((p) =>
    [dot(rows[0], p) + centre[0], dot(rows[1], p) + centre[1], dot(towardViewer, p)] as Vec3);

  // The mirror image: the drawing is a view down z, so a wedge says its far
  // atom is nearer the viewer than the near one (a hash, further). Both
  // images fit the flat drawing alike; the wedges choose, and without any the
  // first stands. A wedge counts when its far atom is in the system, or hangs
  // from a bridgehead — whose fourth bond can only point away from its three
  // ring bonds (camphor's C1 methyl). Any other substituent has two slots to
  // choose from, and the wedge pass (stereo-wedge.ts) puts it in the right one.
  const front = placed(view);
  let vote = 0;
  for (const bond of molecule.bonds) {
    if (bond.stereo !== 1 && bond.stereo !== 6) continue;
    const near = index.get(bond.atom1Index);
    if (near === undefined) continue;
    const far = index.get(bond.atom2Index);
    let rise: number;
    if (far !== undefined) {
      rise = front[far][2] - front[near][2];
    } else if (adj[near].length === 3) {
      rise = -adj[near].reduce((sum, nb) => sum + (front[nb][2] - front[near][2]) / distance(front[nb], front[near]), 0);
    } else {
      continue;
    }
    vote += (bond.stereo === 1 ? 1 : -1) * Math.sign(rise);
  }
  return vote < 0 ? placed([-view[0], -view[1], -view[2]]) : front;
}
