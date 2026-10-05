import type { Molecule } from '../mol-parser';
import { optimizeTorsions } from './torsions';
import { applyWedgeStereo } from './stereo-wedge';
import { vecDot, crossProduct, vecNormalize, rotateRodrigues } from '../utils/vec3';
import { idealVseprVectors } from '../chem/vsepr/ideal-vsepr-vectors';
import { getCovalentRadius } from '../chem/radii';

/**
 * The starting length of a bond (Å): the sum of the two atoms' single-bond
 * covalent radii (Cordero 2008), shortened for a multiple bond — C–C 1.52,
 * C=C 1.32, C≡C 1.19, against 1.53/1.34/1.20 measured. A start at the right
 * scale bond by bond is what lets the optimiser spend its steps on the shape:
 * with one uniform scale factor over a unit skeleton, benzene began at C–C
 * 2.07 Å and C–H 1.31 Å and took 137 GFN2 steps (10 s) mostly shrinking.
 */
const MULTIPLE_BOND_SHORTENING: Record<number, number> = { 2: 0.87, 3: 0.78 };

function bondLengthFor(molecule: Molecule): (i: number, j: number) => number {
  const order = new Map<string, number>();
  for (const b of molecule.bonds) {
    order.set(`${Math.min(b.atom1Index, b.atom2Index)}-${Math.max(b.atom1Index, b.atom2Index)}`, b.order);
  }
  return (i, j) => {
    const single = getCovalentRadius(molecule.atoms[i].element) + getCovalentRadius(molecule.atoms[j].element);
    return single * (MULTIPLE_BOND_SHORTENING[order.get(`${Math.min(i, j)}-${Math.max(i, j)}`) ?? 1] ?? 1);
  };
}



function alignVectors(from: [number, number, number], to: [number, number, number]): (v: [number, number, number]) => [number, number, number] {
  const dot = vecDot(from, to);
  if (Math.abs(dot - 1) < 1e-6) return (v) => v;
  if (Math.abs(dot + 1) < 1e-6) return (v) => [-v[0], -v[1], -v[2]];

  // Rotation axis (from × to), normalized, plus the cos/sin of the
  // angle between them. The closure applies the shared Rodrigues
  // rotation to each ideal vector.
  const naxis = vecNormalize(crossProduct(from, to));
  const cosA = dot;
  const sinA = Math.sqrt(1 - dot * dot);

  return (v) => rotateRodrigues(v, naxis, cosA, sinA);
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

// The 3D embedder: graph-walk placement along ideal hybrid vectors at
// covalent bond lengths, then staggered-alkane torsion optimization. Its
// output is the GFN2 optimiser's start, and the structure shown when that
// optimisation cannot run.
export function place3D(molecule: Molecule): [number, number, number][] {
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  // atoms carrying a π bond: planar in a ring, trigonal or linear anywhere
  const hasPi = new Array<boolean>(n).fill(false);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
    if (bond.order >= 2) {
      hasPi[bond.atom1Index] = true;
      hasPi[bond.atom2Index] = true;
    }
  }
  const bondLength = bondLengthFor(molecule);

  const pos: [number, number, number][] = new Array(n);
  const placed = new Set<number>();
  const parent: number[] = new Array(n).fill(-1);

  // Seed ring atoms from the 2D input: the sketcher's ring is a proper
  // polygon (correct closure, correct angles, no overlaps), while the
  // graph walk would leave the ring a broken zig-zag that the
  // optimizer then spends hundreds of iterations rebuilding. A saturated
  // ring is lifted with alternating ±z offsets (a rough pucker): a flat
  // cyclohexane is a high-energy symmetric start whose collective
  // puckering costs the optimizer hundreds of iterations. A ring atom
  // with a π bond stays in the plane (see below).
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
      const nbs = ringAdj.get(curr)!.filter((nb) => nb !== prev && !ringList.includes(nb));
      if (nbs.length === 0) {
        // The walk exhausted its cycle. Molecules with SEVERAL
        // SEPARATE rings (biphenyl, the triphenyl ylide) have
        // multiple disjoint cycles — restart the walk at the next
        // unplaced ring atom, or we crash later on pos[i] for the
        // unplaced rings (the centroid loop reads every ring atom).
        const next = [...ringAtoms].find((a) => !ringList.includes(a));
        if (next === undefined) break;
        prev = -1;
        curr = next;
      } else {
        prev = curr;
        curr = nbs[0];
      }
    }
  }
  // The sketch's ring is at the sketcher's scale; bring it to the bonds'
  // covalent lengths, one factor for the whole ring set (a ring has to close).
  let drawn = 0;
  let wanted = 0;
  for (const key of rings) {
    const [i, j] = key.split('-').map(Number);
    drawn += Math.hypot(molecule.atoms[i].x - molecule.atoms[j].x, molecule.atoms[i].y - molecule.atoms[j].y);
    wanted += bondLength(i, j);
  }
  const ringScale = drawn > 1e-9 ? wanted / drawn : 1;
  // Only saturated ring atoms are lifted. An atom with a π bond is trigonal
  // and its ring is planar: puckering benzene, as this did for every ring,
  // only gave the optimiser a ring to flatten.
  const PUCKER = 0.25; // Å, about cyclohexane's chair
  ringList.forEach((i, k) => {
    const lift = hasPi[i] ? 0 : (k % 2 === 0 ? 1 : -1) * PUCKER;
    pos[i] = [molecule.atoms[i].x * ringScale, molecule.atoms[i].y * ringScale, lift];
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

      // A trigonal ring atom (three neighbours: an aromatic or vinylic CH)
      // has only the in-plane slot; axial first put benzene's H's straight up
      // out of the ring.
      const slots = adj[i].length === 3 ? [eq] : [n, eq];
      for (let k = 0; k < hNbs.length && k < slots.length; k++) {
        const h = hNbs[k];
        const length = bondLength(i, h);
        pos[h] = [
          pos[i][0] + length * slots[k][0],
          pos[i][1] + length * slots[k][1],
          pos[i][2] + length * slots[k][2],
        ];
        placed.add(h);
        parent[h] = i;
      }
    }
  }

  // Root the walk on a ring atom when the molecule has a ring: the ring was
  // just seeded from the drawn coordinates, and rooting inside it keeps the
  // rest of the walk in that same frame. Rooting on a substituent instead
  // parks it at the origin while the ring stays where it was drawn — the
  // all-cis hexol's first oxygen ended up 5 A from the carbon it belongs to,
  // and the refinement, dragging it back, inverted a neighbouring center.
  let root = 0;
  for (let i = 0; i < n; i++) {
    if (molecule.atoms[i].element !== 'H' && adj[i].length > 0 && placed.has(i)) {
      root = i;
      break;
    }
  }
  if (!placed.has(root)) {
    for (let i = 0; i < n; i++) {
      if (molecule.atoms[i].element !== 'H' && adj[i].length > 0) {
        root = i;
        break;
      }
    }
    pos[root] = [0, 0, 0];
  }

  placed.add(root);
  parent[root] = root;

  const queue = [root, ...ringAtoms];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const coordinationNumber = adj[curr].length;
    const vectors = idealVseprVectors(coordinationNumber);

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
      const length = bondLength(curr, nb);
      pos[nb] = [
        pos[curr][0] + length * vec[0],
        pos[curr][1] + length * vec[1],
        pos[curr][2] + length * vec[2],
      ];
      placed.add(nb);
      parent[nb] = curr;
      queue.push(nb);
    }
  }

  optimizeTorsions(molecule, adj, parent, pos);

  // The drawn wedge and hash bonds fix each stereocenter's configuration, and
  // the graph walk knows nothing about them. This runs last, after the torsion
  // pass: a torsion rotation can carry a wedged atom along with a plain
  // neighbor, which would undo the very configuration just established.
  // Its warnings are deliberately dropped here — the final enforcement happens
  // after the optimisation (embed.ts, honourWedges), which collects them.
  applyWedgeStereo(molecule, pos);

  // Unplaced atoms (isolated) keep their 2D input coordinates.
  return pos.map((p, i) => p || [molecule.atoms[i].x, molecule.atoms[i].y, 0]);
}
