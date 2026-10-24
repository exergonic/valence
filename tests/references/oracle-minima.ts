/**
 * GFN2-xTB minima from the Fortran xtb oracle (xtb 6.7.1 on lenovo), for the
 * tests that need GFN2's own structure rather than a sketch.
 */
import type { Molecule } from '../../src/mol-parser';

/** NaOH, bent 154.6°, −4.7806745 Eh (lenovo ~/naoh, `--gfn 2 --ohess
 *  vtight`, 2026-10-20); held linear it lies 0.40 kcal/mol higher. */
export const NAOH: Molecule = {
  atoms: [
    { element: 'Na', x: 0.2131748, y: 0.0226167, z: -0.0954598 },
    { element: 'O', x: 1.9959748, y: 0.0100149, z: 0.2257780 },
    { element: 'H', x: 2.7720367, y: -0.0002562, z: 0.7811393 },
  ],
  bonds: [{ atom1Index: 0, atom2Index: 1, order: 1 }, { atom1Index: 1, atom2Index: 2, order: 1 }],
};
