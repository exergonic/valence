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
  H: 0.40,
  He: 0.50,
  Li: 0.65,
  Be: 0.55,
  B: 0.67,
  C: 0.60,
  N: 0.54,
  O: 0.53,
  F: 0.51,
  Ne: 0.54,
  Na: 0.80,
  Mg: 0.61,
  Al: 0.64,
  Si: 0.74,
  P: 0.63,
  S: 0.63,
  Cl: 0.61,
  Ar: 0.66,
  K: 0.96,
  Ca: 0.81,
  Fe: 0.68,
  Cu: 0.65,
  Zn: 0.49,
  Mn: 0.63,
  Br: 0.65,
  I: 0.69,
};

export function getElementColor(element: string): number {
  return ELEMENT_COLORS[element] ?? 0xcc88ff;
}

export function getElementRadius(element: string): number {
  return ELEMENT_RADII[element] ?? 0.5;
}
