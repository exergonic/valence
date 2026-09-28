import type { Molecule } from '../mol-parser';
import { assignHybridization } from '../chem/hybridize';

/**
 * Restore the planarity of trigonal centers inside 3-membered rings.
 *
 * MMFF94 has no reference angle for the SUBSTITUENT of a trigonal ring
 * carbon in a 3-ring: the generic H–C(sp²)–C(sp²) θ₀ (≈118°, mmff94 angle
 * `1-2-2-5`) collides with the ~150° a planar ring forces, so the force
 * field's true minimum puckers the exocyclic bond out of the ring plane.
 * Measured 2026-09-28 on the vendored mmff94-ts: the cyclopropenyl cation
 * optimizes to 41.5 kcal/mol with all three C–H bonds ~54° out of plane,
 * while a planar-constrained best is 47.9 kcal/mol (neutral cyclopropene is
 * worse: 41.5 pyramidal vs 67.9 planar). This is faithful MMFF94 — the field
 * genuinely cannot keep the ring planar — but the puckered ring is an
 * artifact of the parameterization, not the chemistry: a trigonal center in
 * a small ring is planar.
 *
 * The sketcher is the specification, so after the MMFF94 refinement we
 * project every exocyclic neighbor of an sp² ring atom back into the ring
 * plane (bond length preserved; a neighbor that sat exactly on the ring
 * normal lands on the outward bisector). sp³ ring atoms — cyclopropane's
 * CH₂, a 3-ring carbanion C⁻ — are LEFT alone: their out-of-plane hydrogen
 * geometry is real, and the charge-aware hybridization test (chem/hybridize,
 * the same electron-domain count the renderer uses) separates the two. A
 * carbonyl ring atom (cyclopropenone) is sp² and gets the same treatment.
 */
export function restoreThreeRingPlanarity(molecule: Molecule): Molecule {
  const rings = threeRings(molecule);
  if (rings.length === 0) return molecule;

  const atoms = molecule.atoms.map((a) => ({ ...a }));
  let changed = false;

  for (const tri of rings) {
    const [a, b, c] = tri;
    const n = ringNormal(atoms[a], atoms[b], atoms[c]);
    if (!n) continue;
    // Outward bisector at each ring atom: the negated sum of the two
    // ring-bond directions (the raw sum points at the triangle's centroid,
    // i.e. INTO the ring — the exocyclic hydrogen belongs away from it).
    const bisector = new Map<number, [number, number, number]>();
    for (const idx of tri) {
      const others = tri.filter((x) => x !== idx);
      const v1 = vec(atoms[others[0]], atoms[idx]);
      const v2 = vec(atoms[others[1]], atoms[idx]);
      const bx = (v1[0] + v2[0]) / 2, by = (v1[1] + v2[1]) / 2, bz = (v1[2] + v2[2]) / 2;
      const bl = Math.hypot(bx, by, bz);
      if (bl > 1e-9) bisector.set(idx, [-bx / bl, -by / bl, -bz / bl]);
    }

    for (const ringIdx of tri) {
      if (!isPlanarCenter(molecule, ringIdx)) continue;
      const b = bisector.get(ringIdx);
      if (!b) continue;
      for (const bond of molecule.bonds) {
        const k = bond.atom1Index === ringIdx ? bond.atom2Index
          : bond.atom2Index === ringIdx ? bond.atom1Index : -1;
        if (k < 0 || tri.includes(k)) continue; // exocyclic neighbors only
        const p = projectToPlane(atoms[k], atoms[ringIdx], n, b);
        if (!p) continue;
        atoms[k] = { ...atoms[k], ...p };
        changed = true;
      }
    }
  }

  return changed ? { atoms, bonds: molecule.bonds } : molecule;
}

/** A ring atom's sp² test — the same electron-domain bookkeeping as the
 *  renderer: σ bonds + charge-shifted lone pairs. A carbanion C⁻ (3 σ,
 *  charge −1) reads sp³ and keeps its pyramid; a cation or alkene carbon
 *  reads sp² and gets flattened. */
function isPlanarCenter(molecule: Molecule, idx: number): boolean {
  const a = molecule.atoms[idx];
  let sigma = 0;
  let pi = 0;
  for (const bond of molecule.bonds) {
    if (bond.atom1Index !== idx && bond.atom2Index !== idx) continue;
    sigma += 1;
    if (bond.order > 1) pi += bond.order - 1;
  }
  return assignHybridization(a.element, sigma, pi, a.charge ?? 0).hybridization === 'sp2';
}

/** All 3-atom rings (a bond plus a common neighbor bonded to both ends). */
function threeRings(molecule: Molecule): number[][] {
  const adj = new Map<number, Set<number>>();
  for (const bond of molecule.bonds) {
    if (!adj.has(bond.atom1Index)) adj.set(bond.atom1Index, new Set());
    if (!adj.has(bond.atom2Index)) adj.set(bond.atom2Index, new Set());
    adj.get(bond.atom1Index)!.add(bond.atom2Index);
    adj.get(bond.atom2Index)!.add(bond.atom1Index);
  }
  const seen = new Set<string>();
  const rings: number[][] = [];
  for (const bond of molecule.bonds) {
    const { atom1Index: i, atom2Index: j } = bond;
    for (const k of adj.get(i) ?? []) {
      if (k === j) continue;
      if (adj.get(j)?.has(k)) {
        const key = [i, j, k].sort((x, y) => x - y).join(',');
        if (!seen.has(key)) {
          seen.add(key);
          rings.push([i, j, k]);
        }
      }
    }
  }
  return rings;
}

/** Unit normal of the plane through three atoms (Newell's method). */
function ringNormal(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): [number, number, number] | null {
  let nx = 0, ny = 0, nz = 0;
  for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
    nx += (p.y - q.y) * (p.z + q.z);
    ny += (p.z - q.z) * (p.x + q.x);
    nz += (p.x - q.x) * (p.y + q.y);
  }
  const n = Math.hypot(nx, ny, nz);
  if (n < 1e-9) return null;
  return [nx / n, ny / n, nz / n];
}

function vec(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): [number, number, number] {
  return [a.x - b.x, a.y - b.y, a.z - b.z];
}

/** Project the neighbor onto the ring plane through `ring`, preserving the
 *  bond length. A neighbor sitting exactly on the ring normal has no
 *  in-plane component to keep — it lands along the outward bisector. */
function projectToPlane(
  neighbor: { x: number; y: number; z: number },
  ring: { x: number; y: number; z: number },
  n: [number, number, number],
  bisector: [number, number, number],
): { x: number; y: number; z: number } | null {
  const dx = neighbor.x - ring.x;
  const dy = neighbor.y - ring.y;
  const dz = neighbor.z - ring.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return null;

  const along = n[0] * dx + n[1] * dy + n[2] * dz;
  const px = dx - along * n[0];
  const py = dy - along * n[1];
  const pz = dz - along * n[2];
  const pl = Math.hypot(px, py, pz);
  if (pl > 1e-6) {
    const s = len / pl;
    return { x: ring.x + px * s, y: ring.y + py * s, z: ring.z + pz * s };
  }
  return {
    x: ring.x + bisector[0] * len,
    y: ring.y + bisector[1] * len,
    z: ring.z + bisector[2] * len,
  };
}