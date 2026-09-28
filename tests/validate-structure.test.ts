import { describe, it, expect } from 'vitest';
import { structuresMatch, unrepresentableCharge } from '../src/geometry/validate-structure';
import { parseMolBlock } from '../src/mol-parser';
import {
  drawnCyclobutadiene,
  pubchemCyclobutadiene,
  pubchemCyclobutane,
  drawnBenzene,
  pubchemBenzene,
} from './fixtures';

describe('structuresMatch', () => {
  it('accepts the PubChem form of the very molecule that was drawn (cyclobutadiene)', () => {
    // Drawn: 4 C, Kekulé, no H. PubChem: 8 atoms (4 C + 4 H), different
    // atom ordering, planar 3D coords. Heavy atoms + bond orders line up.
    expect(structuresMatch(pubchemCyclobutadiene, drawnCyclobutadiene)).toBe(true);
  });

  it('rejects PubChem cyclobutane when cyclobutadiene was drawn (the reported bug)', () => {
    // Both are 4-carbon rings, so heavy-ATOM sets match — but the bond
    // multiset differs: cyclobutadiene has 2 double + 2 single ring bonds,
    // cyclobutane has 4 single bonds.
    expect(structuresMatch(pubchemCyclobutane, drawnCyclobutadiene)).toBe(false);
  });

  it('accepts a real aromatic molecule (benzene): Kekulé drawn vs Kekulé fetched', () => {
    // PubChem V2000 3D output is Kekulé, so explicit 2/1 bond orders match
    // the sketcher's drawing despite the H's and reordered atoms.
    expect(structuresMatch(pubchemBenzene, drawnBenzene)).toBe(true);
  });

  it('accepts structures whose atom numbering differs', () => {
    // Rotate the drawn cyclobutadiene's atom indices: ring bonds become
    // (0-1,1-2,2-3,3-0) instead of (0-1,1-2,2-3,3-0)... build a shifted copy
    // so the same geometry is indexed starting at a different atom.
    const shifted = parseMolBlock(
      `  4  4  0  0  0  0  0  0  0  0999 V2000
    0.4000    0.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8000    0.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5000   -0.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.3000   -0.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  2  0  0  0  0
  3  4  1  0  0  0  0
  4  1  2  0  0  0  0
M  END
`,
    );
    // Same ring as drawnCyclobutadiene (2 double + 2 single C-C), just
    // numbered from a different starting atom.
    expect(structuresMatch(shifted, drawnCyclobutadiene)).toBe(true);
  });

  it('ignores hydrogens entirely while still comparing the heavy scaffold', () => {
    // Drawn water (1 O) vs a hypothetical "heavy water" with no H at all:
    // same O atom, so they match on heavy atoms alone.
    const o = parseMolBlock(`  1  0  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`);
    const o2h = parseMolBlock(`  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.1173 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.7574    0.0000   -0.4692 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7574    0.0000   -0.4692 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
M  END
`);
    expect(structuresMatch(o, o2h)).toBe(true);
  });

  it('rejects a different element set', () => {
    // Pyridine drawn (5 C + N) must not match a fetched benzene (6 C).
    const pyridine = parseMolBlock(`  6  6  0  0  0  0  0  0  0  0999 V2000
    1.4000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000    1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000    1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000   -1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000   -1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  2  0  0  0  0
  4  5  1  0  0  0  0
  5  6  2  0  0  0  0
  6  1  1  0  0  0  0
M  END
`);
    expect(structuresMatch(pyridine, drawnBenzene)).toBe(false);
  });

  it('rejects a monounsaturation change (cyclobutene vs cyclobutadiene)', () => {
    // 4-ring with ONE double bond vs drawn 4-ring with TWO: element set
    // matches (4 C) but the bond multiset does not.
    const cyclobutene = parseMolBlock(`  4  4  0  0  0  0  0  0  0  0999 V2000
    1.3000   -0.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.4000    0.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8000    0.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5000   -0.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  1  0  0  0  0
  4  1  1  0  0  0  0
M  END
`);
    expect(structuresMatch(cyclobutene, drawnCyclobutadiene)).toBe(false);
  });

  it('accepts a charged sketch matched by a charged fetch (methyl anion)', () => {
    // The methyl anion as JSME sends it: one heavy atom, charge −1, no H's.
    const sketch = parseMolBlock(`  1  0  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  5  0  0  0  0  0  0  0  0  0  0
M  CHG  1   1  -1
M  END
`);
    // PubChem's methanide record: same heavy atom, charge preserved, three
    // explicit H's. Net formal charge −1 on both sides → identity holds.
    const pubchem = parseMolBlock(`  4  3  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  5  0  0  0  0  0  0  0  0  0  0
   -0.9204    0.4506    0.3490 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.8189    0.6270   -0.3291 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.1020   -1.0776   -0.0187 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
M  CHG  1   1  -1
M  END
`);
    // Heavy atoms line up (1 C, no heavy-heavy bonds) AND the charge is −1
    // on both — identity passes. The full fetch guard still rejects this
    // record, though: the −1 has no MMFF94 type, so its conformer is an
    // artifact (see the unrepresentable-charge tests below).
    expect(structuresMatch(pubchem, sketch)).toBe(true);
  });

  it('rejects a neutral fetch for a charged sketch — methane must never serve methanide', () => {
    // Heavy atoms match the methyl anion's (one C) and there are no
    // heavy-heavy bonds, so pre-charge-guard this passed. The net charge
    // (−1 vs 0) is the species' identity: the drawn anion may not be
    // rendered from a neutral record.
    const sketch = parseMolBlock(`  1  0  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  5  0  0  0  0  0  0  0  0  0  0
M  CHG  1   1  -1
M  END
`);
    const methane = parseMolBlock(`  5  4  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    1.0900 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.0274    0.0000   -0.3633 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5137    0.8898   -0.3633 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5137   -0.8898   -0.3633 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  END
`);
    expect(structuresMatch(methane, sketch)).toBe(false);
    expect(structuresMatch(sketch, methane)).toBe(false);
  });

  it('unrepresentableCharge: the carbanion is rejected, representable ions and neutrals are not', () => {
    // The PubChem methanide record again — the −1 on C has no MMFF94 type
    // (C types as neutral CR, C–H BCI is 0), so the charge model cannot
    // account for it. That is why the full fetch guard rejects this record
    // even though the charge identity matches: its conformer came from
    // neutral-type parameters and is an artifact (planar methanide).
    const methanide = parseMolBlock(`  4  3  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  5  0  0  0  0  0  0  0  0  0  0
   -0.9204    0.4506    0.3490 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.8189    0.6270   -0.3291 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.1020   -1.0776   -0.0187 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
M  CHG  1   1  -1
M  END
`);
    expect(unrepresentableCharge(methanide)).toBe(true);

    // Ammonium: the +1 on N has a proper MMFF94 type (34, NR+) with its own
    // primary charge — fully representable, PubChem's record stays trusted.
    const ammonium = parseMolBlock(`  5  4  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 N   0  3  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    1.0220 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.9644    0.0000   -0.3407 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.4822    0.8352   -0.3407 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.4822   -0.8352   -0.3407 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  CHG  1   1  1
M  END
`);
    expect(unrepresentableCharge(ammonium)).toBe(false);

    // Neutral methane — no charge to represent, passes trivially.
    const methane = parseMolBlock(`  5  4  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    1.0900 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.0274    0.0000   -0.3633 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5137    0.8898   -0.3633 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5137   -0.8898   -0.3633 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  END
`);
    expect(unrepresentableCharge(methane)).toBe(false);
  });
});
