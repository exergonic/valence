// A drawn wedge or hash fixes which enantiomer a sketch means. The graph-walk
// embedder knew nothing about it, so a drawn (S)-2-bromobutane came out
// identical to the (R) drawing — both (R).
//
// The reference here is PubChem's own 3D conformer of the *same* stereoisomer
// (2D SDF with the wedge, 3D SDF of the same CID), not a hand-drawn ideal: our
// pipeline must land on the configuration PubChem publishes for that drawing.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { fillMissingHydrogens } from '../src/chem/fill-hydrogens';
import { place3D } from '../src/geometry/place3d';
import { chiralitySign } from '../src/geometry/stereo-wedge';

type Vec3 = [number, number, number];

const fixture = (name: string) => readFileSync(new URL(`./references/stereo/${name}`, import.meta.url), 'utf8');

/** The stereocenter, the wedged atom, and the first two plain neighbors in
 *  index order — the same choice applyWedgeStereo makes. */
function stereoParts(molecule: Molecule) {
  const bond = molecule.bonds.find((b) => b.stereo);
  expect(bond, 'fixture carries a wedge or hash bond').toBeTruthy();
  const center = bond!.atom1Index;
  const wedged = bond!.atom2Index;
  const plain = molecule.bonds
    .filter((b) => b.atom1Index === center || b.atom2Index === center)
    .map((b) => (b.atom1Index === center ? b.atom2Index : b.atom1Index))
    .filter((i) => i !== wedged)
    .sort((a, b) => a - b);
  return { center, wedged, n1: plain[0], n2: plain[1] };
}

const positions = (molecule: Molecule): Vec3[] => molecule.atoms.map((a) => [a.x, a.y, a.z]);

/** Drop explicit hydrogens and renumber — what a sketcher hands us: a heavy-atom
 *  skeleton whose hydrogens fillMissingHydrogens adds back. */
function heavyAtomsOnly(molecule: Molecule): Molecule {
  const remap = new Map<number, number>();
  const atoms: Molecule['atoms'] = [];
  molecule.atoms.forEach((atom, i) => {
    if (atom.element === 'H') return;
    remap.set(i, atoms.length);
    atoms.push(atom);
  });
  const bonds = molecule.bonds
    .filter((b) => remap.has(b.atom1Index) && remap.has(b.atom2Index))
    .map((b) => ({ ...b, atom1Index: remap.get(b.atom1Index)!, atom2Index: remap.get(b.atom2Index)! }));
  return { atoms, bonds };
}

const CASES = [
  ['(R)-2-bromobutane', 'pc-R-2bromobutane.sdf', 'pc-R-2bromobutane-3d.sdf'],
  ['(S)-2-bromobutane', 'pc-S-2bromobutane.sdf', 'pc-S-2bromobutane-3d.sdf'],
  ['L-alanine', 'pc-L-alanine.sdf', 'pc-L-alanine-3d.sdf'],
] as const;

describe('wedge and hash bonds', () => {
  it('parses the V2000 bond stereo flag, and only for real wedges', () => {
    expect(parseMolBlock(fixture('pc-R-2bromobutane.sdf')).bonds.filter((b) => b.stereo).map((b) => b.stereo)).toEqual([1]);
    expect(parseMolBlock(fixture('pc-S-2bromobutane.sdf')).bonds.filter((b) => b.stereo).map((b) => b.stereo)).toEqual([6]);
    // Plain bonds and the aromatic/either flag (4) carry no absolute
    // configuration, so nothing is recorded for them.
    const plain = parseMolBlock(`  2  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  2  1  4  0  0  0
M  END
`);
    expect(plain.bonds.map((b) => b.stereo)).toEqual([undefined, undefined]);
  });

  it('keeps the two drawings apart — the regression', () => {
    const r = stereoParts(parseMolBlock(fixture('pc-R-2bromobutane.sdf')));
    const s = stereoParts(parseMolBlock(fixture('pc-S-2bromobutane.sdf')));
    const rPos = place3D(fillMissingHydrogens(parseMolBlock(fixture('pc-R-2bromobutane.sdf'))));
    const sPos = place3D(fillMissingHydrogens(parseMolBlock(fixture('pc-S-2bromobutane.sdf'))));
    expect(chiralitySign(rPos, r.center, r.n1, r.n2, r.wedged))
      .toBe(-chiralitySign(sPos, s.center, s.n1, s.n2, s.wedged));
  });

  for (const [tag, twoD, threeD] of CASES) {
    it(`embeds ${tag} with the configuration PubChem gives that stereoisomer`, () => {
      const sketch = parseMolBlock(fixture(twoD));
      const reference = parseMolBlock(fixture(threeD));
      // The two files are the same compound from the same service, so atom i
      // means the same atom in both.
      expect(reference.atoms.map((a) => a.element)).toEqual(sketch.atoms.map((a) => a.element));

      const { center, wedged, n1, n2 } = stereoParts(sketch);
      const expected = chiralitySign(positions(reference), center, n1, n2, wedged);
      expect(chiralitySign(place3D(fillMissingHydrogens(sketch)), center, n1, n2, wedged)).toBe(expected);
    });

    it(`embeds ${tag} correctly from a heavy-atom sketch (implicit hydrogens)`, () => {
      const sketch = heavyAtomsOnly(parseMolBlock(fixture(twoD)));
      const reference = parseMolBlock(fixture(threeD));
      const { center, wedged, n1, n2 } = stereoParts(sketch);
      // Dropping the hydrogens keeps the heavy atoms' indices, so the reference
      // positions still line up.
      const expected = chiralitySign(positions(reference), center, n1, n2, wedged);
      expect(chiralitySign(place3D(fillMissingHydrogens(sketch)), center, n1, n2, wedged)).toBe(expected);
    });
  }
});
