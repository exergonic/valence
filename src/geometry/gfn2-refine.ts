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
 * Reentrant (worker-client.ts): one long-lived worker, one id per request. A
 * run can take tens of seconds on a larger molecule, so it reports progress
 * as it goes and can be cancelled — which terminates the worker; the next
 * call starts a fresh one.
 */
import type { Molecule } from '../mol-parser';
import { breakSymmetry } from './embed';
import { workerClient } from './worker-client';
import type { Gfn2Progress, Gfn2Result, Gfn2Held, Gfn2Properties, Gfn2OrbitalSet, OrbitalSurface, OrbitalSurfaceRequest, Gfn2EspSurface, Gfn2ChargeSets } from './gfn2-refine.worker';

export type { Gfn2Progress, Gfn2Result, Gfn2Held, Gfn2Properties, Gfn2OrbitalSet, OrbitalSurface, OrbitalSurfaceRequest, Gfn2EspSurface, Gfn2ChargeSets };
export { SADDLE_FREQUENCY_THRESHOLD } from '../chem/gfn2-xtb/normal-modes';

/**
 * The honest label for a GFN2-optimised geometry, shown in the structure card:
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

const engine = workerClient<Gfn2Progress>(
  () => new Worker(new URL('./gfn2-refine.worker.ts', import.meta.url), { type: 'module' }),
  () => new Gfn2Unavailable(),
  'GFN2-xTB worker failed',
);
const ask = engine.ask;

/**
 * Optimise a structure with GFN2-xTB. Resolves with the result, or null when
 * the engine ran and no optimiser rung produced a geometry; rejects with
 * Gfn2Unavailable when there is no Worker, Gfn2Cancelled when `cancelGfn2`
 * stops it, and the engine's own error when it fails outright.
 * `vibrationsAtAnySize` is the Thermo view's run: the Hessian, and the saddle
 * escape, at any size.
 */
export function refineWithGfn2(
  molecule: Molecule,
  onProgress?: (progress: Gfn2Progress) => void,
  vibrationsAtAnySize = false,
): Promise<Gfn2Result | null> {
  // The embedder emits exact symmetries and a symmetric start traps the
  // descent at a spurious stationary point (drawn water arrives exactly
  // linear and comes back exactly linear) — a deterministic kick first.
  const task = vibrationsAtAnySize ? 'vibrations' : 'optimise';
  return ask({ task, molecule: breakSymmetry(molecule) }, onProgress);
}

/** How long GFN2-xTB's Hessian of this structure will take on this machine,
 *  seconds (the worker's `hessianSeconds`); null when it cannot say. */
export function gfn2HessianSeconds(molecule: Molecule): Promise<number | null> {
  return ask({ task: 'hessian-seconds', molecule });
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
  if (!engine.busy()) return;
  engine.drop(() => new Gfn2Cancelled());
  preloadGfn2();
}
