/**
 * The principal-axis frame: the orientation the extended-Hückel calculation
 * is run in, and the reason it needs one.
 *
 * The AO basis is tied to the coordinate axes — pz means "the p orbital along
 * z". That is only chemistry when the molecule's symmetry planes are the
 * coordinate planes, which is true of a hand-written example and false of
 * anything fetched or locally embedded: PubChem and the fallback embedder
 * place a ring in whatever plane their algorithm lands on. In that frame a π
 * orbital is a px/py/pz MIXTURE on every atom, so the picture shows skewed
 * lobes and extra contributions that have no chemical meaning — reported
 * 2026-09-29 on a local-pipeline benzene, where 6 of the 12 drawn AOs of the
 * HOMO were not pz.
 *
 * The fix is to do the calculation in the molecule's own frame: diagonalize
 * the inertia tensor and put the largest principal moment along z. For a
 * planar molecule the perpendicular-axis theorem puts the plane normal there
 * (the largest moment is the sum of the two in-plane ones), so a ring lands
 * in the xy plane and its π system is pz — the textbook picture, and the one
 * WebMO shows. The basis axes are then mapped back to the molecule's own
 * coordinates for rendering (see render/mo-lobes.ts), so nothing about the
 * displayed structure changes.
 *
 * The frame is deterministic: axes are ordered by moment, signed so their
 * largest component is positive, and completed right-handed. A degenerate
 * moment (a spherical or linear top) makes the choice arbitrary but still
 * consistent, which is all the physics needs — the eigenvalues are the same
 * in any frame, and that invariance is itself a test.
 */
import type { Molecule } from '../../mol-parser';
import { jacobiSymmetric } from '../../utils/eigen';
import { ATOMIC_MASS } from '../assign-mass';

export interface PrincipalFrame {
  /** The frame's x, y, z axes expressed in the molecule's coordinates. */
  axes: [[number, number, number], [number, number, number], [number, number, number]];
  /** The molecule's atoms expressed IN the frame (the geometry the overlap
   *  integrals and the Hamiltonian are built from). */
  atoms: Molecule['atoms'];
  /** The centre of mass the frame is centred on — frame coordinates are
   *  relative to it, so this is what maps a frame point back to the
   *  molecule's own coordinates. */
  origin: [number, number, number];
}

type Vec3 = [number, number, number];

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Flip an axis so its largest component is positive — a deterministic sign,
 *  so the same molecule always yields the same frame (and the same labels). */
function canonicalSign(v: Vec3): Vec3 {
  let index = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(v[i]) > Math.abs(v[index])) index = i;
  return v[index] < 0 ? [-v[0], -v[1], -v[2]] : v;
}

export function alignToPrincipalAxes(molecule: Molecule): PrincipalFrame {
  const atoms = molecule.atoms;
  if (atoms.length === 0) {
    return { axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], atoms, origin: [0, 0, 0] };
  }

  // centre of mass (an unknown element contributes no mass, as elsewhere)
  let mass = 0;
  const com: Vec3 = [0, 0, 0];
  for (const a of atoms) {
    const m = ATOMIC_MASS[a.element] ?? 0;
    mass += m;
    com[0] += m * a.x;
    com[1] += m * a.y;
    com[2] += m * a.z;
  }
  if (mass > 0) { com[0] /= mass; com[1] /= mass; com[2] /= mass; }

  // inertia tensor about the centre of mass
  const inertia = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const a of atoms) {
    const m = ATOMIC_MASS[a.element] ?? 0;
    const r: Vec3 = [a.x - com[0], a.y - com[1], a.z - com[2]];
    const r2 = dot(r, r);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        inertia[i][j] += m * ((i === j ? r2 : 0) - r[i] * r[j]);
      }
    }
  }

  const { values, vectors } = jacobiSymmetric(inertia);
  // eigenvalues ascending; the LARGEST moment becomes z
  const order = [2, 1, 0];
  const zAxis = canonicalSign([vectors[0][order[0]], vectors[1][order[0]], vectors[2][order[0]]] as Vec3);
  const xAxis = canonicalSign([vectors[0][order[1]], vectors[1][order[1]], vectors[2][order[1]]] as Vec3);
  const yAxis = cross(zAxis, xAxis); // right-handed by construction
  void values;

  const axes: PrincipalFrame['axes'] = [xAxis, yAxis, zAxis];
  const framed = atoms.map((a) => {
    const r: Vec3 = [a.x - com[0], a.y - com[1], a.z - com[2]];
    return { ...a, x: dot(r, xAxis), y: dot(r, yAxis), z: dot(r, zAxis) };
  });
  return { axes, atoms: framed, origin: com };
}

/** A direction expressed in the frame, back in the molecule's coordinates. */
export function frameDirectionToWorld(
  frame: PrincipalFrame['axes'],
  direction: [number, number, number],
): [number, number, number] {
  const [x, y, z] = frame;
  return [
    direction[0] * x[0] + direction[1] * y[0] + direction[2] * z[0],
    direction[0] * x[1] + direction[1] * y[1] + direction[2] * z[1],
    direction[0] * x[2] + direction[1] * y[2] + direction[2] * z[2],
  ];
}
