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
 * A symmetry-breaking kick precedes the optimization for RING
 * molecules only: the embedder's ring seed is a symmetric saddle the
 * kick escapes faster, while acyclic molecules are best optimized
 * as-is (see refineWithMMFF94's comment for the measurements).
 */
import { optimize_lbfgs } from 'mmff94-ts';
import type { Molecule as MMFFMolecule } from 'mmff94-ts';
import type { Molecule } from '../mol-parser';
import { fillMissingHydrogens } from '../chem/hydrogens';
import { place3D, hasRingBonds } from './place3d';

/** Deterministic ±0.5 hash of the atom index (reproducible tests). */
function hash(i: number, seed: number): number {
  return (((i + 1) * 2654435761 + seed * 97) % 1000) / 1000 - 0.5;
}

/**
 * A generic de-overlap pre-pass for the embedded geometry: the
 * graph-walk embedder can place nonbonded atoms almost on top of each
 * other (cyclooctane's ring H's land 0.90 Å apart), and the optimizer
 * then grinds hundreds of iterations pushing them apart through the
 * steep vdW wall. Any nonbonded pair closer than 1.0 Å is pushed apart
 * to 1.0 Å along the pair axis (bonded pairs excluded — their
 * equilibrium is ~1.0-1.5 Å). Two passes: the second resolves overlaps
 * the first pass's pushes created.
 */
function separateOverlaps(molecule: Molecule): Molecule {
  const MIN_DIST = 1.0;
  const bonded = new Set<string>();
  for (const b of molecule.bonds) {
    bonded.add(`${Math.min(b.atom1Index, b.atom2Index)}-${Math.max(b.atom1Index, b.atom2Index)}`);
  }
  const atoms = molecule.atoms.map((a) => ({ ...a }));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        if (bonded.has(`${i}-${j}`)) continue;
        const dx = atoms[j].x - atoms[i].x;
        const dy = atoms[j].y - atoms[i].y;
        const dz = atoms[j].z - atoms[i].z;
        const d = Math.hypot(dx, dy, dz);
        if (d < MIN_DIST) {
          const push = (MIN_DIST - d) / 2;
          // Exactly-coincident atoms (d === 0) have no direction to
          // push along — the 5-vector wrap used to land a 5th
          // substituent on top of the 1st, and dx/0 = NaN corrupted
          // BOTH atoms (the 2026-08-12 PCl5 report). Nudge along x.
          const ux = d > 1e-9 ? dx / d : 1;
          const uy = d > 1e-9 ? dy / d : 0;
          const uz = d > 1e-9 ? dz / d : 0;
          atoms[i].x -= ux * push; atoms[i].y -= uy * push; atoms[i].z -= uz * push;
          atoms[j].x += ux * push; atoms[j].y += uy * push; atoms[j].z += uz * push;
        }
      }
    }
  }
  return { atoms, bonds: molecule.bonds };
}

/**
 * The full local geometry pipeline: add implicit hydrogens, embed with
 * the graph-walk embedder, separate any overlapping atoms, then refine
 * with MMFF94. Returns the best geometry available (refined, or the
 * separated placed guess when the refinement cannot type the
 * molecule). Runs inside the geometry worker for large molecules; also
 * the synchronous fallback when Workers are unavailable.
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
  const fallback = separateOverlaps(placed);
  // Never hand a NaN molecule to the renderer — a degenerate start
  // (e.g. a 5-coordinate center whose 5th substituent overlapped the
  // 1st) can poison the refine; the separated guess must be finite
  // or the caller keeps its own geometry (the Ar no-op contract).
  const finite = (m: Molecule) =>
    m.atoms.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z));
  const refined = refineWithMMFF94(fallback);
  if (refined && finite(refined)) return refined;
  return finite(fallback) ? fallback : placed;
}

export function refineWithMMFF94(molecule: Molecule): Molecule | null {
  try {
    // The symmetry-breaking kick applies to every molecule: the
    // embedder emits exact symmetries, and a symmetric start can
    // trap the optimizer at a spurious stationary point. Measured on
    // vinyl phosphine (2026-08-06): from the placed start the plain
    // descent converged at a trigonal-planar P (E 20.77 — a real
    // stationary point of the potential, Tinker's potential agrees),
    // while a 0.01 Å perturbation escaped to the pyramidal minimum
    // (E 10.45, H-P-H 101°). The magnitude matters: ring molecules
    // need the 0.1 Å nudge to leave their equal-amplitude pucker
    // saddle (cyclooctane 390→223 ms), while acyclic molecules grind
    // on a 0.1 Å kick (vinyl phosphine: 1000+ iterations never
    // converged — the old strong-Wolfe stall) but converge cleanly
    // with 0.05 Å (157 iterations, 172 ms — the measured sweet spot;
    // 0.01 Å is slower and 0.1 Å re-triggers the grind). The kick is
    // deterministic (index-hashed) for reproducible tests.
    const kick = hasRingBonds(molecule) ? 0.1 : 0.05;
    const start: Molecule = kick
      ? {
          atoms: molecule.atoms.map((a, i) => ({
            ...a,
            x: a.x + kick * hash(i, 1),
            y: a.y + kick * hash(i, 2),
            z: a.z + kick * hash(i, 3),
          })),
          bonds: molecule.bonds,
        }
      : molecule;

    const mmff: MMFFMolecule = {
      atoms: start.atoms.map((a, i) => ({
        index: i, element: a.element, x: a.x, y: a.y, z: a.z,
      })),
      bonds: start.bonds.map((b) => ({
        atom1: b.atom1Index, atom2: b.atom2Index, bond_order: b.order,
      })),
    };

    const result = optimize_lbfgs(mmff, { max_iterations: 200 });
    // The 200-iteration budget (measured 2026-08-06, diethylphosphine):
    // the fallback geometry's bonds/angles are converged long before
    // the energy's soft torsional modes, which creep at 1e-3/step —
    // the full 1000-iteration convergence cost 404 ms on a 16-atom
    // molecule, and pathological starts (JSME-layout-dependent descent
    // trajectories) ground the strong-Wolfe line search to a full
    // ~16 s. At the cap the geometry is identical and the worst case
    // is bounded (~300 ms); the ethane −4.73436 and vinyl-phosphine
    // pyramidal pins converge within the cap and hold exactly.
    const refined = result.molecule.atoms;
    if (refined.length !== molecule.atoms.length) return null;
    // No-progress detection: an untypeable molecule is a silent no-op
    // for the optimizer (every term evaluates zero) — the geometry
    // comes back bitwise unchanged, and the caller should keep its
    // own.
    let moved = false;
    for (let i = 0; i < refined.length; i++) {
      if (
        refined[i].x !== start.atoms[i].x ||
        refined[i].y !== start.atoms[i].y ||
        refined[i].z !== start.atoms[i].z
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
