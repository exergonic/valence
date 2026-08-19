import { describe, it, expect } from 'vitest';
import { structuresMatch } from '../src/geometry/validate-structure';
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
});
