/**
 * The elements by atomic number, and the classes the app treats differently:
 * which take implicit hydrogens, which the electron-domain (VSEPR) picture
 * describes, which show only their valence s orbital — and the spin a
 * molecule's electron count allows.
 */
import { takesImplicitHydrogens } from './fill-hydrogens';

/** Element symbols in order of atomic number, the whole periodic table. The
 *  GFN2 engine's own parameter table (through Rn) decides what it treats, so
 *  this must not be the narrower of the two. */
const ELEMENTS = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca ' +
  'Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr ' +
  'Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd ' +
  'Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg ' +
  'Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm ' +
  'Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
).split(' ');

/** The elements GFN2-xTB is parameterised for, H–Rn (Z = 1–86). */
export const GFN2_ELEMENTS = ELEMENTS.slice(0, 86);

/** Atomic number, or 0 for a symbol that is no element. */
export function atomicNumber(element: string): number {
  return ELEMENTS.indexOf(element) + 1;
}

const NOBLE_GASES = new Set(['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn']);

/** The three kinds the sketch treats differently: a nonmetal (or semimetal)
 *  is filled with hydrogens to its usual valence; a metal and a noble gas
 *  carry only the hydrogens drawn. */
export function elementKind(element: string): 'nonmetal' | 'noble-gas' | 'metal' {
  if (takesImplicitHydrogens(element)) return 'nonmetal';
  if (NOBLE_GASES.has(element)) return 'noble-gas';
  return 'metal';
}
