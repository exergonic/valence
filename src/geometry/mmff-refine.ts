/**
 * MMFF94 refinement of the fallback geometry — the mmff94-ts bridge.
 *
 * When PubChem and CIR both fail, the graph-walk embedder (place3d.ts)
 * produces a chemically sane but unrelaxed geometry. Refining it with
 * mmff94-ts's L-BFGS optimizer brings it to MMFF94 quality — the same
 * force field PubChem itself uses for its 3D SDFs.
 *
 * The adapter maps Valence's Molecule (atoms without an index field,
 * bonds named atom1Index/atom2Index/order) to mmff94-ts's shape
 * (index, atom1/atom2/bond_order). Any failure — an element or bond
 * mmff94-ts cannot type — returns null and the caller keeps the
 * unrefined geometry.
 *
 * A deterministic symmetry-breaking kick precedes the optimization:
 * the embedder emits exact symmetries (identical coordinates on
 * symmetric centers), and the MMFF94 torsion energy is stationary at
 * exactly-planar dihedrals — an eclipsed geometry is a genuine saddle
 * that a first-order optimizer cannot leave. The kick moves off the
 * stationary point so the optimizer can reach the true minimum.
 */
import { optimize_lbfgs } from 'mmff94-ts';
import type { Molecule as MMFFMolecule } from 'mmff94-ts';
import type { Molecule } from '../mol-parser';
import { fillMissingHydrogens } from '../chem/hydrogens';
import { place3D } from './place3d';

/** Deterministic ±0.5 hash of the atom index (reproducible tests). */
function hash(i: number, seed: number): number {
  return (((i + 1) * 2654435761 + seed * 97) % 1000) / 1000 - 0.5;
}

/** The symmetry-breaking kick: 0.1 Å per atom, index-hashed. */
const KICK = 0.1;

/**
 * The full local geometry pipeline: add implicit hydrogens, embed with
 * the graph-walk embedder, then refine with MMFF94. Returns the best
 * geometry available (refined, or the placed guess when the refinement
 * cannot type the molecule). Runs inside the geometry worker for large
 * molecules; also the synchronous fallback when Workers are
 * unavailable.
 */
export function embedAndRefine(molecule: Molecule): Molecule {
  const withH = fillMissingHydrogens(molecule);
  const coords = place3D(withH);
  const placed: Molecule = {
    atoms: withH.atoms.map((a, i) => ({
      ...a, x: coords[i][0], y: coords[i][1], z: coords[i][2],
    })),
    bonds: withH.bonds,
  };
  return refineWithMMFF94(placed) ?? placed;
}

export function refineWithMMFF94(molecule: Molecule): Molecule | null {
  try {
    // Kick first: break the embedder's exact symmetries (see the file
    // header). The kicked geometry is the optimizer's starting point.
    const kicked = {
      atoms: molecule.atoms.map((a, i) => ({
        ...a,
        x: a.x + KICK * hash(i, 1),
        y: a.y + KICK * hash(i, 2),
        z: a.z + KICK * hash(i, 3),
      })),
      bonds: molecule.bonds,
    };

    const mmff: MMFFMolecule = {
      atoms: kicked.atoms.map((a, i) => ({
        index: i, element: a.element, x: a.x, y: a.y, z: a.z,
      })),
      bonds: kicked.bonds.map((b) => ({
        atom1: b.atom1Index, atom2: b.atom2Index, bond_order: b.order,
      })),
    };

    const result = optimize_lbfgs(mmff);
    const refined = result.molecule.atoms;
    if (refined.length !== molecule.atoms.length) return null;
    // No-progress detection: an untypeable molecule is a silent no-op
    // for the optimizer (every term evaluates zero) — the kicked
    // geometry comes back bitwise unchanged, and the caller should
    // keep its own (un-kicked) geometry.
    let moved = false;
    for (let i = 0; i < refined.length; i++) {
      if (
        refined[i].x !== kicked.atoms[i].x ||
        refined[i].y !== kicked.atoms[i].y ||
        refined[i].z !== kicked.atoms[i].z
      ) {
        moved = true;
        break;
      }
    }
    if (!moved) return null;
    // A degenerate input could still produce NaN — never let that
    // reach the renderer.
    for (const a of refined) {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) {
        return null;
      }
    }

    return {
      atoms: molecule.atoms.map((a, i) => ({
        ...a, x: refined[i].x, y: refined[i].y, z: refined[i].z,
      })),
      bonds: molecule.bonds,
    };
  } catch {
    return null;
  }
}
