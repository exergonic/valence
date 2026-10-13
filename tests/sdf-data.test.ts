/**
 * The SDF data fields: what Valence computed, after `M  END`, in a form RDKit
 * reads onto its atoms. Structures are the app's own examples; GFN2 runs from
 * the vendored engine.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMolBlock, type Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { gfn2Ladders } from '../src/chem/gfn2-xtb/orbital-ladder';
import { assignOrbitals } from '../src/chem/vsepr/assign-orbitals';
import { moleculeToSDF } from '../src/ui/controls';
import { sdfDataFields, type SdfDataInput, type SdfField } from '../src/ui/sdf-data';

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

const header = { name: null, source: 'Example', cid: null, warnings: null };

async function input(prefix: string): Promise<SdfDataInput> {
  const { propertiesAt, chargeSets } = await import('../src/geometry/gfn2-refine.worker');
  const molecule = example(prefix);
  const properties = (await propertiesAt(molecule, vendorFile))!;
  return {
    molecule, header, properties,
    ladders: gfn2Ladders(molecule, properties),
    chargeSets: await chargeSets(properties.key),
    mmff94Charges: null,
    atomOrbitals: assignOrbitals(molecule),
    vibrations: null,
  };
}

const field = (fields: SdfField[], name: string) => fields.find((f) => f.name === name)?.value;

describe('the SDF data fields', () => {
  it('water: GFN2 energy, dipole and frontier, a charge per atom in every set, VSEPR and Wiberg', async () => {
    const data = await input('Water');
    const fields = sdfDataFields(data);
    expect(Number(field(fields, 'GFN2_TOTAL_ENERGY_HARTREE'))).toBeCloseTo(data.properties!.energy, 6);
    expect(field(fields, 'GFN2_SPIN_MULTIPLICITY')).toBe('1');
    expect(field(fields, 'GFN2_DIPOLE_DEBYE')).toMatch(/\|μ\| 2\.\d{4}$/);
    expect(Number(field(fields, 'GFN2_HOMO_LUMO_GAP_EV'))).toBeGreaterThan(0);
    for (const name of ['ESP_FITTED', 'MULLIKEN', 'CM5', 'HIRSHFELD']) {
      const values = field(fields, `atom.dprop.GFN2_${name}_CHARGE`)!.split(' ').map(Number);
      expect(values).toHaveLength(3);
      expect(values.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 2); // neutral
      expect(values[0]).toBeLessThan(0); // oxygen
    }
    expect(field(fields, 'atom.prop.VSEPR_HYBRIDIZATION')).toBe('sp3 s s');
    expect(field(fields, 'atom.iprop.VSEPR_LONE_PAIRS')).toBe('2 0 0');
    expect(field(fields, 'GFN2_WIBERG_BOND_ORDERS_IN_BOND_BLOCK_ORDER')!.split(' ')).toHaveLength(2);
    expect(field(fields, 'atom.dprop.GFN2_SPIN_POPULATION')).toBeUndefined(); // closed shell
  });

  it('the triplet NiCl₄²⁻: both channels\' frontiers, spin populations, and n/a where VSEPR is silent', async () => {
    const fields = sdfDataFields(await input('Tetrachloronickelate'));
    expect(field(fields, 'GFN2_SPIN_MULTIPLICITY')).toBe('3');
    expect(field(fields, 'TOTAL_CHARGE')).toBe('-2');
    expect(field(fields, 'GFN2_ALPHA_HOMO_EV')).toBeDefined();
    expect(field(fields, 'GFN2_BETA_HOMO_EV')).toBeDefined();
    const spin = field(fields, 'atom.dprop.GFN2_SPIN_POPULATION')!.split(' ').map(Number);
    expect(spin.reduce((s, v) => s + v, 0)).toBeCloseTo(2, 1); // two unpaired electrons
    expect(field(fields, 'atom.prop.VSEPR_HYBRIDIZATION')!.split(' ')).toContain('n/a'); // nickel
  });

  it('writes each field after M  END as > <NAME>, its value, a blank line — and the structure still reads back', async () => {
    const data = await input('Water');
    const sdf = moleculeToSDF(data.molecule, sdfDataFields(data), 'Water');
    const lines = sdf.split('\n');
    expect(lines[0]).toBe('Water');
    const end = lines.indexOf('M  END');
    expect(lines[end + 1]).toBe('> <VALENCE_STRUCTURE_SOURCE>');
    expect(lines[end + 2]).toBe('Example');
    expect(lines[end + 3]).toBe('');
    expect(sdf.trimEnd().endsWith('$$$$')).toBe(true);
    const back = parseMolBlock(sdf);
    expect(back.atoms.map((a) => a.element)).toEqual(data.molecule.atoms.map((a) => a.element));
    expect(back.bonds).toHaveLength(data.molecule.bonds.length);
  });

  it('without GFN2, the structure-level fields and the VSEPR picture still come through', () => {
    const molecule = example('Water');
    const fields = sdfDataFields({
      molecule, header, properties: null, ladders: null, chargeSets: null,
      mmff94Charges: [-0.86, 0.43, 0.43], atomOrbitals: assignOrbitals(molecule), vibrations: null,
    });
    expect(fields.map((f) => f.name)).toEqual([
      'VALENCE_STRUCTURE_SOURCE', 'TOTAL_CHARGE', 'atom.dprop.MMFF94_BCI_CHARGE',
      'atom.prop.VSEPR_HYBRIDIZATION', 'atom.iprop.VSEPR_LONE_PAIRS',
    ]);
  });
});
