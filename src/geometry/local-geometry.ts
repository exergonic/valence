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
import { Gfn2Cancelled, Gfn2Unavailable, refineWithGfn2, type Gfn2Held, type Gfn2Progress, type Gfn2Result } from './gfn2-refine';
import { embed3D, finite, honourWedges, type EmbedResult } from './embed';
import { assessBonding, markBondingChanges } from './bond-integrity';

export interface LocalGeometry extends EmbedResult {
  /** 'gfn2': a GFN2-xTB optimisation — converged, or the lowest point of a run
   *  that stopped short (`gfn2.converged` says which). 'held': GFN2's free
   *  result changed the bonding, and this is the molecule drawn, relaxed with
   *  its bonds held (`held`). 'unrefined': the embedder's starting structure,
   *  because GFN2 produced nothing usable. */
  engine: 'gfn2' | 'held' | 'unrefined';
  /** The free run, when engine is 'gfn2' or 'held' — energy, steps, time,
   *  charges, the Hessian verdict and any saddle escapes. */
  gfn2?: Gfn2Result;
  /** The held structure's own record, when engine is 'held'. */
  held?: Gfn2Held;
  /** Why the start is shown (engine 'unrefined'), as a sentence for the Info
   *  log. */
  unrefinedReason?: string;
  /** A sentence for each drawn bond GFN2 stretched into a partial bond. */
  partialBonds?: string[];
  /** GFN2's free result, when it no longer had the drawn bonding (a drawn bond
   *  came apart, or a new one formed): set aside — the held structure, or
   *  the start, is what this geometry shows — and shown when the user asks
   *  (decided with the user 2026-10-24). */
  setAside?: LocalGeometry;
  /** With `setAside`: the sentence naming the bond that came apart or formed. */
  bondingChange?: string;
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
  const finished = honourWedges(sketch, refined.molecule);
  // ...but it must still be the molecule drawn. GFN2 moves nuclei, not bonds
  // (bond-integrity.ts). A drawn bond that only stretched is shown, dashed, as
  // the partial bond it is. One that came apart, or a bond that formed, sets
  // the free result aside — it may be the chemistry (an open carbocation, an
  // isomerization) or a bad start (two H₂ molecules out of a clash, once) —
  // and shows the molecule drawn instead: relaxed with its bonds held, or the
  // start when there is no held structure. The free result stays a click away.
  const verdict = assessBonding(finished.molecule, refined.bondOrders, refined.bondOrderMatrix);
  const free: LocalGeometry = {
    ...finished,
    molecule: markBondingChanges(finished.molecule, verdict),
    engine: 'gfn2',
    gfn2: refined,
    partialBonds: verdict.partial,
  };
  const change = verdict.formed ?? verdict.broken;
  if (!change) return free;

  const reason = `GFN2-xTB's result no longer had the bonds drawn — ${change} — so it was set aside`;
  let instead = unrefined(reason);
  if (refined.held && finite(refined.held.molecule)) {
    const held = honourWedges(sketch, refined.held.molecule);
    // the bonds that came apart in the free result are the ones held at the
    // wall: drawn dashed here too
    instead = {
      ...held,
      molecule: markBondingChanges(held.molecule, { stretched: verdict.stretched, formedPairs: [] }),
      engine: 'held',
      gfn2: refined,
      held: refined.held,
    };
  }
  return { ...instead, setAside: free, bondingChange: change };
}
