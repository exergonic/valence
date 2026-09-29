/**
 * The symmetrizer: does it find the group a molecule has, does it land
 * exactly on it, and does it leave alone what it should?
 *
 * The geometries come from the app's own local pipeline, so these tests pin
 * the whole chain (embed → MMFF94 → snap), not a hand-built ideal. The
 * textbook groups are asserted only where the measured shift is well under
 * the tolerance — a molecule sitting near the tolerance would make the
 * expectation depend on the platform's floating point, and that is a fact
 * about the geometry, not about the symmetrizer.
 */
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/ui/examples';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { embedAndRefine } from '../src/geometry/mmff-refine';
import { SYMMETRY_TOLERANCE, symmetrizeMolecule } from '../src/geometry/symmetrize';

const embedded = (name: string): Molecule => {
  const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith(name))!.mol)!;
  return embedAndRefine(sketch).molecule;
};

const shiftBetween = (a: Molecule['atoms'], b: Molecule['atoms']) =>
  Math.max(...a.map((atom, i) => Math.hypot(atom.x - b[i].x, atom.y - b[i].y, atom.z - b[i].z)));

describe('the symmetrizer', () => {
  it('names the group each molecule actually has', () => {
    // shifts measured: 0.05 mÅ (methane), 0.23 (ethene), 0.80 (benzene),
    // 1.27 (pyridine), 1.99 (pyrrole) — all ≥10× under the 20 mÅ tolerance
    const expected: Array<[string, string]> = [
      ['Methane', 'Td'],
      ['Ethene', 'D2h'],
      ['Benzene', 'D6h'],
      ['Water', 'C2v'],
      ['Nitrogen', 'D∞h'],
      ['Oxygen', 'D∞h'],
      ['Pyridine', 'C2v'],
      ['Pyrrole', 'C2v'],
      ['Imidazole', 'Cs'],
      ['But-1-en-3-yne', 'Cs'],
    ];
    for (const [name, symbol] of expected) {
      const result = symmetrizeMolecule(embedded(name));
      expect(`${name}: ${result.symbol}`).toBe(`${name}: ${symbol}`);
      expect(result.maxShift).toBeLessThanOrEqual(SYMMETRY_TOLERANCE);
    }
  });

  it('lands exactly on the symmetric subspace, so a second pass does nothing', () => {
    // The whole point of the fixed-point loop: a single projection over
    // operations that are themselves ~1 mÅ off would leave ~1 mÅ behind,
    // which is exactly the asymmetry that split WebMO's degenerate pairs.
    for (const name of ['Benzene', 'Methane', 'Water', 'Pyrrole']) {
      const molecule = embedded(name);
      const once = symmetrizeMolecule(molecule);
      const twice = symmetrizeMolecule({ atoms: once.atoms, bonds: molecule.bonds });
      expect(twice.maxShift).toBeLessThan(1e-9);
      expect(twice.symbol).toBe(once.symbol);
    }
  });

  it('the group it reports is a symmetry of the geometry it returns', () => {
    const molecule = embedded('Benzene');
    const snapped = symmetrizeMolecule(molecule);
    // re-detecting with a tight tolerance finds the same group: the result
    // satisfies it exactly, not approximately
    const strict = symmetrizeMolecule({ atoms: snapped.atoms, bonds: molecule.bonds }, 1e-6);
    expect(strict.symbol).toBe(snapped.symbol);
    expect(strict.maxShift).toBeLessThan(1e-9);
  });

  it('does not erase a genuine distortion', () => {
    // one carbon pulled 0.05 Å out of the ring plane: a real, if small,
    // distortion — the ring must not be flattened back
    const molecule = embedded('Benzene');
    const bent = molecule.atoms.map((atom, i) => (i === 0 ? { ...atom, z: atom.z + 0.05 } : atom));
    const result = symmetrizeMolecule({ atoms: bent, bonds: molecule.bonds });
    expect(result.maxShift).toBeLessThanOrEqual(SYMMETRY_TOLERANCE);
    // the displaced carbon is still out of the plane of its neighbours
    const plane = result.atoms.slice(1, 6).map((a) => a.z);
    const offset = Math.abs(result.atoms[0].z - plane.reduce((s, z) => s + z, 0) / plane.length);
    expect(offset).toBeGreaterThan(0.045);
  });

  it('leaves a geometry with no symmetry alone', () => {
    // every atom nudged ~0.03 Å in a deterministic pseudo-random direction:
    // past the tolerance, so nothing may be snapped
    const molecule = embedded('Benzene');
    const noisy = molecule.atoms.map((atom, i) => {
      const j = (i * 2654435761) % 1000 / 1000 - 0.5;
      const k = (i * 40503) % 1000 / 1000 - 0.5;
      return { ...atom, x: atom.x + 0.06 * j, y: atom.y + 0.06 * k };
    });
    const result = symmetrizeMolecule({ atoms: noisy, bonds: molecule.bonds });
    expect(result.symbol).toBe('C1');
    expect(result.maxShift).toBe(0);
    expect(result.atoms).toBe(noisy); // untouched, same array
  });

  it('straightens a bent linear molecule', () => {
    const molecule = embedded('Ethyne');
    const bent = molecule.atoms.map((atom, i) => (i === 1 ? { ...atom, x: atom.x + 0.01 } : atom));
    const result = symmetrizeMolecule({ atoms: bent, bonds: molecule.bonds });
    expect(result.symbol).toBe('D∞h');
    expect(result.maxShift).toBeLessThanOrEqual(SYMMETRY_TOLERANCE);
    // every atom is now on the axis through the two ends
    const [first, last] = [result.atoms[0], result.atoms[result.atoms.length - 1]];
    const axis = [last.x - first.x, last.y - first.y, last.z - first.z];
    const length = Math.hypot(...axis);
    for (const atom of result.atoms) {
      const v = [atom.x - first.x, atom.y - first.y, atom.z - first.z];
      const along = (v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]) / length;
      const off = Math.hypot(v[0] - (along * axis[0]) / length, v[1] - (along * axis[1]) / length, v[2] - (along * axis[2]) / length);
      expect(off).toBeLessThan(1e-9);
    }
  });

  it('keeps the atoms, their order and their elements', () => {
    const molecule = embedded('Phenol');
    const result = symmetrizeMolecule(molecule);
    expect(result.atoms.length).toBe(molecule.atoms.length);
    result.atoms.forEach((atom, i) => {
      expect(atom.element).toBe(molecule.atoms[i].element);
      expect(atom.charge).toBe(molecule.atoms[i].charge);
    });
  });
});
