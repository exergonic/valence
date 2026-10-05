/**
 * The local geometry pipeline — the app's own answer when no remote service
 * supplies a validated structure.
 *
 * **GFN2-xTB is the default engine**: it produces the geometry the user sees.
 * It is a real semiempirical optimisation, which is what MMFF94 cannot be for a
 * hypervalent centre or an element outside its type space. Measured, MMFF94
 * bends PCl5's trigonal bipyramid into 138° angles with the *axial* bonds the
 * shortest; GFN2 recovers the textbook 2.156/2.027 Å split, verified against
 * the Fortran xTB oracle to under 10⁻³ Å (NOTES.md).
 *
 * The starting geometry is the embedder's skeleton — topologically correct (a
 * real trigonal bipyramid for PCl5) — scaled to plausible bond lengths by
 * `scaleSkeleton`. MMFF94's own output is deliberately *not* the start: for a
 * hypervalent centre it is the distorted structure, and a refiner lands in
 * whichever basin it is dropped near (measured: starting from MMFF94's PCl5,
 * GFN2 settled at 1.98/2.11 Å instead of the verified 2.156/2.027). `place3D`
 * emits unit bonds, which MMFF94 scales itself through its bond terms but a
 * quantum method cannot — hence the explicit scale.
 *
 * MMFF94 is the fallback for when the engine cannot run (no Worker, an element
 * its parameter table lacks) or does not converge; its result is labelled as
 * MMFF94. An unconverged quantum result is never presented as one.
 *
 * Both stages run off the main thread, so the page stays interactive.
 */
import type { Molecule } from '../mol-parser';
import { scaleSkeleton } from './place3d';
import { refineWithGfn2 } from './gfn2-refine';
import { embed3D, embedAndRefine, finite, honourWedges, type EmbedResult } from './mmff-refine';

export async function computeLocalGeometry(molecule: Molecule): Promise<EmbedResult | null> {
  // Never let a failing engine take the app down with it: every failure path
  // ends at MMFF94, which has its own guard and its own label.
  const mmff = () => computeWithMmff94(molecule).catch(() => safeRefine(molecule));

  const { separated } = embed3D(molecule);
  if (!finite(separated)) return mmff();

  const start = scaleSkeleton(separated);
  const refined = await refineWithGfn2(start).catch(() => null);
  if (!refined || !refined.converged) return mmff();

  if (!finite(refined.molecule)) return mmff();
  // The engine's geometry is the authority — no post-hoc planarity repair. The
  // charges ride along with the geometry they were computed at, so the display
  // can offer GFN2 charges next to the MMFF94 charge model.
  return {
    ...honourWedges(start, refined.molecule),
    engine: 'gfn2',
    gfn2Charges: refined.charges ?? undefined,
    gfn2LowestMode: refined.lowestHessianMode ?? undefined,
  };
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PromiseWithResolvers<EmbedResult | null>>();

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./local-geometry.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent) => {
      const { id, result } = e.data as { id: number; result: EmbedResult | null };
      const entry = pending.get(id);
      if (entry) {
        pending.delete(id);
        entry.resolve(result);
      }
    };
    worker.onerror = () => {
      // Reject all pending requests — the worker is dying, and a
      // fresh call will spin up a new one.
      for (const [, entry] of pending) entry.reject();
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function computeWithMmff94(molecule: Molecule): Promise<EmbedResult | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(safeRefine(molecule));

  const resolvers = Promise.withResolvers<EmbedResult | null>();
  const id = nextId++;
  pending.set(id, resolvers);
  w.postMessage({ id, molecule });
  return resolvers.promise;
}

/** Synchronous fallback — never throws. */
function safeRefine(molecule: Molecule): EmbedResult | null {
  try {
    return embedAndRefine(molecule);
  } catch {
    return null;
  }
}
