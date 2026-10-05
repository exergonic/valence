/**
 * Valence Molecule → mmff94-ts Molecule, for everything that hands a molecule
 * to that library: the BCI charge model (chem/charge-model/bci-charges.ts) and
 * its parameter-gap report, and the GFN2 worker, whose fallback optimisers
 * (behind OCC's Berny) are the library's own L-BFGS and steepest descent.
 * The library is not a geometry engine here any more — GFN2-xTB is — but it
 * is still the charge model and that fallback.
 *
 * The valence data model names bonds atom1Index/atom2Index/order and atoms
 * element/x/y/z/charge; the library wants atomic index fields,
 * atom1/atom2/bond_order, and formal_charge. Only the genuinely charged atoms
 * pass formal_charge — the library derives primary BCI charges from the
 * assigned atom type when it is absent, so a neutral molecule must not carry it
 * (measured: charged variants come out exactly as before while a drawn ion gets
 * its charged types).
 */
import type { Molecule as MMFFMolecule } from 'mmff94-ts';
import type { Molecule } from '../mol-parser';

export function toMMFFMol(molecule: Molecule): MMFFMolecule {
  return {
    atoms: molecule.atoms.map((a, i) => ({
      index: i,
      element: a.element,
      x: a.x,
      y: a.y,
      z: a.z,
      ...(a.charge ? { formal_charge: a.charge } : {}),
    })),
    bonds: molecule.bonds.map((b) => ({
      atom1: b.atom1Index,
      atom2: b.atom2Index,
      bond_order: b.order,
    })),
  };
}
