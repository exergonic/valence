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
import type { BasisFunction, DFunction } from '../chem/extended-huckel/assign-basis';
import { frameDirectionToWorld, type PrincipalFrame } from '../chem/extended-huckel/align-principal-axes';
import { getVisualRadius } from './chem-data';
import { createLobeMesh, orientLobe, piLobe } from './lobes';

/** The textbook phase pair: the app's π blue against a warm contrast. */
export const MO_PHASE_POSITIVE = 0x4488ff;
export const MO_PHASE_NEGATIVE = 0xff6644;

/**
 * Where a d function's lobes point, in the calculation frame, which phase each
 * carries, and how large it is next to the others. Four equal lobes for x²−y²,
 * xy, xz and yz; z² has two axial lobes and the negative collar, drawn as four
 * equatorial lobes at HALF size — its angular factor 3cos²θ − 1 is −1 in the
 * equator against +2 along the axis (the smooth surface draws the ring itself).
 */
function dLobes(kind: DFunction): Array<{ direction: [number, number, number]; positive: boolean; relative: number }> {
  const h = Math.SQRT1_2;
  const lobe = (direction: [number, number, number], positive: boolean, relative = 1) => ({ direction, positive, relative });
  switch (kind) {
    case 'x2-y2':
      return [
        lobe([1, 0, 0], true), lobe([-1, 0, 0], true),
        lobe([0, 1, 0], false), lobe([0, -1, 0], false),
      ];
    case 'z2':
      return [
        lobe([0, 0, 1], true), lobe([0, 0, -1], true),
        lobe([h, h, 0], false, 0.5), lobe([-h, h, 0], false, 0.5),
        lobe([-h, -h, 0], false, 0.5), lobe([h, -h, 0], false, 0.5),
      ];
    case 'xy':
      return [
        lobe([h, h, 0], true), lobe([-h, -h, 0], true),
        lobe([-h, h, 0], false), lobe([h, -h, 0], false),
      ];
    case 'xz':
      return [
        lobe([h, 0, h], true), lobe([-h, 0, -h], true),
        lobe([-h, 0, h], false), lobe([h, 0, -h], false),
      ];
    default: // yz
      return [
        lobe([0, h, h], true), lobe([0, -h, -h], true),
        lobe([0, -h, h], false), lobe([0, h, -h], false),
      ];
  }
}

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
    // Lobe scale, 0.75 (the weakest drawn) to 1.5 (the largest): a p lobe then
    // runs 0.8–1.7 Å from its nucleus, clear of every ball-and-stick atom
    // sphere (the largest, K, is 0.83 Å). At 0.50–1.12 the weak ones barely
    // cleared a carbon.
    const size = 0.75 + 0.75 * weight;
    // the basis label already reads "2px" / "2s" — reuse its tail
    const shortName = orbital.label.split(' ').pop() ?? '';
    const label = `${shortName} ${coefficient >= 0 ? '+' : '−'}${Math.abs(coefficient).toFixed(2)}`;

    if (orbital.angular === 's') {
      // An s contribution is a sphere, its phase its colour, sized from the
      // atom's own sphere: 1.15× it for the weakest drawn, 1.7× for the
      // largest. A fixed 0.15–0.34 Å (as this was) sat wholly inside every
      // atom — a hydrogen's is 0.36 Å — so no s contribution was ever visible.
      const radius = getVisualRadius(atom.element) * (1.15 + 0.55 * weight);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 24),
        new THREE.MeshPhongMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      applyMoOpacity(mesh, opacity);
      mesh.position.set(origin[0], origin[1], origin[2]);
      mesh.userData = { atomIndex: orbital.atomIndex, element: atom.element, lobeType: 'mo', label };
      group.add(mesh);
      continue;
    }

    if (orbital.angular === 'd') {
      // A d contribution drawn as a p dumbbell would be a lie about its shape,
      // so it gets its own lobes: four for x²−y², xy, xz and yz, and for z² the
      // two axial lobes plus the negative collar as four half-size equatorial
      // lobes. (The smooth surface draws all five exactly; this is the "which
      // AO, which phase" view, and a four-lobed cloverleaf is what that view
      // needs to say.)
      for (const lobe of dLobes(orbital.d!)) {
        const direction = frameDirectionToWorld(frame, lobe.direction);
        // the AO's own sign flips every lobe's phase, as it does for a p
        const samePhase = lobe.positive === positive;
        const mesh = createLobeMesh(piLobe(), samePhase ? positiveColour : negativeColour, opacity, preset, size * 0.85 * lobe.relative);
        applyMoOpacity(mesh, opacity);
        mesh.userData = { atomIndex: orbital.atomIndex, element: atom.element, lobeType: 'mo', label };
        orientLobe(mesh, origin, direction);
        group.add(mesh);
      }
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
