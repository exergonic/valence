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

export function getElementColor(element: string): number {
  return ELEMENT_COLORS[element] ?? 0xcc88ff;
}

export function getElementRadius(element: string): number {
  return ELEMENT_RADII[element] ?? 0.7;
}
