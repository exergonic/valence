/**
 * GFN2-xTB's orbital ladder, read through the extended-Hückel machinery: the
 * worker's description of the basis (found by probing each function, not from
 * OCC's ordering) has to be right for the irrep labels to come out, so the
 * labels are the test. Structures are the app's own examples.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { gfn2Ladders } from '../src/chem/gfn2-xtb/orbital-ladder';
import { solveExtendedHuckel } from '../src/chem/extended-huckel/solve';
import { labelIrreps } from '../src/chem/extended-huckel/irrep-labels';

beforeAll(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.self === 'undefined') globals.self = globalThis;
});
const vendorFile = (name: string) => fileURLToPath(new URL(`../vendor/occ-wasm/${name}`, import.meta.url));
const example = (prefix: string) => parseMolBlock(EXAMPLES.find((e) => e.name.startsWith(prefix))!.mol);

async function ladder(prefix: string) {
  const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
  const molecule = example(prefix);
  const properties = await propertiesAt(molecule, vendorFile);
  return { molecule, properties: properties!, ladders: gfn2Ladders(molecule, properties!)! };
}

describe('GFN2-xTB orbital ladder', () => {
  it('describes every basis function, and the coefficients stay orthonormal on its overlap', async () => {
    const { ladders } = await ladder('Water');
    const { basis, overlap, coefficients } = ladders.alpha;
    expect(basis.map((b) => b.angular).join('')).toBe('sppps'.slice(0, 4) + 'ss');
    for (let i = 0; i < coefficients.length; i++) {
      for (let j = 0; j < coefficients.length; j++) {
        let sij = 0;
        for (let mu = 0; mu < basis.length; mu++) {
          for (let nu = 0; nu < basis.length; nu++) sij += coefficients[i][mu] * overlap[mu][nu] * coefficients[j][nu];
        }
        expect(sij).toBeCloseTo(i === j ? 1 : 0, 6);
      }
    }
  }, 120_000);

  it("labels water's orbitals as extended Hückel does — the occupied ones a1, b2, a1, b1", async () => {
    const { molecule, ladders } = await ladder('Water');
    const eh = solveExtendedHuckel(molecule)!;
    const ehLabels = labelIrreps(molecule, eh.basis, eh.coefficients, eh.energies, eh.overlap);
    const occupied = ladders.alpha.occupations.filter((o) => o > 0.5).length;
    expect(occupied).toBe(4);
    expect(ladders.alpha.labels.slice(0, 4)).toEqual(ehLabels.slice(0, 4));
    expect(ladders.alpha.labels.every((l) => l !== null)).toBe(true);
  }, 120_000);

  it("gives benzene a degenerate e1g HOMO pair, labelled and canonicalized", async () => {
    const { ladders } = await ladder('Benzene');
    const { energies, occupations, labels } = ladders.alpha;
    const homo = occupations.filter((o) => o > 0.5).length - 1;
    expect(Math.abs(energies[homo] - energies[homo - 1])).toBeLessThan(1e-3);
    expect(labels[homo]).toBe('e1g');
    expect(labels[homo - 1]).toBe('e1g');
    expect(labels[homo + 1]).toBe('e2u');
  }, 120_000);
});
