/**
 * The VSEPR shape check: a centre whose computed angles leave its AXₘEₙ shape
 * is reported; VSEPR's own distortions and ring strain are not.
 *
 * The SeF₄ and SF₄ structures are the Fortran xtb oracle's minima (lenovo,
 * `--ohess vtight`, 2026-10-20; NOTES.md): GFN2 makes SeF₄ a square pyramid,
 * GFN1 a seesaw, and GFN2 gives SF₄ a seesaw.
 */
import { describe, expect, it } from 'vitest';
import type { Atom, Molecule } from '../src/mol-parser';
import { vseprShapeMismatches } from '../src/chem/vsepr/compare-shape';
import { embed3D } from '../src/geometry/embed';

/** An AX₄ centre (atom 0) and its four ligands, from oracle coordinates. */
function ax4(centre: string, coordinates: number[][]): Molecule {
  const atoms: Atom[] = coordinates.map(([x, y, z], k) => ({ element: k === 0 ? centre : 'F', x, y, z }));
  return { atoms, bonds: [1, 2, 3, 4].map((k) => ({ atom1Index: 0, atom2Index: k, order: 1 })) };
}

const SEF4_GFN2 = ax4('Se', [
  [-0.0000015, -0.0000007, -0.4228972],
  [-1.6370428, 0.0000091, 0.2758955], [1.6370447, -0.0000081, 0.2758841],
  [0.0000095, 1.6370062, 0.2760559], [-0.0000076, -1.6370053, 0.2760616],
]);
const SEF4_GFN1 = ax4('Se', [
  [-0.0000011, -0.0000005, -0.3123720],
  [-1.7708768, 0.0000088, -0.2704128], [1.7708749, -0.0000097, -0.2704252],
  [0.0000096, 1.3234103, 0.7671026], [-0.0000042, -1.3234076, 0.7671073],
]);
const SF4_GFN2 = ax4('S', [
  [-0.0000011, -0.0000005, -0.3016716],
  [-1.6905461, 0.0000084, -0.2445846], [1.6905444, -0.0000093, -0.2445964],
  [0.0000091, 1.2388363, 0.7359242], [-0.0000039, -1.2388338, 0.7359285],
]);

describe('the VSEPR shape check', () => {
  it("reports GFN2's square-pyramidal SeF₄ against VSEPR's seesaw", () => {
    const [mismatch, ...rest] = vseprShapeMismatches(SEF4_GFN2);
    expect(rest).toEqual([]);
    expect(mismatch).toMatchObject({
      atomIndex: 0,
      formula: 'AX₄E',
      predicted: 'seesaw',
      predictedAngles: '180°, 120°, 90° ×4',
      measuredAngles: '134° ×2, 81° ×4',
      measured: 'square pyramidal, the centre at its apex',
    });
  });

  it("passes GFN1's SeF₄ and GFN2's SF₄: seesaws, the lone pair squeezing them", () => {
    expect(vseprShapeMismatches(SEF4_GFN1)).toEqual([]);
    expect(vseprShapeMismatches(SF4_GFN2)).toEqual([]);
  });

  it('skips a centre in a small ring: cyclopropane\'s 60° is strain, not a disagreement', () => {
    // drawn as on the sketcher page: a flat triangle, the hydrogens filled by the builder
    const atoms: Atom[] = [0, 1, 2].map((k) => ({
      element: 'C', x: 0.9 * Math.cos((2 * Math.PI * k) / 3), y: 0.9 * Math.sin((2 * Math.PI * k) / 3), z: 0,
    }));
    const ring: Molecule = { atoms, bonds: [[0, 1], [1, 2], [2, 0]].map(([a, b]) => ({ atom1Index: a, atom2Index: b, order: 1 })) };
    expect(vseprShapeMismatches(embed3D(ring).separated)).toEqual([]);
  });
});
