import * as THREE from 'three';
import type { Atom, Bond } from '../mol-parser';
import type { DisplaySettings } from './setup';
import { getElementColor } from './chem-data';
import { atomEnvMap, atomLayer, makeAtomMaterial } from './atom-styles';

/** Single-bond radius in Å, before bondScale — Avogadro's ball-and-stick default. */
const BOND_RADIUS = 0.1;
/** The stick representation's radius in Å, before bondScale: thicker than a
 *  ball-and-stick bond, since the stick is the whole picture. */
const STICK_RADIUS = 0.16;

/** A stick's radius — the bonds' and the joints' — with the Bond size slider. */
export function stickRadius(display?: DisplaySettings): number {
  return STICK_RADIUS * (display?.bondScale ?? 1);
}

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

/** A dashed bond's period (one dash and one gap) in Å, and the dash's share of
 *  it: short enough that a 2.6 Å partial bond reads as a row of dashes. */
const DASH_PERIOD = 0.26;
const DASH_FILL = 0.55;

/** The dashes of a partial bond `length` Å long, as spans from atom 1 to
 *  atom 2: whole dashes, each centred in its period, never fewer than three. */
export function dashSpans(length: number): [number, number][] {
  const n = Math.max(3, Math.round(length / DASH_PERIOD));
  return Array.from({ length: n }, (_, k) => [(k + (1 - DASH_FILL) / 2) / n, (k + (1 + DASH_FILL) / 2) / n]);
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

export function renderBonds(
  group: THREE.Group,
  atoms: Atom[],
  bonds: Bond[],
  display?: DisplaySettings,
  renderer?: THREE.WebGLRenderer,
) {
  const scale = display?.bondScale ?? 1;
  const stick = display?.representation === 'stick';
  const radius = stick ? stickRadius(display) : BOND_RADIUS * scale;
  // A stick is drawn in the atoms' own material and light rig, half in each
  // atom's colour, so a joint does not change shade where bond meets atom.
  const style = display?.atomStyle ?? 'classic';
  const env = stick && style !== 'classic' && renderer ? atomEnvMap(renderer) : null;
  const halves = (bond: Bond) => [
    { span: [0, 0.5] as [number, number], color: getElementColor(atoms[bond.atom1Index].element) },
    { span: [0.5, 1] as [number, number], color: getElementColor(atoms[bond.atom2Index].element) },
  ];
  for (const bond of bonds) {
    const a1 = atoms[bond.atom1Index];
    const a2 = atoms[bond.atom2Index];
    if (!a1 || !a2) continue;

    const p1 = new THREE.Vector3(a1.x, a1.y, a1.z);
    const p2 = new THREE.Vector3(a2.x, a2.y, a2.z);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const length = dir.length();
    dir.normalize();

    const perpendicular = bondPerpendicular(atoms, bonds, bond, dir);
    // `span` is the stretch of the bond a mesh covers, as fractions from atom 1
    // to atom 2: the vibration reads it to move a half-bond with its atoms
    const whole = stick
      ? halves(bond).map(({ span, color }) => ({ span, material: makeAtomMaterial(style, color, env), layer: atomLayer(style) }))
      : [{ span: [0, 1] as [number, number], material: new THREE.MeshPhongMaterial({ color: 0xcccccc }), layer: 0 }];
    // A drawn bond GFN2 stretched past a full bond (bond-integrity.ts) is drawn
    // as the textbook draws a partial bond: one dashed line, whatever the
    // sketch's order. A dash takes the material of the half its middle is in.
    const pieces = bond.stretched
      ? dashSpans(length).map((span) => ({ ...whole[(span[0] + span[1]) / 2 > 0.5 ? whole.length - 1 : 0], span }))
      : whole;
    const cylinders = bond.stretched ? [{ offset: 0, radius }] : bondCylinders(bond.order, radius);
    for (const cylinder of cylinders) {
      for (const { span, material, layer } of pieces) {
        const geo = new THREE.CylinderGeometry(cylinder.radius, cylinder.radius, length * (span[1] - span[0]), stick ? 16 : 8);
        const mesh = new THREE.Mesh(geo, material);
        mesh.layers.set(layer);
        mesh.position.copy(p1).addScaledVector(dir, length * (span[0] + span[1]) / 2)
          .addScaledVector(perpendicular, cylinder.offset);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        mesh.userData = { atom1Index: bond.atom1Index, atom2Index: bond.atom2Index, lobeType: 'bond', span };
        group.add(mesh);
      }
    }
  }
}
