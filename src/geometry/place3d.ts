import type { Molecule } from '../mol-parser';
import { applyWedgeStereo } from './stereo-wedge';
import { vecSub, vecNormalize, rotateRodrigues, rotateToward, dihedralAngle, type Vec3 } from '../utils/vec3';
import { vseprBondVectors, SQUARE_PLANAR_VECTORS } from '../chem/vsepr/ideal-vsepr-vectors';
import { electronDomainCounts } from '../chem/vsepr/assign-orbitals';
import { dElectronCount } from '../chem/d-electron-count';
import { getCovalentRadius } from '../chem/radii';
import { newBondLimit } from './bond-integrity';

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

/** Which side of the line p→q the point x lies on, in the sketch's plane. */
function sideOf(p: { x: number; y: number }, q: { x: number; y: number }, x: { x: number; y: number }): number {
  return (q.x - p.x) * (x.y - p.y) - (q.y - p.y) * (x.x - p.x);
}

/**
 * The torsion about the bond parent–atom, chosen rather than left to chance.
 * The reference is a neighbour of the parent (heavy if it has one), and the
 * atom's first heavy child is turned to sit, about a single bond, ANTI to it
 * (180°: a straight chain becomes the all-anti zigzag, the alkane minimum,
 * with every other substituent staggered); about a double bond, CIS or TRANS
 * to it as the sketch draws them (0° or 180°), which is the configuration
 * the drawing asks for — the walk used to give cis- and trans-but-2-ene the
 * same 60° twist. The atom's free directions are turned together about the
 * bond, so their angles to each other are untouched.
 */
function setTorsion(
  molecule: Molecule,
  pos: Vec3[],
  adj: number[][],
  atom: number,
  parent: number,
  lead: number,
  directions: Vec3[],
): Vec3[] {
  const heavy = (i: number) => molecule.atoms[i].element !== 'H';
  const others = adj[parent].filter((nb) => nb !== atom && pos[nb]);
  const reference = others.find(heavy) ?? others[0];
  if (reference === undefined || lead === undefined) return directions;
  const order = molecule.bonds.find((b) =>
    (b.atom1Index === parent && b.atom2Index === atom) || (b.atom1Index === atom && b.atom2Index === parent))?.order ?? 1;
  if (order === 3) return directions; // linear: no torsion to set

  let target = Math.PI;
  if (order === 2 && heavy(reference) && heavy(lead)) {
    const [p, a, r, l] = [parent, atom, reference, lead].map((i) => molecule.atoms[i]);
    const sideR = sideOf(p, a, r);
    const sideL = sideOf(p, a, l);
    // same side of the double bond in the sketch: cis
    if (Math.abs(sideR) > 1e-6 && Math.abs(sideL) > 1e-6 && Math.sign(sideR) === Math.sign(sideL)) target = 0;
  }

  // the free direction nearest the target, and the turn that puts it there
  const at = pos[atom];
  const torsionOf = (v: Vec3) => dihedralAngle(pos[reference], pos[parent], at, [at[0] + v[0], at[1] + v[1], at[2] + v[2]]);
  const gap = (angle: number) => Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  const nearest = directions.reduce((best, v) => (Math.abs(gap(torsionOf(v))) < Math.abs(gap(torsionOf(best))) ? v : best));
  const turn = gap(torsionOf(nearest));
  const axis = vecNormalize(vecSub(at, pos[parent]));
  const cosT = Math.cos(turn);
  const sinT = Math.sin(turn);
  const turned = directions.map((v) => rotateRodrigues(v, axis, cosT, sinT));
  // the lead's slot first, so the caller hands it to the lead
  const leadSlot = directions.indexOf(nearest);
  return [turned[leadSlot], ...turned.filter((_, i) => i !== leadSlot)];
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

/** Å: a nonbonded contact this close in a start is a clash — well under any
 *  real one (a geminal H···H is 1.78 Å). A pair is also a clash when the
 *  bonding guard would call it a new bond (`newBondLimit`): the
 *  1,1-diphenylethylene bromonium started with its Br 1.89 Å from a phenyl's
 *  ortho carbon, past 1.5 Å but well inside C···Br's 2.36 Å (2026-10-24). */
const CLASH = 1.5;

/**
 * Rings are seeded flat from the sketch, so their orientation is the
 * drawing's, never chosen: two rings on one carbon (1,1-diphenylethane) start
 * coplanar, their inner ortho H's 0.61 Å apart, and the overlap pass then
 * squeezed each of those C–H bonds to 0.83 Å (2026-10-23). A ring hung on a
 * single bond is free to turn about it — the real molecule's phenyls twist
 * out of each other's way — so where the ring's side of such a bond clashes
 * with the rest, it is turned to the angle (in 15° steps) that leaves the
 * most room, the pass repeating while it helps. The smaller side turns, when both hold a ring.
 */
function turnClashingRings(molecule: Molecule, pos: Vec3[], adj: number[][], rings: Set<string>, ringAtoms: Set<number>): void {
  const n = molecule.atoms.length;
  // the atoms on `from`'s side of the bond from–across
  const sideOf = (from: number, across: number) => {
    const side = new Set<number>([from]);
    const queue = [from];
    while (queue.length > 0) {
      const atom = queue.shift()!;
      for (const nb of adj[atom]) {
        if ((atom === from && nb === across) || side.has(nb)) continue;
        side.add(nb);
        queue.push(nb);
      }
    }
    return side;
  };
  const distance = (i: number, j: number) => Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1], pos[i][2] - pos[j][2]);

  // a pair sharing a neighbour is exempt, as in the guard: its distance is
  // set by the angle between two bonds, and no turn changes it
  const shareNeighbour = (i: number, j: number) => adj[i].some((k) => adj[j].includes(k));
  const STEPS = 24; // 15° apart

  // Turning one ring changes what the next one sees — two phenyls on one
  // carbon have to settle together — so the pass repeats while it helps.
  for (let pass = 0; pass < 4; pass++) {
    let turnedAny = false;
    for (const bond of molecule.bonds) {
      const [a, b] = [bond.atom1Index, bond.atom2Index];
      if (bond.order !== 1 || rings.has(`${Math.min(a, b)}-${Math.max(a, b)}`)) continue;
      const sides = [sideOf(a, b), sideOf(b, a)].filter((side) => [...side].some((i) => ringAtoms.has(i)));
      if (sides.length === 0) continue;
      const turning = sides.reduce((small, side) => (side.size < small.size ? side : small));
      const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !turning.has(i));
      const pivot = turning.has(a) ? a : b;
      const fixed = pivot === a ? b : a;
      // the tightest contact across the bond, as its distance less the distance
      // that makes it a clash: negative is a clash
      const room = () => {
        let tightest = Infinity;
        for (const i of turning) {
          for (const j of rest) {
            if ((i === pivot && j === fixed) || shareNeighbour(i, j)) continue;
            const limit = Math.max(CLASH, newBondLimit(molecule.atoms[i].element, molecule.atoms[j].element));
            tightest = Math.min(tightest, distance(i, j) - limit);
          }
        }
        return tightest;
      };
      if (room() >= 0) continue;

      const axis = vecNormalize(vecSub(pos[pivot], pos[fixed]));
      const start = new Map([...turning].map((i) => [i, pos[i]]));
      const turnTo = (angle: number) => {
        const [cosT, sinT] = [Math.cos(angle), Math.sin(angle)];
        for (const [i, p] of start) {
          const v = rotateRodrigues(vecSub(p, pos[fixed]), axis, cosT, sinT);
          pos[i] = [pos[fixed][0] + v[0], pos[fixed][1] + v[1], pos[fixed][2] + v[2]];
        }
      };
      let best = 0;
      let bestRoom = room();
      for (let k = 1; k < STEPS; k++) {
        turnTo((2 * Math.PI * k) / STEPS);
        const r = room();
        if (r > bestRoom) {
          bestRoom = r;
          best = k;
        }
      }
      turnTo((2 * Math.PI * best) / STEPS);
      if (best !== 0) turnedAny = true;
    }
    if (!turnedAny) break;
  }
}

// The 3D embedder: graph-walk placement along ideal hybrid vectors at
// covalent bond lengths, each torsion chosen as the atom is placed (anti about
// single bonds, the sketch's cis/trans about double bonds — setTorsion). Its
// output is the GFN2 optimiser's start, and the structure shown when that
// optimisation cannot run.
/**
 * A four-coordinate d⁸ metal in a singlet is square planar: in a tetrahedral
 * field its eight d electrons would put four in the triply degenerate t₂ set,
 * which no closed shell can hold. Started tetrahedral, [Ni(CN)₄]²⁻ never
 * converged — GFN2's SCC oscillates there (NOTES.md, 2026-10-06). A triplet
 * (NiCl₄²⁻, the high-spin partner) keeps the tetrahedral start.
 */
function squarePlanarD8(molecule: Molecule, atom: number, coordinationNumber: number): boolean {
  return coordinationNumber === 4
    && (molecule.multiplicity ?? 1) === 1
    && dElectronCount(molecule, atom) === 8;
}

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
  const domains = electronDomainCounts(molecule);

  const pos: [number, number, number][] = new Array(n);
  const placed = new Set<number>();

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
  });

  // Ring H placement: the vector matching cannot know the ring plane,
  // so a flat ring's leftover "equatorial" vectors point INTO the ring
  // and adjacent H's collide (0.62 Å on cyclooctane). Place ring H's
  // chemically instead: the first H axial (along the ring normal), the
  // second equatorial — outward, along the bisector of the atom's own two
  // ring bonds, turned away from them. The axial H's of adjacent carbons
  // are then parallel and the equatorial ones diverge — no collisions.
  // "Outward" is the atom's own ring's: it was taken from the centroid of
  // every ring atom, and with two rings on one carbon (1,1-diphenylethane)
  // that centroid lies between the rings, so the inner atoms' H's pointed
  // into their own ring — 0.35 Å from a ring carbon, which the overlap pass
  // then tore to 1.85 Å from its neighbour (2026-10-23).
  if (ringAtoms.size > 0) {
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
      // Outward: opposite the sum of the two ring-bond directions, which
      // lies in their plane and bisects the ring angle (never zero here —
      // the bonds are not collinear, or the normal above would be).
      const out = [-(u1[0] + u2[0]), -(u1[1] + u2[1]), -(u1[2] + u2[2])];
      const lo = Math.hypot(...out);
      const eq: [number, number, number] = [out[0] / lo, out[1] / lo, out[2] / lo];

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

  const queue = [root, ...ringAtoms];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const coordinationNumber = adj[curr].length;
    // Lone pairs are electron domains too: the bonds go where the AXₘEₙ
    // shape puts them, not where the neighbour count alone would. Counted by
    // neighbours only, water started linear, ClF₃ trigonal planar (GFN2 found
    // a flat stationary point there, 15 kcal/mol above the T-shape, and
    // stayed) and ICl₄⁻ tetrahedral (it ended distorted, 17 kcal/mol above
    // square planar). A metal is not counted (domains 0): its neighbours set
    // its shape.
    //
    // Seven domains (IF₇ AX₇, XeF₆ AX₆E) are left undone on purpose, for now:
    // they start octahedral (the count tops out at six), not as a pentagonal
    // bipyramid. Decided with the user 2026-10-13 — they are rare in a
    // general-chemistry lesson, and GFN2 is left to find their shape.
    const vectors = squarePlanarD8(molecule, curr, coordinationNumber)
      ? SQUARE_PLANAR_VECTORS
      : vseprBondVectors(domains[curr], coordinationNumber);

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
        const toward: Vec3 = [dx / len, dy / len, dz / len];
        rotate = (v) => rotateToward(v, vectors[0], toward);
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

    let available = rotated.filter((_, i) => !used.has(i));
    if (available.length === 0) continue;

    // Heavy atoms before hydrogens: the first heavy child takes the slot
    // the torsion below is chosen for.
    const ordered = [
      ...unplaced.filter((nb) => molecule.atoms[nb].element !== 'H'),
      ...unplaced.filter((nb) => molecule.atoms[nb].element === 'H'),
    ];
    // An atom grown from one placed neighbour (a chain, a branch, a ring's
    // substituent) is free to turn about that bond, and the minimal rotation
    // that aligned its directions left the torsion arbitrary — chains came
    // out eclipsed and coiled (octane's C3 and C8 0.17 A apart). Set it.
    if (placedNeighbors.length === 1) {
      available = setTorsion(molecule, pos, adj, curr, placedNeighbors[0], ordered[0], available);
    }

    for (let k = 0; k < ordered.length; k++) {
      const vec = available[k % available.length];
      const nb = ordered[k];
      const length = bondLength(curr, nb);
      pos[nb] = [
        pos[curr][0] + length * vec[0],
        pos[curr][1] + length * vec[1],
        pos[curr][2] + length * vec[2],
      ];
      placed.add(nb);
      queue.push(nb);
    }
  }

  turnClashingRings(molecule, pos, adj, rings, ringAtoms);

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
