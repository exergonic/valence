/**
 * Hartree–Fock/def2-SVP behind its own Web Worker (hf-single-point.worker.ts):
 * one single point at the structure on screen, run when the user chooses an
 * HF charge set — never a geometry, never unasked.
 *
 * Not preloaded, unlike GFN2: the engine (~1.5 MB compressed) is fetched the
 * first time it is asked for, and the browser's cache keeps it after.
 */
import type { Molecule } from '../mol-parser';
import { workerClient } from './worker-client';
import type { HfSinglePoint, HfEspSurface } from './hf-single-point.worker';

export type { HfSinglePoint, HfEspSurface };

/** The method, as the app names it everywhere it appears. */
export const HF_METHOD = 'HF/def2-SVP';

/** Thrown into a run's promise when the user cancels it. */
export class HfCancelled extends Error {
  constructor() {
    super('Hartree–Fock run cancelled');
  }
}

/** Thrown when this browser has no Web Workers, which the engine needs. */
export class HfUnavailable extends Error {
  constructor() {
    super('this browser cannot run the Hartree–Fock engine (it needs Web Workers)');
  }
}

const engine = workerClient<never>(
  () => new Worker(new URL('./hf-single-point.worker.ts', import.meta.url), { type: 'module' }),
  () => new HfUnavailable(),
  'Hartree–Fock worker failed',
);

/** How long the single point will take on this machine, seconds; null when
 *  the engine cannot set the molecule up. Loads the engine on first use. */
export function hfSeconds(molecule: Molecule): Promise<number | null> {
  return engine.ask({ task: 'seconds', molecule });
}

/** The single point: energy, dipole, the ESP-fitted and CHELPG charges, and
 *  the ESP surface. Null when the SCF gives no energy. */
export function hfSinglePoint(molecule: Molecule): Promise<HfSinglePoint | null> {
  return engine.ask({ task: 'single-point', molecule });
}

/** Stop the run in flight: the engine is synchronous inside its worker, so
 *  the worker goes, and the next request starts a fresh one. */
export function cancelHf(): void {
  if (engine.busy()) engine.drop(() => new HfCancelled());
}
