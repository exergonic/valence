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
 * largest component is positive, and completed right-handed. A symmetric top
 * — two equal moments: benzene, BF₃, NH₃, CH₃Cl — leaves the two equal axes
 * free to turn about the unique one, and the eigensolver's choice is no
 * chemistry: on a snapped benzene it put the carbons 22° off the x axis. The
 * energies do not care, but the degenerate pairs are built against x
 * (canonicalize-degenerate.ts), so benzene's e1g HOMO came out as a mixture
 * of the textbook partners — 0.49/0.42/0.07 where the partner with a nodal
 * plane through two carbons has 0.46 on four and 0 on two — and its lobes
 * leaned (reported 2026-10-06). So a symmetric top's x axis is put through an
 * atom (see anchorAtom), which puts a mirror plane of the molecule in xz. A
 * spherical top (three equal moments: CH₄, SF₆) is still left as the solver
 * returns it.
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

/** Two principal moments this close (relative to the largest) are equal: a
 *  snapped geometry is exact to ~1e-12, and an unsnapped near-symmetric one
 *  is better anchored than left to the eigensolver. */
const SYMMETRIC_TOP_TOLERANCE = 1e-4;

/**
 * The direction, perpendicular to a symmetric top's unique axis, through the
 * heaviest atom off that axis — benzene's first carbon, BF₃'s first fluorine.
 * Ties go to the atom farther from the axis, then to the lower index, so the
 * frame is reproducible. Null when every atom is on the axis.
 */
function anchorAtom(atoms: Molecule['atoms'], com: Vec3, unique: Vec3): Vec3 | null {
  let best: { direction: Vec3; mass: number; distance: number } | null = null;
  for (const a of atoms) {
    const r: Vec3 = [a.x - com[0], a.y - com[1], a.z - com[2]];
    const along = dot(r, unique);
    const off: Vec3 = [r[0] - along * unique[0], r[1] - along * unique[1], r[2] - along * unique[2]];
    const distance = Math.sqrt(dot(off, off));
    if (distance < 0.1) continue; // on the axis (Å)
    const mass = ATOMIC_MASS[a.element] ?? 0;
    const better = !best || mass > best.mass + 1e-6
      || (Math.abs(mass - best.mass) <= 1e-6 && distance > best.distance + 1e-6);
    if (better) best = { direction: [off[0] / distance, off[1] / distance, off[2] / distance], mass, distance };
  }
  return best?.direction ?? null;
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
  const axis = (i: number): Vec3 => [vectors[0][i], vectors[1][i], vectors[2][i]];
  let zAxis = canonicalSign(axis(2));
  let xAxis = canonicalSign(axis(1));

  // A symmetric top: x through an atom, turned about the unique axis
  const equal = (i: number, j: number) => Math.abs(values[i] - values[j]) <= SYMMETRIC_TOP_TOLERANCE * values[2];
  const oblate = equal(0, 1) && !equal(1, 2); // the unique moment is the largest: the ring's normal
  const prolate = equal(1, 2) && !equal(0, 1); // the unique moment is the smallest: CH₃Cl's C–Cl
  if (oblate || prolate) {
    const unique = axis(oblate ? 2 : 0);
    const anchor = anchorAtom(atoms, com, unique);
    if (anchor) {
      xAxis = anchor;
      if (prolate) zAxis = canonicalSign(cross(xAxis, unique));
    }
  }
  const yAxis = cross(zAxis, xAxis); // right-handed by construction

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
