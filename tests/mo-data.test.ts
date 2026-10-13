/**
 * The MO data printout: GFN2-xTB's orbitals by default, one block per spin
 * channel of an open shell. Structures are the app's own examples.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMolBlock, type Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { gfn2Ladders } from '../src/chem/gfn2-xtb/orbital-ladder';
import { solveExtendedHuckel } from '../src/chem/extended-huckel/solve';
import { gfn2MoDataText, moDataText } from '../src/ui/mo-data';

beforeAll(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.self === 'undefined') globals.self = globalThis;
});
const vendorFile = (name: string) => fileURLToPath(new URL(`../vendor/occ-wasm/${name}`, import.meta.url));

function example(prefix: string): Molecule {
  const found = EXAMPLES.find((e) => e.name.startsWith(prefix))!;
  const molecule = parseMolBlock(found.mol);
  return found.multiplicity ? { ...molecule, multiplicity: found.multiplicity } : molecule;
}

async function printout(prefix: string) {
  const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
  const molecule = example(prefix);
  const properties = (await propertiesAt(molecule, vendorFile))!;
  return gfn2MoDataText(molecule, properties, gfn2Ladders(molecule, properties)!);
}

describe('the MO data printout', () => {
  it('water from GFN2: six basis functions, eight electrons, four filled orbitals of six', async () => {
    const text = await printout('Water');
    expect(text).toMatch(/^Valence — GFN2-xTB MO data/);
    expect(text).toContain('3 atoms, 6 basis functions, 8 valence electrons, charge 0, multiplicity 1');
    const levels = text.split('\n').filter((line) => /^MO /.test(line));
    expect(levels).toHaveLength(6);
    expect(levels.filter((line) => line.endsWith('2.00'))).toHaveLength(4);
    expect(text).not.toMatch(/α|β/);
  });

  it('the triplet NiCl₄²⁻ prints both spin channels, two more α electrons than β', async () => {
    const text = await printout('Tetrachloronickelate');
    expect(text).toContain('multiplicity 3');
    expect(text).toContain('α (spin-up) orbitals');
    expect(text).toContain('β (spin-down) orbitals');
    const [alphaBlock, betaBlock] = text.split(/β \(spin-down\) orbitals/);
    const filled = (block: string) => block.split('\n')
      .filter((line) => /^MO /.test(line))
      .reduce((sum, line) => sum + Number(line.trim().split(/\s+/).pop()), 0);
    // β's frontier is fractionally filled (the Jahn–Teller set), and the printout
    // rounds each occupation to two decimals
    expect(Math.abs(filled(alphaBlock) - filled(betaBlock) - 2)).toBeLessThan(0.02);
  });

  it('extended Hückel stays available as the fallback', () => {
    const molecule = example('Water');
    expect(moDataText(molecule, solveExtendedHuckel(molecule)!)).toMatch(/^Valence — extended-Hückel MO data/);
  });
});
