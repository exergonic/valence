/**
 * The local geometry pipeline — the app's own answer when no remote service
 * supplies a validated structure.
 *
 * **GFN2-xTB is the one engine.** A real semiempirical optimisation (extended
 * tight binding), structurally right where a force field is not: MMFF94, which
 * this app used to optimise with, bends PCl5's trigonal bipyramid into 138°
 * angles with the *axial* bonds the shortest, where GFN2 recovers the textbook
 * 2.156/2.027 Å split (verified against the Fortran xTB oracle, NOTES.md).
 *
 * The starting geometry is the embedder's — topologically correct (a real
 * trigonal bipyramid for PCl5), at covalent bond lengths, aromatic rings flat.
 *
 * **When GFN2 stops short** of full convergence (its time budget, or every
 * optimiser rung spent), the lowest-energy structure it reached is shown,
 * labelled as not fully converged. **When GFN2 produces nothing** — no Worker,
 * an element outside its parameter table, an SCC that fails from the start, a
 * cancelled run — the app shows the starting structure, labelled as
 * unoptimised and saying why. Never a second engine's answer passed off as the
 * first's, and never an unconverged run presented as converged.
 */
import type { Molecule } from '../mol-parser';
import { Gfn2Cancelled, Gfn2Unavailable, refineWithGfn2, type Gfn2Progress, type Gfn2Result } from './gfn2-refine';
import { embed3D, finite, honourWedges, type EmbedResult } from './embed';

export interface LocalGeometry extends EmbedResult {
  /** 'gfn2': a GFN2-xTB optimisation — converged, or the lowest point of a run
   *  that stopped short (`gfn2.converged` says which). 'unrefined': the
   *  embedder's starting structure, because GFN2 produced nothing. */
  engine: 'gfn2' | 'unrefined';
  /** The run, when engine is 'gfn2' — energy, steps, time, charges, the
   *  Hessian verdict and any saddle escapes. */
  gfn2?: Gfn2Result;
  /** Why the start is shown (engine 'unrefined'), as a sentence for the Info
   *  log. */
  unrefinedReason?: string;
}

/** How the start gets optimised — the worker in the app. A test passes the
 *  engine loaded from disk instead, and so runs this very pipeline in Node. */
export type Gfn2Refiner = (start: Molecule, onProgress?: (progress: Gfn2Progress) => void) => Promise<Gfn2Result | null>;

export async function computeLocalGeometry(
  molecule: Molecule,
  onProgress?: (progress: Gfn2Progress) => void,
  refine: Gfn2Refiner = refineWithGfn2,
): Promise<LocalGeometry | null> {
  const { sketch, placed, separated } = embed3D(molecule);
  const start = finite(separated) ? separated : placed;
  // A start that is not even finite has nothing to show: refuse.
  if (!finite(start)) return null;

  const unrefined = (reason: string): LocalGeometry => ({
    ...honourWedges(sketch, start),
    engine: 'unrefined',
    unrefinedReason: reason,
  });

  let refined: Gfn2Result | null;
  try {
    refined = await refine(start, onProgress);
  } catch (error) {
    if (error instanceof Gfn2Cancelled) return unrefined('the GFN2-xTB optimisation was cancelled');
    if (error instanceof Gfn2Unavailable) return unrefined(error.message);
    const detail = (error as Error)?.message;
    return unrefined(`GFN2-xTB could not treat this structure${detail ? ` (${detail})` : ''}`);
  }
  if (!refined) return unrefined('GFN2-xTB found no usable geometry from the starting structure');
  if (!finite(refined.molecule)) return unrefined('GFN2-xTB returned a non-finite structure');
  // A run that stopped short of full convergence (out of time, or every rung
  // spent) still returns the lowest-energy structure it reached — never higher
  // than the start, and after hundreds of GFN2 steps nearly always the better
  // picture. It is shown, and labelled as not fully converged (gfn2.converged);
  // for a teaching tool a good-enough structure beats the unoptimised guess.

  // The engine's geometry is the authority — no post-hoc repair; only the
  // drawn wedges are asserted, because the sketch is the specification.
  return { ...honourWedges(sketch, refined.molecule), engine: 'gfn2', gfn2: refined };
}
