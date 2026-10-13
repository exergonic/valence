// Element colours, H–Rn: Jmol's palette, as the elements the app always had
// were already drawn (a few of those — Li, He, Zn — keep the app's own
// shades), the rest from ASE's copy of Jmol's table.
export const ELEMENT_COLORS: Record<string, number> = {
  H: 0xffffff, He: 0xd9e4ff,
  Li: 0xb255ff, Be: 0xc2ff00, B: 0xffb5b5, C: 0x909090, N: 0x3050f8, O: 0xff0d0d, F: 0x90e050, Ne: 0xb3e3f5,
  Na: 0xab5cf2, Mg: 0x8aff00, Al: 0xbfa6a6, Si: 0xf0c8a0, P: 0xff8000, S: 0xffff30, Cl: 0x1ff01f, Ar: 0x80d1e3,
  K: 0x8f40d4, Ca: 0x3dff00, Sc: 0xe6e6e6, Ti: 0xbfc2c7, V: 0xa6a6ab, Cr: 0x8a99c7, Mn: 0x9c7ac7, Fe: 0xe06633, Co: 0xf090a0, Ni: 0x50d050, Cu: 0xc88033, Zn: 0x490d66,
  Ga: 0xc28f8f, Ge: 0x668f8f, As: 0xbd80e3, Se: 0xffa100, Br: 0xa62929, Kr: 0x5cb8d1,
  Rb: 0x702eb0, Sr: 0x00ff00, Y: 0x94ffff, Zr: 0x94e0e0, Nb: 0x73c2c9, Mo: 0x54b5b5, Tc: 0x3b9e9e, Ru: 0x248f8f, Rh: 0x0a7d8c, Pd: 0x006985, Ag: 0xc0c0c0, Cd: 0xffd98f,
  In: 0xa67573, Sn: 0x668080, Sb: 0x9e63b5, Te: 0xd47a00, I: 0x940094, Xe: 0x429eb0,
  Cs: 0x57178f, Ba: 0x00c900,
  La: 0x70d4ff, Ce: 0xffffc7, Pr: 0xd9ffc7, Nd: 0xc7ffc7, Pm: 0xa3ffc7, Sm: 0x8fffc7, Eu: 0x61ffc7, Gd: 0x45ffc7, Tb: 0x30ffc7, Dy: 0x1fffc7, Ho: 0x00ff9c, Er: 0x00e675, Tm: 0x00d452, Yb: 0x00bf38,
  Lu: 0x00ab24, Hf: 0x4dc2ff, Ta: 0x4da6ff, W: 0x2194d6, Re: 0x267dab, Os: 0x266696, Ir: 0x175487, Pt: 0xd0d0e0, Au: 0xffd123, Hg: 0xb8b8d0,
  Tl: 0xa6544d, Pb: 0x575961, Bi: 0x9e4fb5, Po: 0xab5c00, At: 0x754f45, Rn: 0x428296,
};

// Visual radii (atom spheres in ball-and-stick display) are the van der Waals
// radius scaled down.  0.3 is Avogadro's ball-and-stick default
// (ballandstick/atomScale 0.3, avogadrolibs), so a molecule reads the same
// size here and there — and the element-to-element proportions match, which
// hand-picked numbers drifted away from (carbon ran ~8% large, ~11% large
// relative to hydrogen).
export const VISUAL_RADIUS_SCALE = 0.3;

export function getElementColor(element: string): number {
  return ELEMENT_COLORS[element] ?? 0xcc88ff;
}

// Both radii live in the chem layer (src/chem/radii.ts): the van der Waals
// radii for the ESP field and the space-filling renderer, the covalent radii
// for the structure builder and the orbital lobes' size — one table each.
import { getCovalentRadius, getVdwRadius } from '../chem/radii';
export { getCovalentRadius, getVdwRadius };

/** Visual radius — used for atom sphere display (0.3 × the van der Waals radius) */
export function getVisualRadius(element: string): number {
  return VISUAL_RADIUS_SCALE * getVdwRadius(element);
}
