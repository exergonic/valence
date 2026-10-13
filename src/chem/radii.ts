// Van der Waals radii (Å), H–Rn — the chemistry data the space-filling
// renderer, the atom balls (0.3 ×), the MMFF94 ESP surface and the
// Merz–Kollman fallback share. Lives here (the chem layer) so the ESP field
// construction doesn't reach into render. The 26 elements the app always had
// keep their values (Bondi and Mantina's extension of it for the main group;
// larger crystallographic values for Mn, Fe, Cu, Zn); the rest are PubChem's
// periodic table, which uses the same Bondi–Mantina set for the main group.
const VDW_RADII: Record<string, number> = {
  H: 1.20, He: 1.40,
  Li: 1.82, Be: 1.53, B: 1.92, C: 1.70, N: 1.55, O: 1.52, F: 1.47, Ne: 1.54,
  Na: 2.27, Mg: 1.73, Al: 1.84, Si: 2.10, P: 1.80, S: 1.80, Cl: 1.75, Ar: 1.88,
  K: 2.75, Ca: 2.31, Sc: 2.11, Ti: 1.87, V: 1.79, Cr: 1.89, Mn: 2.05, Fe: 2.04, Co: 1.92, Ni: 1.63, Cu: 2.00, Zn: 2.10,
  Ga: 1.87, Ge: 2.11, As: 1.85, Se: 1.90, Br: 1.85, Kr: 2.02,
  Rb: 3.03, Sr: 2.49, Y: 2.19, Zr: 1.86, Nb: 2.07, Mo: 2.09, Tc: 2.09, Ru: 2.07, Rh: 1.95, Pd: 2.02, Ag: 1.72, Cd: 1.58,
  In: 1.93, Sn: 2.17, Sb: 2.06, Te: 2.06, I: 1.98, Xe: 2.16,
  Cs: 3.43, Ba: 2.68,
  La: 2.40, Ce: 2.35, Pr: 2.39, Nd: 2.29, Pm: 2.36, Sm: 2.29, Eu: 2.33, Gd: 2.37, Tb: 2.21, Dy: 2.29, Ho: 2.16, Er: 2.35, Tm: 2.27, Yb: 2.42,
  Lu: 2.21, Hf: 2.12, Ta: 2.17, W: 2.10, Re: 2.17, Os: 2.16, Ir: 2.02, Pt: 2.09, Au: 1.66, Hg: 2.09,
  Tl: 1.96, Pb: 2.02, Bi: 2.07, Po: 1.97, At: 2.02, Rn: 2.20,
};

/** Van der Waals radius — used for space-filling (CPK) and the ESP surface. */
export function getVdwRadius(element: string): number {
  return VDW_RADII[element] ?? 1.50;
}

// Covalent radii (Å), Cordero et al. 2008 — the standard single-bond set,
// H–Rn (low-spin values for Mn, Fe and Co), as ASE's ase/data carries it.
// The structure builder's starting scale: place3D emits a unit skeleton, and
// a quantum refiner started from 1 Å bonds is far from any minimum (GFN2
// stalled near 1.5 Å for PCl5 instead of reaching 2.0+). Also the bond-
// integrity check's yardstick, and the size of each atom's orbital lobes.
const COVALENT_RADII: Record<string, number> = {
  H: 0.31, He: 0.28,
  Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58,
  Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06,
  K: 2.03, Ca: 1.76, Sc: 1.70, Ti: 1.60, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22,
  Ga: 1.22, Ge: 1.20, As: 1.19, Se: 1.20, Br: 1.20, Kr: 1.16,
  Rb: 2.20, Sr: 1.95, Y: 1.90, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46, Rh: 1.42, Pd: 1.39, Ag: 1.45, Cd: 1.44,
  In: 1.42, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.40,
  Cs: 2.44, Ba: 2.15,
  La: 2.07, Ce: 2.04, Pr: 2.03, Nd: 2.01, Pm: 1.99, Sm: 1.98, Eu: 1.98, Gd: 1.96, Tb: 1.94, Dy: 1.92, Ho: 1.92, Er: 1.89, Tm: 1.90, Yb: 1.87,
  Lu: 1.87, Hf: 1.75, Ta: 1.70, W: 1.62, Re: 1.51, Os: 1.44, Ir: 1.41, Pt: 1.36, Au: 1.36, Hg: 1.32,
  Tl: 1.45, Pb: 1.46, Bi: 1.48, Po: 1.40, At: 1.50, Rn: 1.50,
};

/** Covalent radius — the sum over a bond is a good first guess at its length. */
export function getCovalentRadius(element: string): number {
  return COVALENT_RADII[element] ?? 1.40;
}