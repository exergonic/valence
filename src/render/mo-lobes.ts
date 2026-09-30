/**
 * The molecular-orbital picture: one extended-Hückel MO drawn over the
 * molecule, atom by atom, from the AO coefficients.
 *
 * This is the *second* orbital picture in the app, and it is deliberately a
 * different one from the VSEPR lobes in `orbitals.ts`: those follow
 * hybridisation and lone-pair directions, while an EH MO hands Cartesian
 * px/py/pz coefficients. So an MO lobe is an axis-aligned dumbbell — the p
 * axis it was computed on — with its two halves in opposite PHASES, which is
 * the whole point of looking at an MO: a bonding combination has neighbours
 * in phase, an antibonding one has them out of phase.
 *
 * Sizes are relative to the largest coefficient in the MO (an MO is a
 * *shape*, not a scale drawing), and contributions below `SIGNIFICANT` are
 * left out so a delocalised MO does not turn into fuzz.
 */
import * as THREE from 'three';
import type { Molecule } from '../mol-parser';
import type { BasisFunction } from '../chem/extended-huckel/assign-basis';
import { frameDirectionToWorld, type PrincipalFrame } from '../chem/extended-huckel/align-principal-axes';
import { createLobeMesh, orientLobe, piLobe } from './lobes';

/** The textbook phase pair: the app's π blue against a warm contrast. */
export const MO_PHASE_POSITIVE = 0x4488ff;
export const MO_PHASE_NEGATIVE = 0xff6644;

/**
 * The phase pairs, one per simultaneously drawn orbital. Two localized
 * orbitals picked for a hyperconjugation picture (a σ or a lone pair, and the
 * π* it reaches) have to be told apart, and each still needs its two phases
 * distinguishable — so they take different pairs, in the order they were
 * picked. The first pair is the long-standing blue/orange.
 */
export const MO_PHASE_PAIRS: Array<[number, number]> = [
  [MO_PHASE_POSITIVE, MO_PHASE_NEGATIVE],
  [0x33bb77, 0xcc55dd],
  [0xffcc33, 0x8855ff],
  [0x33cccc, 0xff5599],
];

/**
 * Give a lobe the MO picture's opacity, whatever the style preset chose. The
 * preset's opacity belongs to the hybrid-orbital picture; here the slider is
 * the authority, in both MO views and every style — otherwise the control goes
 * dead in the app's default (metallic) style.
 */
function applyMoOpacity(mesh: THREE.Mesh, opacity: number): void {
  const material = mesh.material as THREE.MeshPhongMaterial;
  material.transparent = opacity < 1;
  material.opacity = opacity;
  material.needsUpdate = true;
}

/** Contributions smaller than this fraction of the MO's largest are not
 *  drawn — and the MO panel's composition line lists the same set, so the
 *  numbers and the picture always agree. */
export const MO_SIGNIFICANT = 0.08;

export function renderMoOrbitals(
  group: THREE.Group,
  molecule: Molecule,
  basis: BasisFunction[],
  coefficients: number[][],
  moIndex: number,
  frame: PrincipalFrame['axes'],
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
  opacity = 0.75,
  phase: [number, number] = MO_PHASE_PAIRS[0],
): void {
  const [positiveColour, negativeColour] = phase;
  const mo = coefficients[moIndex];
  if (!mo) return;
  let largest = 0;
  for (const c of mo) largest = Math.max(largest, Math.abs(c));
  if (largest <= 1e-9) return;

  for (let i = 0; i < basis.length; i++) {
    const coefficient = mo[i];
    const weight = Math.abs(coefficient) / largest;
    if (weight < MO_SIGNIFICANT) continue;
    const orbital = basis[i];
    const atom = molecule.atoms[orbital.atomIndex];
    const origin: [number, number, number] = [atom.x, atom.y, atom.z];
    const positive = coefficient >= 0;
    const color = positive ? positiveColour : negativeColour;
    const size = 0.50 + 0.62 * weight;
    // the basis label already reads "2px" / "2s" — reuse its tail
    const shortName = orbital.label.split(' ').pop() ?? '';
    const label = `${shortName} ${coefficient >= 0 ? '+' : '−'}${Math.abs(coefficient).toFixed(2)}`;

    if (orbital.angular === 's') {
      // an s contribution is a sphere, its phase its color
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.30 * size, 16, 16),
        new THREE.MeshPhongMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      applyMoOpacity(mesh, opacity);
      mesh.position.set(origin[0], origin[1], origin[2]);
      mesh.userData = { atomIndex: orbital.atomIndex, element: atom.element, lobeType: 'mo', label };
      group.add(mesh);
      continue;
    }

    // p: the dumbbell along its own axis, the far half in the opposite phase.
    // The basis axis is a coordinate axis of the CALCULATION frame, so it is
    // rotated back into the molecule's own coordinates before it is drawn.
    const axis = frameDirectionToWorld(frame, orbital.axis);
    const near = createLobeMesh(piLobe(), color, opacity, preset, size);
    applyMoOpacity(near, opacity);
    near.userData = { atomIndex: orbital.atomIndex, element: atom.element, lobeType: 'mo', label };
    orientLobe(near, origin, axis);
    group.add(near);

    const far = createLobeMesh(
      piLobe(),
      positive ? negativeColour : positiveColour,
      opacity,
      preset,
      size,
    );
    applyMoOpacity(far, opacity);
    far.userData = { atomIndex: orbital.atomIndex, element: atom.element, lobeType: 'mo', label };
    orientLobe(far, origin, [-axis[0], -axis[1], -axis[2]]);
    group.add(far);
  }
}
