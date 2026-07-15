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
  H: 0.25,
  C: 0.7,
  N: 0.65,
  O: 0.6,
  F: 0.5,
  P: 1.0,
  S: 1.0,
  Cl: 0.35,
  Br: 0.4,
  I: 0.45,
  B: 0.85,
  Si: 1.1,
};

export function getElementColor(element: string): number {
  return ELEMENT_COLORS[element] ?? 0xcc88ff;
}

export function getElementRadius(element: string): number {
  return ELEMENT_RADII[element] ?? 0.5;
}
