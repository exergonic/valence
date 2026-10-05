/**
 * GFN2-xTB geometry optimisation behind a Web Worker — the app's local
 * geometry engine (see local-geometry.ts for what happens when it cannot run).
 *
 * Lazy by design: neither the Worker nor the ~3 MB of wasm and data exists
 * until a caller asks for GFN2.
 *
 * No synchronous fallback: the wasm cannot be instantiated on the main thread
 * without freezing the page for the length of the load, so a browser without
 * Workers gets null rather than a stall.
 *
 * Reentrant: one long-lived worker, one id per request, so concurrent callers
 * each resolve only their own result. A run can take tens of seconds on a
 * larger molecule, so it reports progress as it goes and can be cancelled —
 * which terminates the worker; the next call starts a fresh one.
 */
import type { Molecule } from '../mol-parser';
import { breakSymmetry } from './embed';
import type { Gfn2Progress, Gfn2Result } from './gfn2-refine.worker';

export type { Gfn2Progress, Gfn2Result };

/**
 * Below this lowest Hessian eigenvalue (Eh/bohr²) a converged geometry is a
 * saddle, not a minimum. A gradient-based stop cannot tell the two apart — a
 * saddle has zero gradient too — so the curvature is what makes the claim.
 * The numerical Hessian's noise floor measures ±0.003 (step-independent,
 * 2026-10-02), while a real imaginary mode of the planar cyclopropenyl anion
 * sits at −0.16, so 0.02 separates them cleanly.
 */
export const HESSIAN_SADDLE_THRESHOLD = -0.02;

/**
 * The honest label for a GFN2-optimised geometry, shown in the Info log.
 * GFN2-xTB is semiempirical — not an ab initio answer, and for an ordinary
 * organic molecule not uniformly better than a good force field. It is the
 * app's one engine because it treats hypervalent centres, metals and unusual
 * charge states with the same physics as everything else. Say so.
 */
export const GFN2_NOTE =
  'Geometry optimised with GFN2-xTB — a semiempirical extended tight-binding method, not an ab initio '
  + 'calculation. It handles hypervalent centres (PCl₅, SF₆), metals and unusual charge states with the same '
  + 'physics as everything else; for an ordinary organic molecule a good force field can match it on bond lengths '
  + 'and angles (water: 107.2° here against experiment\'s 104.5°).';

/** Thrown into a run's promise when the user cancels it. */
export class Gfn2Cancelled extends Error {
  constructor() {
    super('GFN2-xTB run cancelled');
  }
}

/** Thrown when this browser has no Web Workers, which the engine needs. Kept
 *  apart from a null result, which means the engine ran and found nothing. */
export class Gfn2Unavailable extends Error {
  constructor() {
    super('this browser cannot run the GFN2-xTB engine (it needs Web Workers)');
  }
}

let worker: Worker | null = null;
let nextId = 1;
interface PendingRun {
  resolvers: PromiseWithResolvers<Gfn2Result | null>;
  onProgress?: (progress: Gfn2Progress) => void;
}
const pending = new Map<number, PendingRun>();

/** Reject every run in flight and forget the worker — it is dying, or being
 *  killed; the next call spins up a fresh one. */
function dropWorker(reason: () => Error): void {
  for (const [, run] of pending) run.resolvers.reject(reason());
  pending.clear();
  worker?.terminate();
  worker = null;
}

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./gfn2-refine.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error, progress } = e.data as {
        id: number;
        result?: Gfn2Result | null;
        error?: string;
        progress?: Gfn2Progress;
      };
      const run = pending.get(id);
      if (!run) return;
      if (progress) {
        run.onProgress?.(progress);
        return;
      }
      pending.delete(id);
      if (error) run.resolvers.reject(new Error(error));
      else run.resolvers.resolve(result ?? null);
    };
    worker.onerror = () => dropWorker(() => new Error('GFN2-xTB worker failed'));
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Optimise a structure with GFN2-xTB. Resolves with the result, or null when
 * the engine ran and no optimiser rung produced a geometry; rejects with
 * Gfn2Unavailable when there is no Worker, Gfn2Cancelled when `cancelGfn2`
 * stops it, and the engine's own error when it fails outright.
 */
export function refineWithGfn2(
  molecule: Molecule,
  onProgress?: (progress: Gfn2Progress) => void,
): Promise<Gfn2Result | null> {
  const w = ensureWorker();
  if (!w) return Promise.reject(new Gfn2Unavailable());
  const resolvers = Promise.withResolvers<Gfn2Result | null>();
  const id = nextId++;
  pending.set(id, { resolvers, onProgress });
  // The embedder emits exact symmetries and a symmetric start traps the
  // descent at a spurious stationary point (drawn water arrives exactly
  // linear and comes back exactly linear) — a deterministic kick first.
  w.postMessage({ id, molecule: breakSymmetry(molecule) });
  return resolvers.promise;
}

/** Stop every GFN2 run in flight. The engine is synchronous inside its worker,
 *  so the only way to stop it is to terminate the worker; the wasm is loaded
 *  again by the next run. */
export function cancelGfn2(): void {
  if (pending.size > 0) dropWorker(() => new Gfn2Cancelled());
}
