/**
 * Flipping a ring (geometry/ring-flip.ts), and the chair every local build
 * starts in.
 *
 * The sketches are JSME's own drawings (tests/references/sketches.ts). The
 * energies are the Fortran xtb 6.7.1 oracle's (`--gfn 2 --ohess vtight`),
 * re-optimised from the app's two chairs of each molecule, each confirmed a
 * minimum, no imaginary mode (NOTES.md, 2026-11-24). Experiment's A-values
 * run a little higher (methylcyclohexane's is 1.74 kcal/mol): GFN2-xTB is
 * semiempirical.
 */
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { Molecule } from '../src/mol-parser';
import { parseMolBlock } from '../src/mol-parser';
import { embed3D, breakSymmetry } from '../src/geometry/embed';
import { isMoleculeDrawn } from '../src/geometry/bond-integrity';
import { chairPositions, flipChair, isChair, ringToFlip, ringTorsions, sixMemberedRings } from '../src/geometry/ring-flip';
import { localGeometry } from './helpers/local-geometry';
import {
  METHYLCYCLOHEXANE, CIS_1_2_DIMETHYLCYCLOHEXANE, TRANS_1_2_DIMETHYLCYCLOHEXANE, CIS_1_3_DIMETHYLCYCLOHEXANE,
  TRANS_1_3_DIMETHYLCYCLOHEXANE, CIS_1_4_DIMETHYLCYCLOHEXANE, TRANS_1_4_DIMETHYLCYCLOHEXANE, MENTHOL,
  CIS_4_TERT_BUTYLCYCLOHEXANOL, BETA_D_GLUCOSE, ALPHA_D_GLUCOSE, TRANS_DECALIN, CYCLOHEXENE, NORBORNANE,
} from './references/sketches';

const KCAL_PER_HARTREE = 627.509474;
const vendorFile = (name: string) => fileURLToPath(new URL(`../vendor/occ-wasm/${name.split('/').pop()}`, import.meta.url));

const start = (sketch: string) => embed3D(parseMolBlock(sketch)).separated;
const ringOf = (m: Molecule) => sixMemberedRings(m)[0];
const heavy = (m: Molecule) => chairPositions(m).filter((p) => m.atoms[p.substituent].element !== 'H');
const distance = (m: Molecule, i: number, j: number) =>
  Math.hypot(m.atoms[i].x - m.atoms[j].x, m.atoms[i].y - m.atoms[j].y, m.atoms[i].z - m.atoms[j].z);

/** Which hand a ring atom is: the sign of the triple product of its first
 *  three neighbours, by number. A flip that kept the configuration keeps it. */
function handedness(m: Molecule, centre: number): number {
  const nbs = m.bonds.flatMap((b) => (b.atom1Index === centre ? [b.atom2Index] : b.atom2Index === centre ? [b.atom1Index] : []))
    .sort((a, b) => a - b).slice(0, 3);
  const v = nbs.map((k) => [m.atoms[k].x - m.atoms[centre].x, m.atoms[k].y - m.atoms[centre].y, m.atoms[k].z - m.atoms[centre].z]);
  return Math.sign(v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1]) - v[0][1] * (v[1][0] * v[2][2] - v[1][2] * v[2][0])
    + v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0]));
}

const RINGS: [string, string][] = [
  ['methylcyclohexane', METHYLCYCLOHEXANE],
  ['cis-1,2-dimethylcyclohexane', CIS_1_2_DIMETHYLCYCLOHEXANE],
  ['trans-1,2-dimethylcyclohexane', TRANS_1_2_DIMETHYLCYCLOHEXANE],
  ['cis-1,3-dimethylcyclohexane', CIS_1_3_DIMETHYLCYCLOHEXANE],
  ['trans-1,3-dimethylcyclohexane', TRANS_1_3_DIMETHYLCYCLOHEXANE],
  ['cis-1,4-dimethylcyclohexane', CIS_1_4_DIMETHYLCYCLOHEXANE],
  ['trans-1,4-dimethylcyclohexane', TRANS_1_4_DIMETHYLCYCLOHEXANE],
  ['menthol', MENTHOL],
  ['cis-4-tert-butylcyclohexanol', CIS_4_TERT_BUTYLCYCLOHEXANOL],
];

describe('the chair a local build starts in', () => {
  // the heavy substituents axial in the textbook chair: none where every group
  // can be equatorial, one where cis or trans puts one axial in either chair
  const axial: Record<string, number> = {
    'methylcyclohexane': 0, 'cis-1,2-dimethylcyclohexane': 1, 'trans-1,2-dimethylcyclohexane': 0,
    'cis-1,3-dimethylcyclohexane': 0, 'trans-1,3-dimethylcyclohexane': 1, 'cis-1,4-dimethylcyclohexane': 1,
    'trans-1,4-dimethylcyclohexane': 0, 'menthol': 0, 'cis-4-tert-butylcyclohexanol': 1,
  };
  it.each(RINGS)('%s starts as a chair, its bulkier groups equatorial', (name, sketch) => {
    const m = start(sketch);
    expect(isChair(m, ringOf(m))).toBe(true);
    expect(heavy(m).filter((p) => p.axial).length).toBe(axial[name]);
  });

  it('cis-4-tert-butylcyclohexanol puts the tert-butyl equatorial and so the OH axial', () => {
    const m = start(CIS_4_TERT_BUTYLCYCLOHEXANOL);
    const positions = heavy(m);
    expect(positions.find((p) => m.atoms[p.substituent].element === 'C')!.axial).toBe(false);
    expect(positions.find((p) => m.atoms[p.substituent].element === 'O')!.axial).toBe(true);
  });
});

describe('flipping a chair', () => {
  it.each(RINGS)('%s: the other chair, every group on its own face, every configuration kept', (_, sketch) => {
    const m = start(sketch);
    const choice = ringToFlip(m, ringOf(m)[0]);
    expect('ring' in choice).toBe(true);
    const ring = (choice as { ring: number[] }).ring;
    const flipped = flipChair(m, ring);
    expect(isChair(flipped, ring)).toBe(true);
    // the pucker turned over: every ring torsion changes sign
    const before = ringTorsions(m, ring);
    ringTorsions(flipped, ring).forEach((t, k) => expect(Math.sign(t)).toBe(-Math.sign(before[k])));
    // axial and equatorial trade places, each group on the face it was on
    const was = new Map(chairPositions(m).map((p) => [p.substituent, p]));
    for (const p of chairPositions(flipped)) {
      expect(p.axial).toBe(!was.get(p.substituent)!.axial);
    }
    const faces = (x: Molecule) => {
      const ps = chairPositions(x);
      return ps.map((p) => p.face * ps[0].face);
    };
    expect(faces(flipped)).toEqual(faces(m));
    for (const atom of ring) expect(handedness(flipped, atom)).toBe(handedness(m, atom));
    // every bond as long as it was
    for (const b of m.bonds) expect(distance(flipped, b.atom1Index, b.atom2Index)).toBeCloseTo(distance(m, b.atom1Index, b.atom2Index), 6);
  });
});

describe('a ring that cannot flip says why', () => {
  it('a fused ring', () => {
    const m = start(TRANS_DECALIN);
    expect(ringToFlip(m, 2)).toEqual({ refusal: expect.stringMatching(/fused/) });
  });
  it('a bridged ring', () => {
    const m = start(NORBORNANE);
    expect(ringToFlip(m, 0)).toEqual({ refusal: expect.stringMatching(/bridged/) });
  });
  it('a ring with a double bond', () => {
    const m = start(CYCLOHEXENE);
    expect(ringToFlip(m, 3)).toEqual({ refusal: expect.stringMatching(/double bond/) });
  });
  it('an atom outside any six-membered ring', () => {
    const m = start(METHYLCYCLOHEXANE);
    expect(ringToFlip(m, 0)).toEqual({ refusal: expect.stringMatching(/not in a six-membered ring/) });
  });
});

describe('both chairs under GFN2-xTB', () => {
  // [sketch, xtb's ΔE (kcal/mol), the other chair less the textbook one]
  const cases: [string, string, number][] = [
    ['methylcyclohexane, the methyl axial', METHYLCYCLOHEXANE, 1.514],
    ['cis-1,3-dimethylcyclohexane, 1,3-diaxial', CIS_1_3_DIMETHYLCYCLOHEXANE, 4.847],
    ['trans-1,4-dimethylcyclohexane, diaxial', TRANS_1_4_DIMETHYLCYCLOHEXANE, 2.999],
  ];
  it.each(cases)('%s: a minimum, the molecule drawn, at xtb\'s ΔE', async (_, sketch, delta) => {
    const { optimizeWithGfn2 } = await import('../src/geometry/gfn2-refine.worker');
    const local = (await localGeometry(parseMolBlock(sketch)))!;
    expect(local.engine).toBe('gfn2');
    const m = local.molecule;
    const choice = ringToFlip(m, ringOf(m)[0]) as { ring: number[] };
    const other = (await optimizeWithGfn2(breakSymmetry(flipChair(m, choice.ring)), vendorFile))!;
    expect(other.converged).toBe(true);
    expect(isMoleculeDrawn(other.molecule)).toBe(true);
    expect(isChair(other.molecule, choice.ring)).toBe(true);
    for (const atom of choice.ring) expect(handedness(other.molecule, atom)).toBe(handedness(m, atom));
    expect(Math.abs((other.energyHartree - local.gfn2!.energyHartree) * KCAL_PER_HARTREE - delta)).toBeLessThan(0.05);
  }, 120_000);

  it('β-glucose comes out all equatorial; α-glucose with its anomeric OH axial', async () => {
    const [beta, alpha] = await Promise.all([BETA_D_GLUCOSE, ALPHA_D_GLUCOSE].map((s) => localGeometry(parseMolBlock(s))));
    expect(heavy(beta!.molecule).filter((p) => p.axial)).toEqual([]);
    const axialAlpha = heavy(alpha!.molecule).filter((p) => p.axial);
    expect(axialAlpha.length).toBe(1);
    // the anomeric carbon is the ring carbon bonded to the ring oxygen and an OH
    const m = alpha!.molecule;
    const anomeric = axialAlpha[0].ringAtom;
    const oxygens = m.bonds.filter((b) => b.atom1Index === anomeric || b.atom2Index === anomeric)
      .map((b) => (b.atom1Index === anomeric ? b.atom2Index : b.atom1Index)).filter((k) => m.atoms[k].element === 'O');
    expect(oxygens.length).toBe(2);
  }, 120_000);
});
