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

/** The period (row) — also the principal quantum number of the valence s. */
export function period(element: string): number {
  const z = atomicNumber(element);
  return [2, 10, 18, 36, 54, 86, 118].findIndex((last) => z <= last) + 1;
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

export function isMetal(element: string): boolean {
  return elementKind(element) === 'metal';
}

/**
 * The elements whose bonding the electron-domain picture does not describe:
 * the d and f blocks (Sc–Zn, Y–Cd, La–Hg) and the alkali metals. A transition
 * metal's geometry is the ligand field's, not a count of σ pairs, and an
 * alkali metal's one valence electron makes a contact that is mostly ionic.
 * These show their valence s orbital alone (`valenceSOrbital`) — true as far
 * as it goes, and all a VSEPR picture can honestly say about them.
 */
export function showsOnlyValenceS(element: string): boolean {
  const z = atomicNumber(element);
  const alkali = [3, 11, 19, 37, 55, 87].includes(z);
  const dOrFBlock = (z >= 21 && z <= 30) || (z >= 39 && z <= 48) || (z >= 57 && z <= 80) || z >= 89;
  return alkali || dOrFBlock;
}

/** The valence s orbital's name, "4s" for nickel. */
export function valenceSOrbital(element: string): string {
  return `${period(element)}s`;
}

/**
 * The lowest spin multiplicity the electron count allows: a singlet when the
 * count is even, a doublet when it is odd. Only the parity matters, and a
 * core is always an even number of electrons, so the count of all electrons
 * (Σ Z less the net charge) has the parity of the valence count. A sketch
 * carries no spin, so this is the default an unpaired electron needs: H₃Si–Ni
 * has 17 valence electrons and cannot be a singlet.
 */
export function lowestMultiplicity(atoms: Array<{ element: string; charge?: number }>): number {
  let electrons = 0;
  for (const a of atoms) electrons += atomicNumber(a.element) - (a.charge ?? 0);
  return electrons % 2 === 0 ? 1 : 2;
}
