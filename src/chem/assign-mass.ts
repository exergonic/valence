// Standard atomic weights (IUPAC, in g/mol) for the elements the sketcher
// and the examples can produce. Assign each element its mass so every
// consumer shares one table: the molecular-weight readout
// (resolve3d.computeFormula) and the dipole's center of mass
// (chem/charge-model/dipole.ts).
//
// Fallback: an element not in the table contributes mass 0 (the same
// convention as the molecular-weight readout). For the center of mass a
// missing entry therefore skips the atom — a rare element the table does
// not know would pull the COM toward the atoms it does. The table covers
// everything the examples and the JSME sketcher emit in practice.
export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, He: 4.003,
  Li: 6.941, Be: 9.012, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180,
  Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.086, P: 30.974, S: 32.065, Cl: 35.453, Ar: 39.948,
  K: 39.098, Ca: 40.078,
  Fe: 55.845, Cu: 63.546, Zn: 65.38, Mn: 54.938,
  Br: 79.904, I: 126.904,
};
