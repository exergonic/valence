// Van der Waals radii (Å) — the chemistry data the space-filling renderer,
// the ESP surface field, and any future surface work share. Lives here (the
// chem layer) so the ESP field construction doesn't reach into render.
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

/** Van der Waals radius — used for space-filling (CPK) and the ESP surface. */
export function getVdwRadius(element: string): number {
  return VDW_RADII[element] ?? 1.50;
}

// Covalent radii (Å), Cordero et al. 2008 — the standard single-bond set. Used
// to give the geometry embedder a chemically plausible starting scale: place3D
// emits a unit skeleton, and a quantum refiner started from 1 Å bonds is far
// from any minimum (GFN2 stalled near 1.5 Å for PCl5 instead of reaching 2.0+).
const COVALENT_RADII: Record<string, number> = {
  H: 0.31, He: 0.28,
  Li: 1.28, Be: 0.96, B: 0.84,
  C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58,
  Na: 1.66, Mg: 1.41, Al: 1.21,
  Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06,
  K: 2.03, Ca: 1.76,
  Mn: 1.39, Fe: 1.32, Cu: 1.32, Zn: 1.22,
  Br: 1.20, I: 1.39,
};

/** Covalent radius — the sum over a bond is a good first guess at its length. */
export function getCovalentRadius(element: string): number {
  return COVALENT_RADII[element] ?? 1.40;
}