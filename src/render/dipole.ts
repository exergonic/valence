import * as THREE from 'three';
import type { DipoleResult } from '../chem/dipole';
import { makeTextSprite } from './labels';

/**
 * The dipole arrow: a shaft + cone centered on the center of mass,
 * pointing along the CHEMISTRY convention (δ+ → δ−; the vector comes
 * pre-flipped from computeDipole), with a "+" marker at the positive
 * tail so the two ends read at a glance.
 *
 * Everything here draws WITHOUT depth testing: a dipole you toggle on
 * inside a molecule full of orbitals must be visible, or it is not worth
 * toggling. The trade — the arrow shows through atoms and lobes that sit
 * between it and the camera — is exactly what "the dipole is on top" is
 * for; it is the only overlay in the scene that works this way.
 *
 * Length scales with |μ| so the arrow feels like the property, but is
 * clamped so a large dipole (acetate's ≈4.5 D — measured 2026-09-28 on
 * the wB97X-D3/def2-TZVP geometry) does not sprout a javelin through
 * the scene: L = clamp(0.4 Å/D · μ, 0.8, 4.5) Å — water's 2.4 D (BCI)
 * gives ≈1 Å, roughly one O–H bond.
 */
const LENGTH_PER_DEBYE = 0.4;
const MIN_LENGTH = 0.8;
const MAX_LENGTH = 4.5;
/** Fraction of the arrow that is shaft (the rest is the cone head). */
const SHAFT_FRACTION = 0.72;
const SHAFT_RADIUS = 0.06;
const CONE_RADIUS = 0.14;
const ARROW_COLOR = 0xe03131;
/** A dipole this small is a numerical zero — no arrow, just the readout. */
const MIN_DEBYE = 0.05;
/** How far the "+" floats past the tail toward the camera (Å). */
const PLUS_PUSH = 0.35;

export function renderDipole(group: THREE.Group, dipole: DipoleResult): void {
  if (dipole.debye < MIN_DEBYE) return;
  const norm = Math.hypot(dipole.vector[0], dipole.vector[1], dipole.vector[2]);
  if (norm < 1e-9) return;

  const length = Math.min(Math.max(LENGTH_PER_DEBYE * dipole.debye, MIN_LENGTH), MAX_LENGTH);
  const shaftLen = length * SHAFT_FRACTION;
  const coneLen = length - shaftLen;
  const dir = new THREE.Vector3(dipole.vector[0], dipole.vector[1], dipole.vector[2]).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  // The arrow spans ±length/2 around the center of mass; the cone is the
  // +length/2 end — the δ− end. All meshes live at absolute coordinates
  // like the rest of the scene (groups carry no offset).
  const center = new THREE.Vector3(dipole.com[0], dipole.com[1], dipole.com[2]);
  // No depth test, no depth write: the arrow is an overlay that must stay
  // visible through the molecule's own geometry; it also never occludes
  // atoms behind it, so turning it on changes nothing but the arrow.
  const material = new THREE.MeshPhongMaterial({
    color: ARROW_COLOR,
    depthTest: false,
    depthWrite: false,
  });

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, shaftLen, 10), material);
  shaft.quaternion.copy(quat);
  shaft.position.copy(center).addScaledVector(dir, -coneLen / 2);
  group.add(shaft);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(CONE_RADIUS, coneLen, 14), material);
  cone.quaternion.copy(quat);
  // Cone base = shaft top = (shaftLen − coneLen)/2; its center sits there
  // plus half its own length, i.e. shaftLen/2 along the direction.
  cone.position.copy(center).addScaledVector(dir, shaftLen / 2);
  group.add(cone);

  // The "+" at the δ+ tail, using the same sprite look as the labels and
  // the same per-frame camera push (setup.ts runs updateLabels on this
  // group too). Labels keep depth testing, but this one must not: it is
  // part of the always-on-top arrow.
  const plus = makeTextSprite('+');
  (plus.material as THREE.SpriteMaterial).depthTest = false;
  const tail = center.clone().addScaledVector(dir, -length / 2);
  plus.position.set(tail.x, tail.y, tail.z);
  plus.userData = {
    atomX: tail.x, atomY: tail.y, atomZ: tail.z,
    push: PLUS_PUSH,
  };
  group.add(plus);
}
