/**
 * The bonding guard: an optimised structure is shown only if it still has the
 * bonds the sketch draws (src/geometry/bond-integrity.ts). It must catch the
 * real failure that prompted it — a "converged" hexan-2-amine with broken C–H
 * bonds and two H2 molecules — and pass the app's real optimised geometries,
 * the awkward ones included: diborane's bridges (B···B 1.77 A, undrawn), PCl5's
 * long axial bonds, SF6, a nickel complex. Each must really have been
 * optimised: an example that fell back to its unoptimised start would pass
 * for the wrong reason.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import { bondingChange } from '../src/geometry/bond-integrity';
import { computeLocalGeometry } from '../src/geometry/local-geometry';
import { localGeometry } from './helpers/local-geometry';
import type { LocalGeometry } from '../src/geometry/local-geometry';
import { EXAMPLES } from '../src/ui/examples';
import { HEXAN_2_AMINE_BROKEN } from './references/broken-results';

const ACCEPTED = ['Diborane', 'Phosphorus pentachloride', 'Sulfur hexafluoride', 'Tetrachloronickelate', 'Benzene'];
const runs = new Map<string, LocalGeometry | null>();

describe('bondingChange', () => {
  beforeAll(async () => {
    for (const name of ACCEPTED) {
      const example = EXAMPLES.find((e) => e.name.startsWith(name))!;
      const sketch = parseMolBlock(example.mol);
      runs.set(name, await localGeometry(example.multiplicity ? { ...sketch, multiplicity: example.multiplicity } : sketch));
    }
  }, 300_000);

  it('catches the "converged" hexan-2-amine that had come apart', () => {
    const change = bondingChange(parseMolBlock(HEXAN_2_AMINE_BROKEN));
    expect(change).not.toBeNull();
    expect(change).toMatch(/came apart|new bond/);
  });

  it.each(ACCEPTED)('passes the optimised %s', (name) => {
    const run = runs.get(name)!;
    expect(run.engine).toBe('gfn2'); // optimised, and accepted by the guard in the pipeline
    expect(bondingChange(run.molecule)).toBeNull();
  });
});

describe('the local pipeline with a result whose bonding changed', () => {
  it('sets the result aside and shows the start, saying why', async () => {
    // A refiner that hands back the broken structure, as GFN2 once did: the
    // pipeline must not call it optimised.
    const broken = parseMolBlock(HEXAN_2_AMINE_BROKEN);
    const local = await computeLocalGeometry(broken, undefined, async () => ({
      molecule: broken,
      converged: true,
      energyHartree: -23.258692,
      iterations: 65,
      milliseconds: 30_600,
      charges: null,
      lowestHessianMode: null,
      saddleEscapes: 0,
    }));
    expect(local?.engine).toBe('unrefined');
    expect(local?.unrefinedReason).toMatch(/no longer had the bonds drawn/);
  });
});
