/**
 * The starting structure for a local optimisation: the sketch's implicit
 * hydrogens added, embedded in 3D by the graph-walk embedder (place3d.ts),
 * overlapping atoms pushed apart — and, after the engine has run, the drawn
 * wedges asserted on its result.
 *
 * The embedder's geometry is also what the app shows when GFN2-xTB cannot
 * deliver a minimum: chemically sane (ideal VSEPR directions, plausible bond
 * lengths once local-geometry.ts scales it), never relaxed, and labelled so.
 */
import type { Molecule } from '../mol-parser';
import { fillMissingHydrogens } from '../chem/fill-hydrogens';
import { place3D, hasRingBonds } from './place3d';
import { applyWedgeStereo } from './stereo-wedge';

/** Deterministic ±0.5 hash of the atom index (reproducible tests). */
function hash(i: number, seed: number): number {
  return (((i + 1) * 2654435761 + seed * 97) % 1000) / 1000 - 0.5;
}

/**
 * The deterministic symmetry-breaking kick before an optimisation: the
 * embedder emits exact symmetries (a drawn H–O–H lands exactly linear), and a
 * symmetric start traps a gradient optimiser at a spurious stationary point.
 * D∞h H₂O is a saddle whose bend gradient is exactly zero by symmetry, so the
 * descent relaxes the stretch and reports converged at 180° — the kick gives
 * it the transverse component it needs. The magnitudes (0.1 Å for rings, 0.05
 * Å otherwise) were measured on the MMFF94 surface this app used to optimise
 * on (2026-08-06: rings need 0.1 Å to leave their equal-amplitude pucker
 * saddle; acyclic molecules ground on 0.1 Å and converged cleanly at 0.05).
 * A saddle the kick does not avoid, the GFN2 run's Hessian check catches.
 */
export function breakSymmetry(molecule: Molecule): Molecule {
  const kick = hasRingBonds(molecule) ? 0.1 : 0.05;
  // spread the molecule, not just its atoms and bonds: a triplet that lost its
  // multiplicity here was optimised as a singlet — NiCl₄²⁻ went square planar
  return {
    ...molecule,
    atoms: molecule.atoms.map((a, i) => ({
      ...a,
      x: a.x + kick * hash(i, 1),
      y: a.y + kick * hash(i, 2),
      z: a.z + kick * hash(i, 3),
    })),
  };
}

/**
 * A generic de-overlap pre-pass for the embedded geometry: the
 * graph-walk embedder can place nonbonded atoms almost on top of each
 * other (cyclooctane's ring H's landed 0.90 units apart), and the optimizer
 * then grinds hundreds of iterations pushing them apart. Any nonbonded pair
 * closer than 1.2 Å is pushed apart to 1.2 Å along the pair axis (bonded
 * pairs excluded). 1.2 Å is safely under the shortest real nonbonded contact
 * in a start, a geminal H···H at ~1.78 Å; it was 1.0 when the embedder worked
 * in units of one bond (~1.5 Å). Two passes: the second resolves overlaps the
 * first pass's pushes created.
 */
function separateOverlaps(molecule: Molecule): Molecule {
  const MIN_DIST = 1.2;
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
  return { ...molecule, atoms };
}

export interface EmbedResult {
  molecule: Molecule;
  /** Stereo-enforcement failures from applyWedgeStereo (see stereo-wedge.ts). */
  warnings: string[];
}

/**
 * Never hand a NaN molecule to the renderer — a degenerate start (e.g. a
 * 5-coordinate center whose 5th substituent overlapped the 1st) can poison a
 * refinement.
 */
export function finite(molecule: Molecule): boolean {
  return molecule.atoms.every(
    (a) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z),
  );
}

/**
 * The starting geometry: add implicit hydrogens, embed with the graph-walk
 * embedder, then push any overlapping atoms apart. GFN2-xTB needs a sane 3D
 * start, and this is where it comes from — the embedder's idealised VSEPR
 * vectors are themselves a correct starting point, unlike a flat sketch.
 */
export function embed3D(molecule: Molecule): { sketch: Molecule; placed: Molecule; separated: Molecule } {
  const withH = fillMissingHydrogens(molecule);
  const coords = place3D(withH);
  const placed: Molecule = {
    ...withH,
    atoms: withH.atoms.map((a, i) => ({
      ...a, x: coords[i][0], y: coords[i][1], z: coords[i][2],
    })),
  };
  // `sketch` is the drawing with its hydrogens, still in the page's 2D frame:
  // the wedges are read against it (honourWedges), never against a 3D model.
  return { sketch: withH, placed, separated: separateOverlaps(placed) };
}

/**
 * Re-assert the drawn wedges on a finished geometry: pull the positions, run
 * the enforcement, write the corrected coordinates back. The sketch is the
 * specification, so this runs after the optimisation rather than before — the
 * optimiser walks downhill to the nearest minimum, and for a strained drawn
 * stereoisomer that minimum can belong to a different one.
 *
 * `sketch` must be the 2D drawing (with its hydrogens, embed3D's `sketch`):
 * which side of the page a wedge points to is read from its x,y. Handed the
 * 3D start instead, the "page" was an arbitrary projection of a model, and a
 * correct centre was inverted after the optimisation — hexan-2-amine's N moved
 * 2.3 A, its bonds left behind (2026-10-06).
 */
function finish(sketch: Molecule, refined: Molecule): EmbedResult {
  const pos = refined.atoms.map((a) => [a.x, a.y, a.z] as [number, number, number]);
  const warnings = applyWedgeStereo(sketch, pos);
  return {
    molecule: {
      ...refined,
      atoms: refined.atoms.map((a, i) => ({ ...a, x: pos[i][0], y: pos[i][1], z: pos[i][2] })),
    },
    warnings,
  };
}

/** The sketch's wedges are honoured, or the geometry is left as the engine made it. */
export function honourWedges(sketch: Molecule, refined: Molecule): EmbedResult {
  if (!sketch.bonds.some((b) => b.stereo)) return { molecule: refined, warnings: [] };
  return finish(sketch, refined);
}
