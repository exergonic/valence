/**
 * GFN2-xTB geometry refinement behind a Web Worker.
 *
 * The top tier of the geometry pipeline, for the cases the force field cannot
 * answer: hypervalent centres, elements MMFF94 has no parameters for, unusual
 * charge states. It is not a replacement for MMFF94 — see the worker for why.
 *
 * Lazy by design: neither the Worker nor the ~22 MB wasm exists until a caller
 * asks for GFN2. An app that never touches this tier never pays for it.
 *
 * No synchronous fallback, unlike local-geometry.ts: the wasm cannot be
 * instantiated on the main thread without freezing the page for the length of
 * the load, so a browser without Workers gets null rather than a stall.
 *
 * Reentrant: one long-lived worker, one id per request, so concurrent callers
 * each resolve only their own result.
 */
import type { Molecule } from '../mol-parser';
import { breakSymmetry } from './mmff-refine';

export interface Gfn2Result {
  /** The optimised structure, in Angstrom, same atom order as the input. */
  molecule: Molecule;
  /** Total GFN2 energy in hartree (the engine's native unit). */
  energyHartree: number;
  iterations: number;
  converged: boolean;
  milliseconds: number;
}

/**
 * The honest label for a GFN2-refined geometry, shown in the Info log.
 * GFN2-xTB is semiempirical: it beats a force field on the cases the force
 * field cannot describe, and it is not an ab initio answer. Say so.
 */
export const GFN2_NOTE =
  'Geometry refined with GFN2-xTB — a semiempirical extended tight-binding method, not an ab initio calculation. '
  + 'It is worth its download where MMFF94 has no parameters (hypervalent centres such as PCl5 or SF6, elements '
  + 'outside its type space, unusual charge states); for a well-parameterised organic MMFF94 is at least as good.';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PromiseWithResolvers<Gfn2Result | null>>();

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./gfn2-refine.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error } = e.data as {
        id: number;
        result: Gfn2Result | null;
        error?: string;
      };
      const entry = pending.get(id);
      if (entry) {
        pending.delete(id);
        if (error) entry.reject(new Error(error));
        else entry.resolve(result);
      }
    };
    worker.onerror = () => {
      // Reject everything in flight — the worker is dying, and the next call
      // spins up a fresh one.
      for (const [, entry] of pending) entry.reject();
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function refineWithGfn2(molecule: Molecule): Promise<Gfn2Result | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(null);
  const resolvers = Promise.withResolvers<Gfn2Result | null>();
  const id = nextId++;
  pending.set(id, resolvers);
  // The embedder emits exact symmetries and a symmetric start traps the
  // descent at a spurious stationary point (drawn water arrives exactly
  // linear and comes back exactly linear) — the same deterministic kick
  // the MMFF94 bridge uses, before the engine ever sees the structure.
  w.postMessage({ id, molecule: breakSymmetry(molecule) });
  return resolvers.promise;
}
