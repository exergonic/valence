/**
 * GFN2-xTB geometry optimisation behind a Web Worker — the app's local
 * geometry engine (see local-geometry.ts for what happens when it cannot run).
 *
 * Loaded at startup, in the background (`preloadGfn2`): the ~3 MB of wasm and
 * data (~1.2 MB compressed) streams in while the user is still drawing, so the
 * first optimisation starts at once. A run that arrives before the load is
 * done simply waits on it.
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
import type { Gfn2Progress, Gfn2Result, Gfn2Properties, Gfn2OrbitalSet, OrbitalSurface, OrbitalSurfaceRequest, Gfn2EspSurface, Gfn2ChargeSets } from './gfn2-refine.worker';

export type { Gfn2Progress, Gfn2Result, Gfn2Properties, Gfn2OrbitalSet, OrbitalSurface, OrbitalSurfaceRequest, Gfn2EspSurface, Gfn2ChargeSets };
export { HESSIAN_SADDLE_THRESHOLD } from '../chem/gfn2-xtb/normal-modes';

/**
 * The honest label for a GFN2-optimised geometry, shown in the Info log:
 * semiempirical, not ab initio, and why it is the app's one engine — one
 * parameter set for the whole periodic table through radon, so PCl₅ and a
 * nickel complex get the same physics as ethane. The details are the
 * method's open-access paper, linked rather than paraphrased.
 */
export const GFN2_NOTE = {
  text: 'Geometry optimised with GFN2-xTB — a semiempirical extended tight-binding method, not an ab initio '
    + 'calculation. One parameter set covers every element through radon, so PCl₅ and a nickel complex get '
    + 'the same physics as ethane.',
  link: {
    label: 'Bannwarth, Ehlert & Grimme, JCTC 2019',
    href: 'https://doi.org/10.1021/acs.jctc.8b01176',
  },
};

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
  // each task resolves its own type (see `ask`)
  resolvers: PromiseWithResolvers<any>;
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
        result?: unknown;
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

/** Send the worker one task; the promise settles with its answer. Rejects with
 *  Gfn2Unavailable when there is no Worker. */
function ask<T>(message: object, onProgress?: (progress: Gfn2Progress) => void): Promise<T> {
  const w = ensureWorker();
  if (!w) return Promise.reject(new Gfn2Unavailable());
  const resolvers = Promise.withResolvers<T>();
  const id = nextId++;
  pending.set(id, { resolvers, onProgress });
  w.postMessage({ id, ...message });
  return resolvers.promise;
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
  // The embedder emits exact symmetries and a symmetric start traps the
  // descent at a spurious stationary point (drawn water arrives exactly
  // linear and comes back exactly linear) — a deterministic kick first.
  return ask({ task: 'optimise', molecule: breakSymmetry(molecule) }, onProgress);
}

/**
 * GFN2-xTB's electronic structure at a structure exactly as displayed — one
 * single point, no optimisation, no hydrogens added: the charges (so a
 * structure the engine did not produce shows the same charge model as one it
 * did), the Wiberg bond orders, the spin populations, the full dipole and the
 * molecular orbitals. Null when the engine cannot treat the molecule; rejects
 * with Gfn2Unavailable without a Worker. Shares the worker, and so the wasm,
 * with the optimisations.
 */
export function gfn2PropertiesAt(molecule: Molecule): Promise<Gfn2Properties | null> {
  return ask({ task: 'properties', molecule });
}

/**
 * One GFN2 orbital's isosurface, built in the worker from the calculator of
 * the properties run `request.key` names — the field and its gradient need the
 * engine's own basis. Null when that run is no longer the worker's latest (a
 * newer molecule replaced it).
 */
export function gfn2OrbitalSurface(request: OrbitalSurfaceRequest): Promise<OrbitalSurface | null> {
  return ask({ task: 'surface', surface: request });
}

/**
 * The ESP of the properties run `key` names, as the textbook draws it: GFN2's
 * own 0.001 au density surface, coloured by the exact potential of its charge
 * distribution. Built in the worker (both need the engine). Null when that run
 * is no longer the worker's latest, or the engine build has no density
 * binding.
 */
export function gfn2EspSurface(key: number): Promise<Gfn2EspSurface | null> {
  return ask({ task: 'esp', key });
}

/**
 * The ESP-fitted, Hirshfeld and CM5 charges of the properties run `key`
 * names, built in the worker from its calculator (the potential and the
 * density need the engine). Null when that run is no longer the worker's
 * latest.
 */
export function gfn2ChargeSets(key: number): Promise<Gfn2ChargeSets | null> {
  return ask({ task: 'charges', key });
}

/**
 * Start the worker and instantiate the engine now, ahead of any run. Fire and
 * forget: a load that fails here is retried by the run that needs it, which
 * then reports the failure where the user is looking.
 */
export function preloadGfn2(): void {
  ask<boolean>({ task: 'load' }).catch(() => {});
}

/** Stop every GFN2 run in flight. The engine is synchronous inside its worker,
 *  so the only way to stop it is to terminate the worker — and a fresh one is
 *  warmed at once, so the next run does not pay for the cancel. */
export function cancelGfn2(): void {
  if (pending.size === 0) return;
  dropWorker(() => new Gfn2Cancelled());
  preloadGfn2();
}
