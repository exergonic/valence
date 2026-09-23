import * as THREE from 'three';
import type { Atom, Bond } from '../mol-parser';
import type { DisplaySettings } from './setup';

/** Single-bond radius in Å, before bondScale — Avogadro's ball-and-stick default. */
const BOND_RADIUS = 0.1;

/** Sub-cylinders for a bond of a given order, as offsets from the bond axis
 *  and radii, both in units of the single-bond radius.  Doubles and triples
 *  are symmetric about the axis — the textbook two-line look — rather than
 *  Avogadro's overlapping pair (1.3r cylinders at ±r), which reads as one
 *  thick bond with a seam. */
export function bondCylinders(order: number, radius: number): { offset: number; radius: number }[] {
  switch (order) {
    case 2:
      return [
        { offset: -0.85 * radius, radius: 0.65 * radius },
        { offset: 0.85 * radius, radius: 0.65 * radius },
      ];
    case 3:
      return [
        { offset: -1.5 * radius, radius: 0.6 * radius },
        { offset: 0, radius: 0.6 * radius },
        { offset: 1.5 * radius, radius: 0.6 * radius },
      ];
    default:
      return [{ offset: 0, radius }];
  }
}

/** Unit vector perpendicular to the bond axis, preferring one that lies in the
 *  plane of a neighbouring bond: that is what puts a double bond's second line
 *  in the molecular plane, the way a textbook drawing shows it.  Collinear
 *  cases (diatomics, terminal triple bonds) fall back to any perpendicular. */
export function bondPerpendicular(atoms: Atom[], bonds: Bond[], bond: Bond, axis: THREE.Vector3): THREE.Vector3 {
  for (const [center, far] of [
    [bond.atom1Index, bond.atom2Index],
    [bond.atom2Index, bond.atom1Index],
  ]) {
    for (const other of bonds) {
      if (other === bond) continue;
      const neighbor =
        other.atom1Index === center ? other.atom2Index : other.atom2Index === center ? other.atom1Index : -1;
      if (neighbor < 0 || neighbor === far) continue;
      const c = atoms[center];
      const n = atoms[neighbor];
      if (!c || !n) continue;
      // The neighbour direction with its along-axis part removed: in the plane
      // of the two bonds.  (A cross product would give the plane NORMAL, not
      // the in-plane perpendicular.)
      const reference = new THREE.Vector3(n.x - c.x, n.y - c.y, n.z - c.z);
      const perpendicular = reference.addScaledVector(axis, -reference.dot(axis));
      if (perpendicular.lengthSq() > 1e-6) return perpendicular.normalize();
    }
  }
  const reference = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(axis, reference).normalize();
}

export function renderBonds(group: THREE.Group, atoms: Atom[], bonds: Bond[], display?: DisplaySettings) {
  const scale = display?.bondScale ?? 1;
  const radius = BOND_RADIUS * scale;
  for (const bond of bonds) {
    const a1 = atoms[bond.atom1Index];
    const a2 = atoms[bond.atom2Index];
    if (!a1 || !a2) continue;

    const p1 = new THREE.Vector3(a1.x, a1.y, a1.z);
    const p2 = new THREE.Vector3(a2.x, a2.y, a2.z);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const length = dir.length();
    dir.normalize();

    const perpendicular = bondPerpendicular(atoms, bonds, bond, dir);
    const mat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    for (const cylinder of bondCylinders(bond.order, radius)) {
      const geo = new THREE.CylinderGeometry(cylinder.radius, cylinder.radius, length, 8);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(mid).addScaledVector(perpendicular, cylinder.offset);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.userData = { atom1Index: bond.atom1Index, atom2Index: bond.atom2Index, lobeType: 'bond' };
      group.add(mesh);
    }
  }
}
