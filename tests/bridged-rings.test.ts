/**
 * Bridged ring systems, placed from their bond graph (bridged-rings.ts).
 *
 * Every bridged sketch tried on 2026-11-23 — norbornane, norbornene, camphor,
 * bicyclo[2.2.2]octane, adamantane, cubane and more — started with atoms
 * inside bonding distance of atoms they are not bonded to, and none came back
 * as the molecule drawn: GFN2 closed three-membered rings, and the app showed
 * a held structure or the bare start. The sketches here are JSME's own
 * drawings (tests/references/sketches.ts); the energies are the Fortran xtb
 * 6.7.1 oracle's (`--gfn 2 --ohess vtight`), re-optimised from the app's
 * result and confirmed a minimum, no imaginary mode.
 */
import { describe, it, expect } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { embed3D } from '../src/geometry/embed';
import { isMoleculeDrawn } from '../src/geometry/bond-integrity';
import { ringSystems, drawingFits } from '../src/geometry/bridged-rings';
import { localGeometry } from './helpers/local-geometry';
import {
  NORBORNANE, NORBORNANE_WEDGED, NORBORNENE, BICYCLO_222_OCTANE, ADAMANTANE, CUBANE,
  CAMPHOR_1R, CAMPHOR_1S, EXO_NORBORNEOL, ENDO_NORBORNEOL, NAPHTHALENE,
} from './references/sketches';

const distance = (m: Molecule, i: number, j: number) =>
  Math.hypot(m.atoms[i].x - m.atoms[j].x, m.atoms[i].y - m.atoms[j].y, m.atoms[i].z - m.atoms[j].z);

/** The sign of the triple product of three bonds from `centre`: which hand
 *  the centre is. */
function handedness(m: Molecule, centre: number, [a, b, c]: number[]): number {
  const v = [a, b, c].map((k) => [m.atoms[k].x - m.atoms[centre].x, m.atoms[k].y - m.atoms[centre].y, m.atoms[k].z - m.atoms[centre].z]);
  return Math.sign(
    v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1])
    - v[0][1] * (v[1][0] * v[2][2] - v[1][2] * v[2][0])
    + v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0]));
}

/** Is the drawing's only ring system one the flat seed can use? */
function fits(sketch: string): boolean {
  const m = parseMolBlock(sketch);
  const ringBonds = m.bonds.map((b) => [b.atom1Index, b.atom2Index] as [number, number]); // every bond is a ring bond in these
  const [system] = ringSystems(m.atoms.length, ringBonds);
  const drawn = ringBonds.reduce((s, [i, j]) => s + Math.hypot(m.atoms[i].x - m.atoms[j].x, m.atoms[i].y - m.atoms[j].y), 0);
  return drawingFits(m, system, ringBonds, (1.52 * ringBonds.length) / drawn);
}

describe('which drawings are placed from the bond graph', () => {
  it('norbornane: its bridge is drawn inside the ring', () => {
    expect(fits(NORBORNANE)).toBe(false);
  });
  it('naphthalene: a fused system, drawn as the shape it has', () => {
    const m = parseMolBlock(NAPHTHALENE);
    expect(m.bonds.length).toBe(11); // all ring bonds
    expect(fits(NAPHTHALENE)).toBe(true);
  });
});

describe('the start of a bridged system', () => {
  it('puts the drawn wedges\' bridge toward the viewer', () => {
    // the user's drawing: C3→C7 and C6→C7 wedged, C7 the one-carbon bridge
    const start = embed3D(parseMolBlock(NORBORNANE_WEDGED)).separated;
    expect(start.atoms[6].z).toBeGreaterThan(start.atoms[2].z);
    expect(start.atoms[6].z).toBeGreaterThan(start.atoms[5].z);
  });
});

describe('a bridged system through the local pipeline', () => {
  // [sketch, xtb's energy (Eh), tolerance]: bicyclo[2.2.2]octane's twist is
  // a soft mode (87 cm⁻¹), where Berny's loose gate stops a fraction of a
  // kcal/mol high (AGENTS.md, Known limitations)
  const cases: [string, string, number, number][] = [
    ['norbornane', NORBORNANE, -21.130659562805, 1e-4],
    ['norbornene', NORBORNENE, -20.067731506672, 1e-4],
    ['bicyclo[2.2.2]octane', BICYCLO_222_OCTANE, -24.302298514181, 5e-4],
    ['adamantane', ADAMANTANE, -29.639231306698, 1e-4],
    ['cubane', CUBANE, -21.099933706211, 1e-4],
  ];
  it.each(cases)('%s converges to the molecule drawn, at xtb\'s minimum', async (_, sketch, energy, tolerance) => {
    const local = await localGeometry(parseMolBlock(sketch));
    expect(local?.engine).toBe('gfn2');
    expect(local!.gfn2!.converged).toBe(true);
    expect(isMoleculeDrawn(local!.molecule)).toBe(true);
    expect(Math.abs(local!.gfn2!.energyHartree - energy)).toBeLessThan(tolerance);
  }, 120_000);

  it('the camphors come out as the enantiomers drawn', async () => {
    // JSME's atom 7 is C1, the bridgehead carrying the methyl (atom 8), the
    // carbonyl carbon (atom 9) and C6 (atom 6); Open Babel read both results
    // back as the SMILES drawn (NOTES.md, 2026-11-23)
    const [r, s] = await Promise.all([CAMPHOR_1R, CAMPHOR_1S].map((sketch) => localGeometry(parseMolBlock(sketch))));
    for (const local of [r, s]) {
      expect(local?.engine).toBe('gfn2');
      expect(isMoleculeDrawn(local!.molecule)).toBe(true);
    }
    expect(handedness(r!.molecule, 6, [7, 8, 5])).toBe(-handedness(s!.molecule, 6, [7, 8, 5]));
  }, 120_000);

  it('exo- and endo-norborneol keep the OH where drawn', async () => {
    // O is atom 1, C7 the one-carbon bridge is atom 8, C6 across the ring atom 6
    const exo = (await localGeometry(parseMolBlock(EXO_NORBORNEOL)))!.molecule;
    const endo = (await localGeometry(parseMolBlock(ENDO_NORBORNEOL)))!.molecule;
    expect(distance(exo, 0, 7)).toBeLessThan(distance(exo, 0, 5));
    expect(distance(endo, 0, 5)).toBeLessThan(distance(endo, 0, 7));
  }, 120_000);
});
