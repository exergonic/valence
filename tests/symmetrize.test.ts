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

  it('labels a molecule whose only symmetry is a twofold rotation', () => {
    // The symbol table had no pure-C2 case, which is how a bug slipped through:
    // the order-2 branch looked for the *improper* member of the group, found
    // none for a pure rotation, and fell through to 'Cs' — a mirror the
    // molecule does not have.
    //
    // Building one takes a little care, because ethene is symmetric enough
    // that most perturbations keep a mirror: pushing the two carbons out of
    // plane leaves the plane through the C=C axis, and pushing the H's on each
    // carbon symmetrically leaves the other. Taking one H on each carbon —
    // the pair related by the in-plane twofold axis — and pushing them
    // *oppositely* out of the molecular plane breaks every mirror and leaves
    // exactly that C2.
    const molecule = embedded('Ethene');
    const atoms = molecule.atoms;
    const carbons = atoms.filter((a) => a.element === 'C');
    const hydrogens = atoms.filter((a) => a.element === 'H');
    const [c1, c2] = carbons;

    const sub = (a: typeof c1, b: typeof c1) => [a.x - b.x, a.y - b.y, a.z - b.z] as [number, number, number];
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a: number[], b: number[]) => [
      a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
    ] as [number, number, number];
    const unit = (a: number[]) => { const n = Math.hypot(...a); return a.map((x) => x / n) as [number, number, number]; };

    const axis = unit(sub(c2, c1));
    const nearestTo = (c: typeof c1) => hydrogens
      .map((h) => ({ h, d: Math.hypot(...sub(h, c)) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((e) => e.h);
    const [h1a, h1b] = nearestTo(c1);
    // an in-plane direction perpendicular to the C=C axis, from the first H
    const perp = unit((() => {
      const v = sub(h1a, c1);
      const along = dot(v, axis);
      return [v[0] - along * axis[0], v[1] - along * axis[1], v[2] - along * axis[2]];
    })());
    const normal = unit(cross(axis, perp));

    // the H on each carbon on the same side of the C=C axis: the C2 maps one
    // to the other, so their out-of-plane displacements must be opposite
    const pick = (c: typeof c1) => nearestTo(c).find((h) => dot(sub(h, c), perp) > 0)!;
    const chosen = new Set([pick(c1), pick(c2)]);
    const delta = 0.12;
    const sign = (h: typeof c1) => (h === pick(c1) ? 1 : -1);
    const twisted = atoms.map((a) => (chosen.has(a)
      ? { ...a, x: a.x + sign(a) * delta * normal[0], y: a.y + sign(a) * delta * normal[1], z: a.z + sign(a) * delta * normal[2] }
      : a));

    // sanity: the perturbation is real (the mirrors are gone), so a wrong
    // construction shows up as a wrong symbol rather than a passing accident
    expect(h1a).toBeDefined();
    expect(h1b).toBeDefined();
    const result = symmetrizeMolecule({ atoms: twisted, bonds: molecule.bonds });
    expect(result.symbol).toBe('C2');
    expect(result.order).toBe(2);
    expect(result.maxShift).toBeLessThanOrEqual(SYMMETRY_TOLERANCE);
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
