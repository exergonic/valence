// Standard atomic weights (g/mol), H–Rn — every element GFN2-xTB treats, so
// every element "More…" can place. IUPAC 2016 conventional values (an
// element with no standard weight takes its longest-lived isotope: Tc, Pm,
// Po, At, Rn), as ASE's ase/data carries them. One table for every consumer:
// the molecular-weight readout (resolve3d.computeFormula), the centre of mass
// (the dipole's origin for an ion, the principal-axis frame) and the
// mass-weighted Hessian of the vibrations.
//
// An element outside the table contributes mass 0 — which the vibrations
// refuse rather than divide by — but nothing the app can draw is outside it.
export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, He: 4.0026,
  Li: 6.94, Be: 9.01218, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.9984, Ne: 20.1797,
  Na: 22.9898, Mg: 24.305, Al: 26.9815, Si: 28.085, P: 30.9738, S: 32.06, Cl: 35.45, Ar: 39.948,
  K: 39.0983, Ca: 40.078, Sc: 44.9559, Ti: 47.867, V: 50.9415, Cr: 51.9961, Mn: 54.938, Fe: 55.845, Co: 58.9332, Ni: 58.6934, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.63, As: 74.9216, Se: 78.971, Br: 79.904, Kr: 83.798,
  Rb: 85.4678, Sr: 87.62, Y: 88.9058, Zr: 91.224, Nb: 92.9064, Mo: 95.95, Tc: 97.9072, Ru: 101.07, Rh: 102.9055, Pd: 106.42, Ag: 107.8682, Cd: 112.414,
  In: 114.818, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.9045, Xe: 131.293,
  Cs: 132.9055, Ba: 137.327,
  La: 138.9055, Ce: 140.116, Pr: 140.9077, Nd: 144.242, Pm: 144.9128, Sm: 150.36, Eu: 151.964, Gd: 157.25, Tb: 158.9254, Dy: 162.5, Ho: 164.9303, Er: 167.259, Tm: 168.9342, Yb: 173.054,
  Lu: 174.9668, Hf: 178.49, Ta: 180.9479, W: 183.84, Re: 186.207, Os: 190.23, Ir: 192.217, Pt: 195.084, Au: 196.9666, Hg: 200.592,
  Tl: 204.38, Pb: 207.2, Bi: 208.9804, Po: 208.9824, At: 209.9872, Rn: 222.0176,
};
