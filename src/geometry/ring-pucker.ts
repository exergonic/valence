import type { Molecule } from '../mol-parser';
import { assignHybridization } from '../chem/vsepr/hybridize';

/**
 * MMFF94's 3-ring artifact, reported instead of repaired.
 *
 * MMFF94 has no reference angle for the SUBSTITUENT of a trigonal ring carbon
 * in a 3-membered ring: the generic H–C(sp²)–C(sp²) θ₀ (≈118°, mmff94 angle
 * `1-2-2-5`) collides with the ~150° a planar ring forces, so the force
 * field's true minimum puckers the exocyclic bond out of the ring plane.
 * Measured 2026-09-28 on the vendored mmff94-ts (cyclopropenyl cation: all
 * three C–H ~54° out of plane), and again 2026-10-02 through this pipeline
 * (0.83–1.00 Å for the cyclopropenyl cation, cyclopropene and the cyclopropyl
 * cation). The puckered ring is an artifact of the parameterization, not the
 * chemistry: a trigonal centre in a small ring is planar.
 *
 * The app does not move the atoms — the engine's geometry is what is shown.
 * The GFN2 tier gets these centres right on its own, and a post-hoc repair is
 * the kind of silent chemistry this app refuses; the geometry correction that
 * used to live here was removed 2026-10-02 for exactly that reason. What
 * remains is the report: one status line when a displayed non-GFN2 geometry
 * has an sp² ring centre whose exocyclic substituent sits far out of the ring
 * plane, so the artifact is never shipped without comment.
 *
 * sp³ ring atoms — cyclopropane's CH₂, a 3-ring carbanion C⁻ — are never
 * flagged: their out-of-plane geometry is real, and the charge-aware
 * hybridization test (chem/vsepr/hybridize, the same electron-domain count the
 * renderer uses) separates the two.
 */

/** Out-of-plane distance (Å) above which a trigonal ring centre counts as
 *  puckered. The MMFF94 artifact measures 0.83–1.00 Å; a genuine sp² centre
 *  sits within a few hundredths of its ring plane. */
const PUCKER_THRESHOLD_ANGSTROM = 0.25;

/** One warning per molecule, or none. */
export function ringPuckerWarnings(molecule: Molecule): string[] {
  for (const [a, b, c] of threeRings(molecule)) {
    const n = ringNormal(molecule.atoms[a], molecule.atoms[b], molecule.atoms[c]);
    if (!n) continue;
    for (const ringIdx of [a, b, c]) {
      if (!isPlanarCenter(molecule, ringIdx)) continue;
      const origin = molecule.atoms[ringIdx];
      for (const bond of molecule.bonds) {
        const k = bond.atom1Index === ringIdx ? bond.atom2Index
          : bond.atom2Index === ringIdx ? bond.atom1Index : -1;
        if (k < 0 || k === a || k === b || k === c) continue; // exocyclic only
        const p = molecule.atoms[k];
        const outOfPlane = Math.abs(
          n[0] * (p.x - origin.x) + n[1] * (p.y - origin.y) + n[2] * (p.z - origin.z),
        );
        if (outOfPlane > PUCKER_THRESHOLD_ANGSTROM) {
          return [
            '3-ring trigonal centre puckered — MMFF94 has no reference angle for it, '
            + 'so the refined geometry is approximate; refine with GFN2-xTB',
          ];
        }
      }
    }
  }
  return [];
}

/** A ring atom's sp² test — the same electron-domain bookkeeping as the
 *  renderer: σ bonds + charge-shifted lone pairs. A carbanion C⁻ (3 σ,
 *  charge −1) reads sp³ and is never flagged; a cation or alkene carbon
 *  reads sp². */
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
        if (seen.has(key)) continue;
        seen.add(key);
        rings.push([i, j, k]);
      }
    }
  }
  return rings;
}

/** Unit normal of the plane through three atoms (the 3-point case of Newell's
 *  method), or null when they are collinear. */
function ringNormal(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): [number, number, number] | null {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-9) return null;
  return [nx / len, ny / len, nz / len];
}
