/**
 * The Thermo view's run (decided with the user 2026-11-05): GFN2-xTB's Hessian
 * at any size, and the estimate of its time that the view weighs against its
 * 15 s gate. Hexane is PubChem's 3D record (CID 8058, kept in
 * tests/references/pubchem/) — 20 atoms, above the optimiser's own 16-atom gate,
 * and a fetched structure, the kind the view must optimise before it can
 * vibrate it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';

beforeAll(() => {
  // The worker module registers `self.onmessage` at import time.
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.self === 'undefined') globals.self = globalThis;
});

const vendorFile = (name: string) =>
  fileURLToPath(new URL(`../vendor/occ-wasm/${name.split('/').pop()}`, import.meta.url));

const hexane = parseMolBlock(readFileSync(fileURLToPath(new URL('./references/pubchem/hexane.sdf', import.meta.url)), 'utf-8'));

describe('the Thermo view\'s run', () => {
  it('vibrates a structure above the optimiser\'s 16-atom gate, at a minimum', async () => {
    const { optimizeWithGfn2 } = await import('../src/geometry/gfn2-refine.worker');
    expect(hexane.atoms).toHaveLength(20);
    const plain = await optimizeWithGfn2(hexane, vendorFile);
    expect(plain?.vibrations).toBeNull(); // the optimiser's own run: no Hessian above 16 atoms

    const run = await optimizeWithGfn2(hexane, vendorFile, undefined, true);
    expect(run?.converged).toBe(true);
    // 3N − 6 real modes: a minimum, not a saddle
    expect(run?.vibrations).toHaveLength(3 * 20 - 6);
    expect(run!.lowestFrequency!).toBeGreaterThan(0);
  }, 120_000);

  it('estimates the Hessian’s time in seconds', async () => {
    const { hessianSeconds } = await import('../src/geometry/gfn2-refine.worker');
    const estimate = await hessianSeconds(hexane, vendorFile);
    // Seconds, not milliseconds, and well under the 15 s gate for hexane. How
    // close it comes to the Hessian's own time is a measurement on a quiet
    // machine (NOTES.md, 2026-11-05), not a test: under this suite's parallel
    // load the Hessian's wall-clock time doubles.
    expect(estimate).toBeGreaterThan(0.05);
    expect(estimate).toBeLessThan(15);
  }, 60_000);
});
