/**
 * The two bromonium ions of 2026-10-23 (NOTES.md): each drawn by the user in
 * the app as the bridged ion, Br+ bonded to both alkene carbons, and exported
 * — not built by hand. The coordinates are GFN2-xTB minima from the Fortran
 * xtb 6.7.1 oracle (`--gfn 2 --chrg 1 --ohess vtight`, all frequencies real),
 * optimised from the user's exported start; the bonds are the sketch's, atoms
 * numbered as the export numbers them.
 */
import type { Bond, Molecule } from '../../src/mol-parser';

function molecule(xyz: string, bonds: [number, number, number][]): Molecule {
  return {
    atoms: xyz.trim().split('\n').map((line) => {
      const [element, x, y, z] = line.trim().split(/\s+/);
      return { element, x: +x, y: +y, z: +z, ...(element === 'Br' ? { charge: 1 } : {}) };
    }),
    bonds: bonds.map(([a, b, order]): Bond => ({ atom1Index: a - 1, atom2Index: b - 1, order })),
  };
}

/**
 * 2-Phenylbut-2-ene + Br+: an unsymmetrical bridge. C2–Br5 2.05 A (Wiberg
 * 0.84); C3–Br5, at the benzylic carbon, 2.60 A (Wiberg 0.20) — 1.33 x the
 * covalent radii sum, past the guard's 1.3, yet still a partial bond.
 */
export const PHENYLBUTENE_BROMONIUM = molecule(`
C    1.00500    6.48686   -0.70934
C    1.37687    5.20524   -0.01103
C    2.34173    4.28043   -0.64712
C    3.32109    4.85209   -1.57674
Br    2.57656    5.55628    1.60742
C    2.30327    2.88773   -0.36961
C    1.09309    2.23098   -0.03359
C    1.07227    0.87958    0.22195
C    2.24899    0.13761    0.18336
C    3.45255    0.76082   -0.13075
C    3.48489    2.10639   -0.41434
H    0.36862    7.08761   -0.06404
H    1.86991    7.08438   -0.98221
H    0.44203    6.24783   -1.61088
H    0.50798    4.71245    0.42195
H    4.11350    4.16300   -1.84983
H    3.74680    5.78427   -1.20498
H    2.78255    5.11459   -2.49438
H    0.15962    2.77135   -0.05350
H    0.13666    0.39289    0.44966
H    2.22752   -0.91965    0.39829
H    4.36735    0.18900   -0.14432
H    4.43640    2.58158   -0.59256
`, [
  [1, 2, 1], [2, 3, 1], [3, 4, 1], [2, 5, 1], [3, 5, 1], [3, 6, 1],
  [6, 7, 2], [7, 8, 1], [8, 9, 2], [9, 10, 1], [10, 11, 2], [11, 6, 1],
  [1, 12, 1], [1, 13, 1], [1, 14, 1], [2, 15, 1], [4, 16, 1], [4, 17, 1], [4, 18, 1],
  [7, 19, 1], [8, 20, 1], [9, 21, 1], [10, 22, 1], [11, 23, 1],
]);

/**
 * 1,1-Diphenylethylene + Br+: the bridge open. C1–Br4 2.00 A (Wiberg 0.92);
 * C2···Br4, at the benzhydryl carbon, 2.75 A (Wiberg 0.085) — the open
 * β-bromo carbocation, the drawn C2–Br4 bond come apart.
 */
export const DIPHENYLETHYLENE_BROMONIUM = molecule(`
C    0.57174    5.29952    0.22963
C    1.78338    4.46608    0.06513
C    3.06116    5.09812   -0.00785
Br    0.50326    5.64300    2.19566
C    1.66603    3.04745    0.06022
C    0.57917    2.38321    0.67561
C    0.48905    1.01123    0.64339
C    1.45292    0.25670   -0.02025
C    2.51931    0.88920   -0.65017
C    2.63394    2.26023   -0.61068
C    4.18861    4.46905    0.57281
C    5.42027    5.08379    0.56158
C    5.57570    6.33045   -0.03374
C    4.48190    6.96417   -0.61590
C    3.24131    6.36937   -0.59716
H   -0.35505    4.80256   -0.04666
H    0.64214    6.28066   -0.23333
H   -0.14522    2.94482    1.24421
H   -0.33044    0.51739    1.14194
H    1.36906   -0.81867   -0.05019
H    3.25409    0.30534   -1.18234
H    3.42611    2.75029   -1.15617
H    4.05699    3.53585    1.09920
H    6.26342    4.60132    1.03094
H    6.54250    6.80945   -0.04055
H    4.60718    7.92522   -1.08999
H    2.42026    6.85124   -1.10521
`, [
  [1, 2, 1], [1, 4, 1], [2, 4, 1], [2, 3, 1], [2, 5, 1],
  [5, 6, 2], [6, 7, 1], [7, 8, 2], [8, 9, 1], [9, 10, 2], [10, 5, 1],
  [3, 11, 2], [11, 12, 1], [12, 13, 2], [13, 14, 1], [14, 15, 2], [15, 3, 1],
  [1, 16, 1], [1, 17, 1], [6, 18, 1], [7, 19, 1], [8, 20, 1], [9, 21, 1], [10, 22, 1],
  [11, 23, 1], [12, 24, 1], [13, 25, 1], [14, 26, 1], [15, 27, 1],
]);
