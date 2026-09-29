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
import { createLobeMesh, orientLobe, piLobe } from './lobes';

/** The textbook phase pair: the app's π blue against a warm contrast. */
export const MO_PHASE_POSITIVE = 0x4488ff;
export const MO_PHASE_NEGATIVE = 0xff6644;

/** Contributions smaller than this fraction of the MO's largest are not drawn. */
const SIGNIFICANT = 0.08;

export function renderMoOrbitals(
  group: THREE.Group,
  molecule: Molecule,
  basis: BasisFunction[],
  coefficients: number[][],
  moIndex: number,
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
): void {
  const mo = coefficients[moIndex];
  if (!mo) return;
  let largest = 0;
  for (const c of mo) largest = Math.max(largest, Math.abs(c));
  if (largest <= 1e-9) return;

  for (let i = 0; i < basis.length; i++) {
    const coefficient = mo[i];
    const weight = Math.abs(coefficient) / largest;
    if (weight < SIGNIFICANT) continue;
    const orbital = basis[i];
    const atom = molecule.atoms[orbital.atomIndex];
    const origin: [number, number, number] = [atom.x, atom.y, atom.z];
    const positive = coefficient >= 0;
    const color = positive ? MO_PHASE_POSITIVE : MO_PHASE_NEGATIVE;
    const size = 0.30 + 0.42 * weight;
    // the basis label already reads "2px" / "2s" — reuse its tail
    const shortName = orbital.label.split(' ').pop() ?? '';
    const label = `${shortName} ${coefficient >= 0 ? '+' : '−'}${Math.abs(coefficient).toFixed(2)}`;

    if (orbital.angular === 's') {
      // an s contribution is a sphere, its phase its color
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.30 * size, 16, 16),
        new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      mesh.position.set(origin[0], origin[1], origin[2]);
      mesh.userData = { atomIndex: orbital.atomIndex, element: atom.element, lobeType: 'mo', label };
      group.add(mesh);
      continue;
    }

    // p: the dumbbell along its own axis, the far half in the opposite phase
    const near = createLobeMesh(piLobe(), color, 0.75, preset, size);
    near.userData = { atomIndex: orbital.atomIndex, element: atom.element, lobeType: 'mo', label };
    orientLobe(near, origin, orbital.axis);
    group.add(near);

    const far = createLobeMesh(
      piLobe(),
      positive ? MO_PHASE_NEGATIVE : MO_PHASE_POSITIVE,
      0.75,
      preset,
      size,
    );
    far.userData = { atomIndex: orbital.atomIndex, element: atom.element, lobeType: 'mo', label };
    orientLobe(far, origin, [-orbital.axis[0], -orbital.axis[1], -orbital.axis[2]]);
    group.add(far);
  }
}
