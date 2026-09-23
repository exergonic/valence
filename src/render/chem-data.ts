export const ELEMENT_COLORS: Record<string, number> = {
  H: 0xffffff,
  C: 0x909090,
  N: 0x3050f8,
  O: 0xff0d0d,
  F: 0x90e050,
  P: 0xff8000,
  S: 0xffff30,
  Cl: 0x1ff01f,
  Br: 0xa62929,
  I: 0x940094,
  B: 0xffb5b5,
  Si: 0xf0c8a0,
  Li: 0xb255ff,
  Na: 0xab5cf2,
  K: 0x8f40d4,
  Mg: 0x8aff00,
  Ca: 0x3dff00,
  Fe: 0xe06633,
  Zn: 0x490d66,
  Cu: 0xc88033,
  Mn: 0x9c7ac7,
  He: 0xd9e4ff,
  Ne: 0xb3e3f5,
  Ar: 0x80d1e3,
};

// Covalent radii (used for orbital lobes so lobes properly overlap bonds)
export const ELEMENT_RADII: Record<string, number> = {
  H: 0.31, He: 0.28,
  Li: 1.28, Be: 0.96, B: 0.85,
  C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58,
  Na: 1.66, Mg: 1.41, Al: 1.21,
  Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06,
  K: 2.03, Ca: 1.76,
  Fe: 1.32, Cu: 1.32, Zn: 1.22, Mn: 1.39,
  Br: 1.20, I: 1.39,
};

// Van der Waals radii (used for space-filling / CPK display)
const VDW_RADII: Record<string, number> = {
  H: 1.20, He: 1.40,
  Li: 1.82, Be: 1.53, B: 1.92,
  C: 1.70, N: 1.55, O: 1.52, F: 1.47, Ne: 1.54,
  Na: 2.27, Mg: 1.73, Al: 1.84,
  Si: 2.10, P: 1.80, S: 1.80, Cl: 1.75, Ar: 1.88,
  K: 2.75, Ca: 2.31,
  Fe: 2.04, Cu: 2.00, Zn: 2.10, Mn: 2.05,
  Br: 1.85, I: 1.98,
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

/** Covalent radius — used for orbital lobe sizing */
export function getCovalentRadius(element: string): number {
  return ELEMENT_RADII[element] ?? 0.7;
}

/** Visual radius — used for atom sphere display (0.3 × the van der Waals radius) */
export function getVisualRadius(element: string): number {
  return VISUAL_RADIUS_SCALE * getVdwRadius(element);
}

/** Van der Waals radius — used for space-filling (CPK) display */
export function getVdwRadius(element: string): number {
  return VDW_RADII[element] ?? 1.50;
}
